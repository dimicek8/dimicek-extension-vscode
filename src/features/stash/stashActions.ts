import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { NameStatusEntry } from '../../git/parsers/nameStatus';
import type { Stash } from '../../git/parsers/stash';
import { toEmptyUri, toGitUri } from '../../vscode/gitContentProvider';
import type { ChangesModel } from '../commit/changesModel';
import { type Choose, continueOnConflict, modalChoose, runOperation } from '../operations';
import type { StashTreeProvider } from './stashTree';

export class StashActions {
  choose: Choose = modalChoose;

  constructor(
    private readonly model: ChangesModel,
    private readonly tree: StashTreeProvider,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  private async perform(
    title: string,
    operation: Parameters<typeof runOperation>[3],
  ): Promise<boolean> {
    const result = await runOperation(this.model, this.output, title, operation);
    await this.tree.refresh();
    return result;
  }

  stash(message: string, includeUntracked: boolean): Promise<boolean> {
    return this.perform('Stashing changes…', async (repository) => {
      const { entries } = await repository.getStatus();
      const relevant = entries.filter(
        (entry) => entry.kind !== 'ignored' && (includeUntracked || entry.kind !== 'untracked'),
      );
      if (relevant.length === 0) {
        void vscode.window.showInformationMessage('There are no local changes to stash.');
        return false;
      }
      await repository.stash(message || 'Dimicek stash', { includeUntracked });
      return true;
    });
  }

  async promptStash(): Promise<boolean> {
    const message = await vscode.window.showInputBox({
      title: 'Stash Changes',
      prompt: 'Message for the stash (optional)',
    });
    if (message === undefined) {
      return false;
    }
    const scope = await vscode.window.showQuickPick(
      [
        { label: 'Tracked changes', detail: 'Stash modified and staged files.', untracked: false },
        {
          label: 'Tracked changes and untracked files',
          detail: 'Also stash new files that are not in Git yet.',
          untracked: true,
        },
      ],
      { title: 'Stash Changes', placeHolder: 'What should be stashed?' },
    );
    return scope ? this.stash(message.trim(), scope.untracked) : false;
  }

  apply(stash: Stash): Promise<boolean> {
    return this.perform(`Applying ${stash.ref}…`, (repository) =>
      continueOnConflict(
        () => repository.stashApply(stash.ref),
        `Applying '${stash.message}' caused conflicts. Resolve them in the Changes view; the stash was kept.`,
      ),
    );
  }

  pop(stash: Stash): Promise<boolean> {
    return this.perform(`Popping ${stash.ref}…`, (repository) =>
      continueOnConflict(
        () => repository.stashPop(stash.ref),
        `Popping '${stash.message}' caused conflicts. Resolve them in the Changes view; the stash was kept.`,
      ),
    );
  }

  async drop(stash: Stash): Promise<boolean> {
    const choice = await this.choose(
      `Drop stash '${stash.message}'?`,
      'The stashed changes will be lost.',
      ['Drop'],
    );
    if (choice !== 'Drop') {
      return false;
    }
    return this.perform(`Dropping ${stash.ref}…`, (repository) => repository.stashDrop(stash.ref));
  }

  async clear(): Promise<boolean> {
    const count = this.tree.entries.length;
    if (count === 0) {
      return false;
    }
    const choice = await this.choose(
      `Drop all ${count} stashes?`,
      'All stashed changes will be lost.',
      ['Clear'],
    );
    if (choice !== 'Clear') {
      return false;
    }
    return this.perform('Clearing stashes…', (repository) => repository.stashClear());
  }

  branch(stash: Stash, name: string): Promise<boolean> {
    return this.perform(`Creating branch ${name} from ${stash.ref}…`, (repository) =>
      repository.stashBranch(name, stash.ref),
    );
  }

  async promptBranch(stash: Stash): Promise<boolean> {
    const repository = this.model.repository;
    if (!repository) {
      return false;
    }
    const name = await vscode.window.showInputBox({
      title: `Unstash '${stash.message}' as Branch`,
      prompt: 'The branch starts at the commit the stash was created on.',
      validateInput: async (value) =>
        value.trim() === ''
          ? 'Enter a branch name.'
          : (await repository.isValidBranchName(value.trim()))
            ? undefined
            : `'${value.trim()}' is not a valid branch name.`,
    });
    return name ? this.branch(stash, name.trim()) : false;
  }

  async showDiff(stash: Stash, file: NameStatusEntry): Promise<void> {
    const repository = this.model.repository;
    if (!repository) {
      return;
    }
    const root = repository.root;
    const left =
      file.status === 'added'
        ? toEmptyUri(root, file.path)
        : toGitUri(root, file.originalPath ?? file.path, `${stash.hash}^1`);
    let right = toEmptyUri(root, file.path);
    if (file.status !== 'deleted') {
      const revision = (await repository.pathExistsAt(stash.hash, file.path))
        ? stash.hash
        : `${stash.hash}^3`;
      right = toGitUri(root, file.path, revision);
    }
    await vscode.commands.executeCommand(
      'vscode.diff',
      left,
      right,
      `${basename(file.path)} (${stash.ref})`,
      { preview: true },
    );
  }
}
