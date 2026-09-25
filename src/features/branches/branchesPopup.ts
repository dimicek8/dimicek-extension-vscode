import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { ChangesModel } from '../commit/changesModel';
import type { BranchFavorites } from './branchFavorites';
import {
  type BranchCommand,
  type BranchEntry,
  type BranchRef,
  buildBranchEntries,
} from './branchEntries';
import type { BranchOperations } from './branchOperations';

interface EntryItem extends vscode.QuickPickItem {
  entry?: BranchEntry;
}

export interface BranchAction extends vscode.QuickPickItem {
  run?: () => Promise<unknown>;
}

function toItem(entry: BranchEntry): EntryItem {
  switch (entry.kind) {
    case 'separator':
      return { label: entry.label, kind: vscode.QuickPickItemKind.Separator };
    case 'command':
      return { label: entry.label, iconPath: new vscode.ThemeIcon(entry.icon), entry };
    case 'branch':
      return {
        label: entry.label,
        description: entry.current
          ? ['current', entry.description].filter(Boolean).join(' · ')
          : entry.description,
        iconPath: new vscode.ThemeIcon(entry.icon),
        buttons: [
          {
            iconPath: new vscode.ThemeIcon(entry.favorite ? 'star-full' : 'star-empty'),
            tooltip: entry.favorite ? 'Remove from Favorites' : 'Add to Favorites',
          },
        ],
        entry,
      };
  }
}

function action(label: string, icon: string, run: () => Promise<unknown>): BranchAction {
  return { label, iconPath: new vscode.ThemeIcon(icon), run };
}

function separator(): BranchAction {
  return { label: '', kind: vscode.QuickPickItemKind.Separator };
}

export class BranchesPopup {
  constructor(
    private readonly model: ChangesModel,
    private readonly favorites: BranchFavorites,
    private readonly operations: BranchOperations,
  ) {}

  async loadEntries(): Promise<BranchEntry[]> {
    const repository = this.model.repository;
    if (!repository) {
      return [];
    }
    const [refs, recent, operation] = await Promise.all([
      repository.getRefs(),
      repository.getRecentCheckouts(),
      repository.getOperationState().catch(() => undefined),
    ]);
    return buildBranchEntries({
      refs,
      recent,
      favorites: this.favorites.get(repository.root),
      operation: operation?.kind,
    });
  }

  async show(): Promise<void> {
    const repository = this.model.repository;
    if (!repository) {
      void vscode.window.showInformationMessage('No Git repository is open.');
      return;
    }

    const quickPick = vscode.window.createQuickPick<EntryItem>();
    quickPick.title = `Branches — ${basename(repository.root)}`;
    quickPick.placeholder = 'Search branches';
    quickPick.matchOnDescription = true;
    quickPick.busy = true;
    quickPick.show();

    const load = async (keepActive?: string) => {
      quickPick.items = (await this.loadEntries()).map(toItem);
      const active = quickPick.items.find(
        (item) => item.entry?.kind === 'branch' && item.entry.ref.fullName === keepActive,
      );
      if (active) {
        quickPick.activeItems = [active];
      }
      quickPick.busy = false;
    };

    quickPick.onDidTriggerItemButton(async ({ item }) => {
      if (item.entry?.kind === 'branch') {
        await this.favorites.toggle(repository.root, item.entry.ref.fullName);
        await load(item.entry.ref.fullName);
      }
    });

    const accepted = new Promise<BranchEntry | undefined>((resolve) => {
      quickPick.onDidAccept(() => {
        resolve(quickPick.selectedItems[0]?.entry);
        quickPick.hide();
      });
      quickPick.onDidHide(() => resolve(undefined));
    });

    await load();
    const entry = await accepted;
    quickPick.dispose();
    if (entry?.kind === 'command') {
      await this.runCommand(entry.command);
    } else if (entry?.kind === 'branch') {
      await this.showBranchActions(entry.ref, entry.current);
    }
  }

  runCommand(command: BranchCommand): Promise<unknown> {
    switch (command) {
      case 'newBranch':
        return this.operations.promptNewBranch('HEAD', this.model.branch.head ?? 'HEAD');
      case 'checkoutRevision':
        return this.operations.promptCheckoutRevision();
      case 'fetch':
        return this.operations.fetch();
      case 'abortMerge':
        return this.operations.abortMerge();
      case 'continueRebase':
        return this.operations.continueRebase();
      case 'abortRebase':
        return this.operations.abortRebase();
    }
  }

  branchActions(ref: BranchRef, current: boolean): BranchAction[] {
    const ops = this.operations;
    const currentName = this.model.branch.head;
    const actions: BranchAction[] = [];

    if (!current) {
      actions.push(action('Checkout', 'check', () => ops.checkout(ref)));
    }
    actions.push(
      action(`New Branch from '${ref.name}'…`, 'add', () =>
        ops.promptNewBranch(ref.name, ref.name),
      ),
    );

    if (!current && currentName) {
      actions.push(separator());
      if (ref.type === 'branch') {
        actions.push(
          action(`Checkout and Rebase onto '${currentName}'`, 'git-pull-request', () =>
            ops.checkoutAndRebase(ref, currentName),
          ),
        );
      }
      actions.push(
        action(`Compare with '${currentName}'`, 'git-compare', () => ops.compare(ref, currentName)),
        action(`Rebase '${currentName}' onto '${ref.name}'`, 'git-pull-request', () =>
          ops.rebaseCurrentOnto(ref, currentName),
        ),
        action(`Merge '${ref.name}' into '${currentName}'`, 'git-merge', () =>
          ops.merge(ref, currentName),
        ),
      );
    }

    actions.push(separator());
    if (ref.type === 'branch') {
      actions.push(action(`Push '${ref.name}'`, 'repo-push', () => ops.push(ref)));
      if (ref.upstream && !ref.upstream.gone) {
        actions.push(action(`Update '${ref.name}'`, 'repo-pull', () => ops.update(ref)));
      }
      actions.push(action('Rename…', 'edit', () => ops.promptRename(ref)));
    }
    if (!current) {
      actions.push(action('Delete', 'trash', () => ops.delete(ref)));
    }
    return actions;
  }

  private async showBranchActions(ref: BranchRef, current: boolean): Promise<void> {
    const picked = await vscode.window.showQuickPick(this.branchActions(ref, current), {
      title: `Branch '${ref.name}'`,
      placeHolder: 'Choose an action',
    });
    await picked?.run?.();
  }
}
