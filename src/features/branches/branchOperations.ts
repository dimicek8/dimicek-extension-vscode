import * as vscode from 'vscode';
import { GitError } from '../../git/gitError';
import type { Repository } from '../../git/repository';
import type { ChangesModel } from '../commit/changesModel';
import type { BranchRef } from './branchEntries';

export type Choose = (
  message: string,
  detail: string,
  options: string[],
) => Thenable<string | undefined>;

const modalChoose: Choose = (message, detail, options) =>
  vscode.window.showWarningMessage(message, { modal: true, detail }, ...options);

type SwitchAction = (options: { force?: boolean }) => Promise<void>;

const SMART_CHECKOUT = 'Smart Checkout';
const FORCE_CHECKOUT = 'Force Checkout';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class BranchOperations {
  choose: Choose = modalChoose;

  constructor(
    private readonly model: ChangesModel,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  private async perform(
    title: string,
    operation: (repository: Repository) => Promise<boolean | void>,
  ): Promise<boolean> {
    const repository = this.model.repository;
    if (!repository) {
      void vscode.window.showWarningMessage('No Git repository is open.');
      return false;
    }
    try {
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title },
        () => operation(repository),
      );
      return result !== false;
    } catch (error) {
      this.output.error(`${title} failed: ${errorMessage(error)}`);
      void vscode.window.showErrorMessage(`${title} failed: ${errorMessage(error)}`);
      return false;
    } finally {
      await this.model.refresh();
    }
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
    return this.perform('Fetching…', async (repository) => {
      await repository.fetch();
      vscode.window.setStatusBarMessage('$(check) Fetched', 3000);
    });
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
}
