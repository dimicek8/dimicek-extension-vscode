import * as vscode from 'vscode';
import type { Repository, ResetMode } from '../../git/repository';
import type { BranchOperations } from '../branches/branchOperations';
import type { ChangesModel } from '../commit/changesModel';
import { showFileComparison, WORKING_TREE } from '../fileComparison';
import { type Choose, continueOnConflict, modalChoose, runOperation } from '../operations';
import type { LogModel } from './logModel';

export interface CommitContext {
  hash: string;
  merge?: boolean;
}

const RESET_MODES: Array<{ mode: ResetMode; label: string; detail: string }> = [
  {
    mode: 'soft',
    label: 'Soft',
    detail: 'Files won’t change, differences will be staged for commit.',
  },
  {
    mode: 'mixed',
    label: 'Mixed',
    detail: 'Files won’t change, differences won’t be staged.',
  },
  {
    mode: 'hard',
    label: 'Hard',
    detail:
      'Files will be reverted to the state of the selected commit. Local changes will be lost.',
  },
  {
    mode: 'keep',
    label: 'Keep',
    detail: 'Files will be reverted to the selected commit, but local changes will be kept.',
  },
];

function short(hash: string): string {
  return hash.slice(0, 8);
}

export class LogActions {
  choose: Choose = modalChoose;

  constructor(
    private readonly changes: ChangesModel,
    private readonly log: LogModel,
    private readonly branches: BranchOperations,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  private async perform(
    title: string,
    operation: (repository: Repository) => Promise<boolean | void>,
  ): Promise<boolean> {
    const result = await runOperation(this.changes, this.output, title, operation);
    await this.log.reload();
    return result;
  }

  async copyRevision(hash: string): Promise<void> {
    await vscode.env.clipboard.writeText(hash);
    vscode.window.setStatusBarMessage(`$(copy) Copied ${hash}`, 3000);
  }

  newBranch(hash: string): Promise<boolean> {
    return this.branches.promptNewBranch(hash, short(hash));
  }

  async checkoutRevision(hash: string): Promise<boolean> {
    const result = await this.branches.checkoutRevision(hash);
    await this.log.reload();
    return result;
  }

  createTag(hash: string, name: string, message?: string): Promise<boolean> {
    return this.perform(`Creating tag ${name}…`, (repository) =>
      repository.createTag(name, hash, message),
    );
  }

  async promptNewTag(hash: string): Promise<boolean> {
    const repository = this.changes.repository;
    if (!repository) {
      return false;
    }
    const existing = new Set(
      (await repository.getRefs()).filter((ref) => ref.type === 'tag').map((ref) => ref.name),
    );
    const name = await vscode.window.showInputBox({
      title: `New Tag on ${short(hash)}`,
      prompt: 'Tag name',
      placeHolder: 'v1.2.3',
      validateInput: async (value) => {
        const trimmed = value.trim();
        if (trimmed === '') {
          return 'Enter a tag name.';
        }
        if (existing.has(trimmed)) {
          return `Tag '${trimmed}' already exists.`;
        }
        return (await repository.isValidTagName(trimmed))
          ? undefined
          : `'${trimmed}' is not a valid tag name.`;
      },
    });
    if (!name) {
      return false;
    }
    const message = await vscode.window.showInputBox({
      title: `New Tag '${name.trim()}'`,
      prompt: 'Message (optional). With a message, an annotated tag is created.',
    });
    if (message === undefined) {
      return false;
    }
    return this.createTag(hash, name.trim(), message.trim() || undefined);
  }

  cherryPick(hash: string): Promise<boolean> {
    return this.perform(`Cherry-picking ${short(hash)}…`, (repository) =>
      continueOnConflict(
        () => repository.cherryPick(hash),
        `Cherry-picking ${short(hash)} stopped because of conflicts. Resolve them, mark the files as resolved and choose Continue Cherry-Pick in the branches popup.`,
      ),
    );
  }

  revert(hash: string): Promise<boolean> {
    return this.perform(`Reverting ${short(hash)}…`, (repository) =>
      continueOnConflict(
        () => repository.revert(hash),
        `Reverting ${short(hash)} stopped because of conflicts. Resolve them, mark the files as resolved and choose Continue Revert in the branches popup.`,
      ),
    );
  }

  reset(hash: string, mode: ResetMode): Promise<boolean> {
    return this.perform(`Resetting to ${short(hash)}…`, (repository) =>
      repository.reset(hash, mode),
    );
  }

  async promptReset(hash: string): Promise<boolean> {
    const branch = this.changes.branch.head ?? 'HEAD';
    const picked = await vscode.window.showQuickPick(
      RESET_MODES.map((option) => ({ ...option, description: `--${option.mode}` })),
      { title: `Reset '${branch}' to ${short(hash)}`, placeHolder: 'Choose how to reset' },
    );
    if (!picked) {
      return false;
    }
    if (picked.mode === 'hard') {
      const choice = await this.choose(
        `Hard reset '${branch}' to ${short(hash)}?`,
        'All local changes and the commits after the selected one will be discarded.',
        ['Reset'],
      );
      if (choice !== 'Reset') {
        return false;
      }
    }
    return this.reset(hash, picked.mode);
  }

  async compareWithLocal(hash: string): Promise<void> {
    const repository = this.changes.repository;
    if (!repository) {
      return;
    }
    const files = await repository.diffWithWorkingTree(hash);
    if (files.length === 0) {
      void vscode.window.showInformationMessage(
        `The working tree has the same content as ${short(hash)}.`,
      );
      return;
    }
    showFileComparison({
      root: repository.root,
      title: `Compare ${short(hash)} with the working tree — ${files.length} files differ`,
      left: hash,
      right: WORKING_TREE,
      files,
    });
  }
}
