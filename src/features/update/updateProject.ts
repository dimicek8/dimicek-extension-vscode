import * as vscode from 'vscode';
import { GitError } from '../../git/gitError';
import type { ChangesModel } from '../commit/changesModel';
import { errorMessage, runOperation, showConflictWarning } from '../operations';

export type UpdateMethod = 'merge' | 'rebase';

export const UPDATE_METHOD_SETTING = 'dimicek.update.method';

interface MethodItem extends vscode.QuickPickItem {
  method?: UpdateMethod;
  remember?: boolean;
}

const METHOD_ITEMS: MethodItem[] = [
  {
    label: 'Merge',
    detail: 'Merge the upstream branch into the current branch.',
    method: 'merge',
  },
  {
    label: 'Rebase',
    detail: 'Rebase the current branch on top of the upstream branch.',
    method: 'rebase',
  },
  { label: '', kind: vscode.QuickPickItemKind.Separator },
  {
    label: 'Always Merge',
    description: 'don’t ask again',
    method: 'merge',
    remember: true,
  },
  {
    label: 'Always Rebase',
    description: 'don’t ask again',
    method: 'rebase',
    remember: true,
  },
];

function commits(count: number): string {
  return count === 1 ? '1 commit' : `${count} commits`;
}

export class UpdateProject {
  constructor(
    private readonly model: ChangesModel,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  async chooseMethod(): Promise<UpdateMethod | undefined> {
    const configured = vscode.workspace
      .getConfiguration()
      .get<'ask' | UpdateMethod>(UPDATE_METHOD_SETTING, 'ask');
    if (configured !== 'ask') {
      return configured;
    }
    const picked = await vscode.window.showQuickPick(METHOD_ITEMS, {
      title: 'Update Project',
      placeHolder: 'How should the upstream changes be applied?',
    });
    if (picked?.remember && picked.method) {
      await vscode.workspace
        .getConfiguration()
        .update(UPDATE_METHOD_SETTING, picked.method, vscode.ConfigurationTarget.Global);
    }
    return picked?.method;
  }

  async run(method?: UpdateMethod): Promise<boolean> {
    const { head: branch, upstream } = this.model.branch;
    if (!this.model.repository) {
      void vscode.window.showWarningMessage('No Git repository is open.');
      return false;
    }
    if (!branch) {
      void vscode.window.showWarningMessage('Cannot update: HEAD is detached.');
      return false;
    }
    if (!upstream) {
      void vscode.window.showWarningMessage(
        `Cannot update: branch '${branch}' has no upstream branch. Push it first to set one.`,
      );
      return false;
    }
    const chosen = method ?? (await this.chooseMethod());
    if (!chosen) {
      return false;
    }

    const stashMessage = `Dimicek: update of ${branch}`;
    return runOperation(
      this.model,
      this.output,
      `Updating ${branch}`,
      async (repository, progress) => {
        const before = await repository.resolveRevision('HEAD');

        progress.report({ message: 'Fetching…' });
        await repository.fetch();

        const { entries } = await repository.getStatus();
        const dirty = entries.some((entry) => entry.kind === 'changed');
        if (dirty) {
          progress.report({ message: 'Saving local changes to the stash…' });
          await repository.stash(stashMessage, { includeUntracked: false });
        }

        progress.report({ message: chosen === 'merge' ? 'Merging…' : 'Rebasing…' });
        try {
          if (chosen === 'merge') {
            await repository.merge('@{upstream}');
          } else {
            await repository.rebase('@{upstream}');
          }
        } catch (error) {
          if (!(error instanceof GitError && error.code === 'Conflict')) {
            throw error;
          }
          const stashNote = dirty
            ? ` Your local changes are saved in the stash '${stashMessage}'; restore them after resolving the conflicts.`
            : '';
          const next =
            chosen === 'merge'
              ? 'Resolve them in the Changes view and commit, or choose Abort Merge in the branches popup.'
              : 'Resolve them, mark the files as resolved and choose Continue Rebase in the branches popup.';
          showConflictWarning(
            `Updating '${branch}' stopped because of conflicts. ${next}${stashNote}`,
          );
          return true;
        }

        if (dirty) {
          progress.report({ message: 'Restoring local changes…' });
          try {
            await repository.stashPop();
          } catch (error) {
            this.output.warn(`Restoring local changes failed: ${errorMessage(error)}`);
            void vscode.window.showWarningMessage(
              `'${branch}' was updated, but your local changes could not be restored cleanly. Resolve the conflicts; the stash '${stashMessage}' was kept.`,
            );
            return true;
          }
        }

        const after = await repository.resolveRevision('HEAD');
        const pulled = before === after ? 0 : await repository.countCommits(before, after);
        const summary =
          pulled === 0
            ? `'${branch}' is already up to date`
            : `Updated '${branch}' with ${chosen}: ${commits(pulled)}`;
        this.output.info(summary);
        vscode.window.setStatusBarMessage(`$(check) ${summary}`, 5000);
        return true;
      },
      vscode.ProgressLocation.Notification,
    );
  }
}
