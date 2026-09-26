import { basename, dirname, join } from 'node:path';
import * as vscode from 'vscode';
import type { ConflictType } from '../../git/parsers/status';
import type { ChangesModel } from '../commit/changesModel';
import { errorMessage } from '../operations';
import { canMerge, conflictAction, conflictLabel, type ConflictSide } from './conflictResolution';

export interface ConflictFile {
  path: string;
  conflict: ConflictType;
}

interface ConflictItem extends vscode.QuickPickItem {
  file?: ConflictFile;
  all?: ConflictSide;
}

const YOURS_BUTTON: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('arrow-left'),
  tooltip: 'Accept Yours',
};
const THEIRS_BUTTON: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('arrow-right'),
  tooltip: 'Accept Theirs',
};
const MERGE_BUTTON: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('git-merge'),
  tooltip: 'Merge…',
};

export class ConflictResolver {
  constructor(
    private readonly model: ChangesModel,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  private async isRebasing(): Promise<boolean> {
    return (await this.model.repository?.getOperationState())?.kind === 'rebase';
  }

  async conflicts(): Promise<ConflictFile[]> {
    const repository = this.model.repository;
    if (!repository) {
      return [];
    }
    const { entries } = await repository.getStatus();
    return entries.flatMap((entry) =>
      entry.kind === 'conflicted' ? [{ path: entry.path, conflict: entry.conflict }] : [],
    );
  }

  async accept(paths: readonly string[], side: ConflictSide): Promise<boolean> {
    const repository = this.model.repository;
    if (!repository) {
      return false;
    }
    const rebasing = await this.isRebasing();
    const conflicts = await this.conflicts();
    try {
      for (const path of paths) {
        const file = conflicts.find((candidate) => candidate.path === path);
        if (file) {
          await repository.resolveConflict(path, conflictAction(file.conflict, side, rebasing));
        }
      }
      return true;
    } catch (error) {
      this.output.error(`Resolving conflicts failed: ${errorMessage(error)}`);
      void vscode.window.showErrorMessage(`Resolving conflicts failed: ${errorMessage(error)}`);
      return false;
    } finally {
      await this.model.refresh();
    }
  }

  async openMergeEditor(path: string): Promise<void> {
    const root = this.model.repository?.root;
    if (!root) {
      return;
    }
    const uri = vscode.Uri.file(join(root, path));
    try {
      await vscode.commands.executeCommand('git.openMergeEditor', uri);
    } catch {
      await vscode.commands.executeCommand('vscode.open', uri);
    }
  }

  private async finishedMessage(): Promise<void> {
    const operation = await this.model.repository?.getOperationState();
    const next =
      operation?.kind === 'rebase'
        ? 'Choose Continue Rebase in the branches popup.'
        : operation?.kind === 'cherryPick'
          ? 'Choose Continue Cherry-Pick in the branches popup.'
          : operation?.kind === 'revert'
            ? 'Choose Continue Revert in the branches popup.'
            : 'Commit the result in the Commit view.';
    void vscode.window.showInformationMessage(`All conflicts are resolved. ${next}`);
  }

  private async items(rebasing: boolean): Promise<ConflictItem[]> {
    const conflicts = await this.conflicts();
    if (conflicts.length === 0) {
      return [];
    }
    return [
      { label: 'Accept Yours for All', iconPath: new vscode.ThemeIcon('arrow-left'), all: 'yours' },
      {
        label: 'Accept Theirs for All',
        iconPath: new vscode.ThemeIcon('arrow-right'),
        all: 'theirs',
      },
      { label: 'Files', kind: vscode.QuickPickItemKind.Separator },
      ...conflicts.map((file) => ({
        label: basename(file.path),
        description: dirname(file.path) === '.' ? undefined : dirname(file.path),
        detail: conflictLabel(file.conflict, rebasing),
        iconPath: new vscode.ThemeIcon('warning'),
        buttons: canMerge(file.conflict)
          ? [YOURS_BUTTON, THEIRS_BUTTON, MERGE_BUTTON]
          : [YOURS_BUTTON, THEIRS_BUTTON],
        file,
      })),
    ];
  }

  async show(): Promise<void> {
    if (!this.model.repository) {
      void vscode.window.showWarningMessage('No Git repository is open.');
      return;
    }
    const rebasing = await this.isRebasing();
    const quickPick = vscode.window.createQuickPick<ConflictItem>();
    quickPick.title = rebasing
      ? 'Resolve Conflicts — Yours: your commit being rebased · Theirs: the branch you rebase onto'
      : 'Resolve Conflicts — Yours: current branch · Theirs: the branch being merged';
    quickPick.placeholder =
      'Enter opens a file in the Merge Editor; use the buttons to accept a side';
    quickPick.ignoreFocusOut = true;
    quickPick.matchOnDescription = true;

    const reload = async () => {
      quickPick.busy = true;
      const items = await this.items(rebasing);
      quickPick.busy = false;
      if (items.length === 0) {
        quickPick.hide();
        await this.finishedMessage();
        return;
      }
      quickPick.items = items;
    };

    quickPick.onDidTriggerItemButton(async ({ item, button }) => {
      if (!item.file) {
        return;
      }
      if (button === MERGE_BUTTON) {
        await this.openMergeEditor(item.file.path);
        return;
      }
      await this.accept([item.file.path], button === YOURS_BUTTON ? 'yours' : 'theirs');
      await reload();
    });
    quickPick.onDidAccept(async () => {
      const item = quickPick.selectedItems[0];
      if (item?.all) {
        await this.accept(
          (await this.conflicts()).map((file) => file.path),
          item.all,
        );
        await reload();
      } else if (item?.file && canMerge(item.file.conflict)) {
        await this.openMergeEditor(item.file.path);
      }
    });
    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
    await reload();
  }
}
