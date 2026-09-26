import * as vscode from 'vscode';
import { GitError } from '../../git/gitError';
import type { LocalBranch } from '../../git/parsers/refs';
import type { Repository } from '../../git/repository';
import { showFileComparison } from '../fileComparison';
import type { ChangesModel } from '../commit/changesModel';
import {
  type Choose,
  continueOnConflict,
  errorMessage,
  modalChoose,
  runOperation,
} from '../operations';
import type { BranchRef } from './branchEntries';

type SwitchAction = (options: { force?: boolean }) => Promise<void>;

const SMART_CHECKOUT = 'Smart Checkout';
const FORCE_CHECKOUT = 'Force Checkout';

export class BranchOperations {
  choose: Choose = modalChoose;

  constructor(
    private readonly model: ChangesModel,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  private perform(
    title: string,
    operation: (repository: Repository) => Promise<boolean | void>,
  ): Promise<boolean> {
    return runOperation(this.model, this.output, title, operation);
  }

  private async switchWith(
    repository: Repository,
    target: string,
    action: SwitchAction,
  ): Promise<boolean> {
    try {
      await action({});
      return true;
    } catch (error) {
      if (!(error instanceof GitError && error.code === 'LocalChangesOverwritten')) {
        throw error;
      }
    }
    const choice = await this.choose(
      `Your local changes would be overwritten by checking out '${target}'.`,
      'Smart Checkout stashes your changes, checks out and restores them. Force Checkout discards your local changes.',
      [SMART_CHECKOUT, FORCE_CHECKOUT],
    );
    if (choice === FORCE_CHECKOUT) {
      await action({ force: true });
      return true;
    }
    if (choice !== SMART_CHECKOUT) {
      return false;
    }
    await repository.stash(`Dimicek: smart checkout of ${target}`);
    await action({});
    try {
      await repository.stashPop();
    } catch (error) {
      this.output.warn(`Restoring stashed changes failed: ${errorMessage(error)}`);
      void vscode.window.showWarningMessage(
        'Checked out, but your stashed local changes could not be restored cleanly. Resolve the conflicts; the stash was kept.',
      );
    }
    return true;
  }

  checkout(ref: BranchRef): Promise<boolean> {
    return this.perform(`Checking out ${ref.name}…`, async (repository) => {
      if (ref.type === 'branch') {
        return this.switchWith(repository, ref.name, (options) =>
          repository.switchBranch(ref.name, options),
        );
      }
      const refs = await repository.getRefs();
      const existing = refs.find(
        (candidate) => candidate.type === 'branch' && candidate.name === ref.branch,
      );
      return this.switchWith(repository, ref.name, (options) =>
        existing
          ? repository.switchBranch(ref.branch, options)
          : repository.switchToRemoteBranch(ref.name, ref.branch, options),
      );
    });
  }

  checkoutRevision(revision: string): Promise<boolean> {
    return this.perform(`Checking out ${revision}…`, (repository) =>
      this.switchWith(repository, revision, (options) =>
        repository.switchDetached(revision, options),
      ),
    );
  }

  createBranch(name: string, startPoint: string): Promise<boolean> {
    return this.perform(`Creating branch ${name}…`, (repository) =>
      this.switchWith(repository, name, (options) =>
        repository.createBranch(name, startPoint, { checkout: true, ...options }),
      ),
    );
  }

  fetch(): Promise<boolean> {
    return runOperation(
      this.model,
      this.output,
      'Fetching from all remotes…',
      async (repository) => {
        await repository.fetch();
        vscode.window.setStatusBarMessage('$(check) Fetched', 3000);
      },
      vscode.ProgressLocation.Notification,
    );
  }

  async promptNewBranch(startPoint: string, startLabel: string): Promise<boolean> {
    const repository = this.model.repository;
    if (!repository) {
      return false;
    }
    const existing = new Set(
      (await repository.getRefs()).filter((ref) => ref.type === 'branch').map((ref) => ref.name),
    );
    const name = await vscode.window.showInputBox({
      title: `New Branch from '${startLabel}'`,
      prompt: 'Name of the new branch. It will be checked out.',
      placeHolder: 'feature/my-change',
      validateInput: async (value) => {
        const trimmed = value.trim();
        if (trimmed === '') {
          return 'Enter a branch name.';
        }
        if (existing.has(trimmed)) {
          return `Branch '${trimmed}' already exists.`;
        }
        return (await repository.isValidBranchName(trimmed))
          ? undefined
          : `'${trimmed}' is not a valid branch name.`;
      },
    });
    return name ? this.createBranch(name.trim(), startPoint) : false;
  }

  async promptCheckoutRevision(): Promise<boolean> {
    const repository = this.model.repository;
    if (!repository) {
      return false;
    }
    const tags = (await repository.getRefs())
      .filter((ref) => ref.type === 'tag')
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem & { revision: string }>();
    quickPick.title = 'Checkout Tag or Revision';
    quickPick.placeholder = 'Tag name, commit hash or any revision (e.g. HEAD~3)';
    const tagItems = tags.map((tag) => ({
      label: tag.name,
      description: tag.commit.slice(0, 8),
      iconPath: new vscode.ThemeIcon('tag'),
      revision: tag.name,
    }));
    quickPick.items = tagItems;
    quickPick.onDidChangeValue((value) => {
      const typed = value.trim();
      const custom =
        typed && !tags.some((tag) => tag.name === typed)
          ? [{ label: `Checkout '${typed}'`, alwaysShow: true, revision: typed }]
          : [];
      quickPick.items = [...custom, ...tagItems];
    });

    const revision = await new Promise<string | undefined>((resolve) => {
      quickPick.onDidAccept(() => {
        resolve(quickPick.selectedItems[0]?.revision);
        quickPick.hide();
      });
      quickPick.onDidHide(() => resolve(undefined));
      quickPick.show();
    });
    quickPick.dispose();

    if (!revision) {
      return false;
    }
    if (!(await repository.revisionExists(revision))) {
      void vscode.window.showErrorMessage(`Revision '${revision}' does not exist.`);
      return false;
    }
    return this.checkoutRevision(revision);
  }

  merge(ref: BranchRef, currentName: string): Promise<boolean> {
    return this.perform(`Merging ${ref.name} into ${currentName}…`, (repository) =>
      continueOnConflict(
        () => repository.merge(ref.name),
        `Merging '${ref.name}' stopped because of conflicts. Resolve them in the Changes view and commit, or choose Abort Merge in the branches popup.`,
      ),
    );
  }

  rebaseCurrentOnto(ref: BranchRef, currentName: string): Promise<boolean> {
    return this.perform(`Rebasing ${currentName} onto ${ref.name}…`, (repository) =>
      continueOnConflict(
        () => repository.rebase(ref.name),
        `Rebasing '${currentName}' stopped because of conflicts. Resolve them, mark the files as resolved and choose Continue Rebase in the branches popup.`,
      ),
    );
  }

  checkoutAndRebase(ref: LocalBranch, currentName: string): Promise<boolean> {
    return this.perform(`Rebasing ${ref.name} onto ${currentName}…`, (repository) =>
      continueOnConflict(
        () => repository.rebase(currentName, ref.name),
        `Rebasing '${ref.name}' stopped because of conflicts. Resolve them, mark the files as resolved and choose Continue Rebase in the branches popup.`,
      ),
    );
  }

  continueRebase(): Promise<boolean> {
    return this.continueOperation('rebase', 'rebase');
  }

  continueCherryPick(): Promise<boolean> {
    return this.continueOperation('cherryPick', 'cherry-pick');
  }

  continueRevert(): Promise<boolean> {
    return this.continueOperation('revert', 'revert');
  }

  abortCherryPick(): Promise<boolean> {
    return this.perform('Aborting cherry-pick…', (repository) =>
      repository.abortOperation('cherryPick'),
    );
  }

  abortRevert(): Promise<boolean> {
    return this.perform('Aborting revert…', (repository) => repository.abortOperation('revert'));
  }

  private continueOperation(
    kind: 'rebase' | 'cherryPick' | 'revert',
    name: string,
  ): Promise<boolean> {
    return this.perform(`Continuing ${name}…`, async (repository) => {
      const { entries } = await repository.getStatus();
      if (entries.some((entry) => entry.kind === 'conflicted')) {
        void vscode.window.showWarningMessage(
          'Some files still have conflicts. Resolve them and mark them as resolved first.',
        );
        return false;
      }
      await continueOnConflict(
        () => repository.continueOperation(kind),
        `The next commit of the ${name} has conflicts too. Resolve them and continue again.`,
      );
      return true;
    });
  }

  abortRebase(): Promise<boolean> {
    return this.perform('Aborting rebase…', (repository) => repository.abortRebase());
  }

  abortMerge(): Promise<boolean> {
    return this.perform('Aborting merge…', (repository) => repository.abortMerge());
  }

  push(branch: LocalBranch): Promise<boolean> {
    return this.perform(`Pushing ${branch.name}…`, async (repository) => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Pushing ${branch.name}…` },
        () => repository.push(branch.name),
      );
      vscode.window.setStatusBarMessage(`$(check) Pushed ${branch.name}`, 5000);
    });
  }

  update(branch: LocalBranch): Promise<boolean> {
    return this.perform(`Updating ${branch.name}…`, (repository) =>
      continueOnConflict(
        () => repository.update(branch.name),
        `Updating '${branch.name}' stopped because of conflicts. Resolve them in the Changes view and commit, or choose Abort Merge in the branches popup.`,
      ),
    );
  }

  rename(branch: LocalBranch, newName: string): Promise<boolean> {
    return this.perform(`Renaming ${branch.name}…`, (repository) =>
      repository.renameBranch(branch.name, newName),
    );
  }

  async promptRename(branch: LocalBranch): Promise<boolean> {
    const repository = this.model.repository;
    if (!repository) {
      return false;
    }
    const existing = new Set(
      (await repository.getRefs()).filter((ref) => ref.type === 'branch').map((ref) => ref.name),
    );
    const name = await vscode.window.showInputBox({
      title: `Rename Branch '${branch.name}'`,
      value: branch.name,
      validateInput: async (value) => {
        const trimmed = value.trim();
        if (trimmed === '' || trimmed === branch.name) {
          return 'Enter a new branch name.';
        }
        if (existing.has(trimmed)) {
          return `Branch '${trimmed}' already exists.`;
        }
        return (await repository.isValidBranchName(trimmed))
          ? undefined
          : `'${trimmed}' is not a valid branch name.`;
      },
    });
    return name ? this.rename(branch, name.trim()) : false;
  }

  delete(ref: BranchRef): Promise<boolean> {
    return this.perform(`Deleting ${ref.name}…`, async (repository) => {
      if (ref.type === 'remoteBranch') {
        const choice = await this.choose(
          `Delete remote branch '${ref.name}'?`,
          `The branch '${ref.branch}' will be deleted from '${ref.remote}' for everyone.`,
          ['Delete'],
        );
        if (choice !== 'Delete') {
          return false;
        }
        await repository.deleteRemoteBranch(ref.remote, ref.branch);
        return true;
      }
      try {
        await repository.deleteBranch(ref.name);
      } catch (error) {
        if (!(error instanceof GitError && error.code === 'BranchNotFullyMerged')) {
          throw error;
        }
        const choice = await this.choose(
          `Branch '${ref.name}' is not fully merged.`,
          'Its commits are not contained in the current branch or its upstream. Delete it anyway?',
          ['Delete'],
        );
        if (choice !== 'Delete') {
          return false;
        }
        await repository.deleteBranch(ref.name, { force: true });
      }
      vscode.window.setStatusBarMessage(`$(check) Deleted branch ${ref.name}`, 5000);
      return true;
    });
  }

  async compare(ref: BranchRef, currentName: string): Promise<void> {
    const repository = this.model.repository;
    if (!repository) {
      return;
    }
    const [files, counts] = await Promise.all([
      repository.diffNameStatus(currentName, ref.name),
      repository.countAheadBehind(currentName, ref.name),
    ]);
    if (files.length === 0) {
      void vscode.window.showInformationMessage(
        `'${ref.name}' and '${currentName}' have the same content.`,
      );
      return;
    }
    showFileComparison({
      root: repository.root,
      title: `Compare '${currentName}' with '${ref.name}' — ${counts.ahead} commits only in '${ref.name}', ${counts.behind} only in '${currentName}'`,
      left: currentName,
      right: ref.name,
      files,
    });
  }
}
