import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import * as vscode from 'vscode';
import type { ChangesModel } from './changesModel';
import { type FileChange, rollbackPlan } from './fileChanges';
import { appendIgnorePatterns } from './gitignore';

export type Confirm = (message: string, detail: string, action: string) => Thenable<boolean>;

const modalConfirm: Confirm = async (message, detail, action) =>
  (await vscode.window.showWarningMessage(message, { modal: true, detail }, action)) === action;

const MAX_LISTED_FILES = 10;

function describeFiles(changes: readonly FileChange[]): string {
  const listed = changes.slice(0, MAX_LISTED_FILES).map((change) => change.path);
  const more = changes.length - listed.length;
  return more > 0 ? [...listed, `…and ${more} more`].join('\n') : listed.join('\n');
}

function subject(changes: readonly FileChange[]): string {
  return changes.length === 1 ? basename(changes[0]!.path) : `${changes.length} files`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ChangeActions {
  confirm: Confirm = modalConfirm;
  useTrash = true;

  constructor(
    private readonly model: ChangesModel,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  private async perform(title: string, operation: () => Promise<void>): Promise<boolean> {
    try {
      await operation();
      return true;
    } catch (error) {
      this.output.error(`${title} failed: ${errorMessage(error)}`);
      void vscode.window.showErrorMessage(`${title} failed: ${errorMessage(error)}`);
      return false;
    } finally {
      await this.model.refresh();
    }
  }

  async rollback(changes: readonly FileChange[]): Promise<boolean> {
    const repository = this.model.repository;
    const eligible = changes.filter(
      (change) => change.kind !== 'unversioned' && change.kind !== 'conflicted',
    );
    if (!repository || eligible.length === 0) {
      return false;
    }
    const confirmed = await this.confirm(
      `Rollback changes in ${subject(eligible)}?`,
      `${describeFiles(eligible)}\n\nLocal changes will be lost. Added files stay on disk as unversioned.`,
      'Rollback',
    );
    if (!confirmed) {
      return false;
    }
    return this.perform('Rollback', () => repository.rollback(rollbackPlan(eligible)));
  }

  async addToVcs(changes: readonly FileChange[]): Promise<boolean> {
    const repository = this.model.repository;
    const paths = changes
      .filter((change) => change.kind === 'unversioned')
      .map((change) => change.path);
    if (!repository || paths.length === 0) {
      return false;
    }
    const added = await this.perform('Add to VCS', () => repository.add(paths));
    if (added) {
      this.model.setIncluded(paths, true);
    }
    return added;
  }

  async markResolved(changes: readonly FileChange[]): Promise<boolean> {
    const repository = this.model.repository;
    const paths = changes
      .filter((change) => change.kind === 'conflicted')
      .map((change) => change.path);
    if (!repository || paths.length === 0) {
      return false;
    }
    return this.perform('Mark as Resolved', () => repository.add(paths));
  }

  async ignore(patterns: readonly string[]): Promise<boolean> {
    const root = this.model.repository?.root;
    if (!root || patterns.length === 0) {
      return false;
    }
    const file = join(root, '.gitignore');
    return this.perform('Ignore', async () => {
      const existing = await readFile(file, 'utf8').catch(() => '');
      const updated = appendIgnorePatterns(existing, patterns);
      if (updated !== existing) {
        await writeFile(file, updated);
      }
    });
  }

  async delete(changes: readonly FileChange[]): Promise<boolean> {
    const root = this.model.repository?.root;
    const existing = changes.filter((change) => change.kind !== 'deleted');
    if (!root || existing.length === 0) {
      return false;
    }
    const confirmed = await this.confirm(
      `Delete ${subject(existing)}?`,
      `${describeFiles(existing)}\n\n${this.useTrash ? 'Files will be moved to the trash.' : 'Files will be deleted permanently.'}`,
      'Delete',
    );
    if (!confirmed) {
      return false;
    }
    return this.perform('Delete', async () => {
      for (const change of existing) {
        await vscode.workspace.fs.delete(vscode.Uri.file(join(root, change.path)), {
          useTrash: this.useTrash,
        });
      }
    });
  }

  async openFiles(changes: readonly FileChange[]): Promise<void> {
    const root = this.model.repository?.root;
    if (!root) {
      return;
    }
    const existing = changes.filter((change) => change.kind !== 'deleted');
    for (const change of existing) {
      await vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(join(root, change.path)),
        {
          preview: existing.length === 1,
        },
      );
    }
  }
}
