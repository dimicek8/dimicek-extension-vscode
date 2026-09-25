import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { ChangesModel } from '../commit/changesModel';
import type { BranchFavorites } from './branchFavorites';
import { type BranchEntry, type BranchRef, buildBranchEntries } from './branchEntries';
import type { BranchOperations } from './branchOperations';

interface EntryItem extends vscode.QuickPickItem {
  entry?: BranchEntry;
}

interface BranchAction extends vscode.QuickPickItem {
  run: () => Promise<unknown>;
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
    const [refs, recent] = await Promise.all([
      repository.getRefs(),
      repository.getRecentCheckouts(),
    ]);
    return buildBranchEntries({ refs, recent, favorites: this.favorites.get(repository.root) });
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
    if (entry) {
      await this.run(entry);
    }
  }

  private async run(entry: BranchEntry): Promise<void> {
    switch (entry.kind) {
      case 'command': {
        if (entry.command === 'newBranch') {
          await this.operations.promptNewBranch('HEAD', this.model.branch.head ?? 'HEAD');
        } else if (entry.command === 'checkoutRevision') {
          await this.operations.promptCheckoutRevision();
        } else {
          await this.operations.fetch();
        }
        return;
      }
      case 'branch':
        await this.showBranchActions(entry.ref, entry.current);
        return;
      case 'separator':
        return;
    }
  }

  branchActions(ref: BranchRef, current: boolean): BranchAction[] {
    const actions: BranchAction[] = [];
    if (!current) {
      actions.push({
        label: 'Checkout',
        iconPath: new vscode.ThemeIcon('check'),
        run: () => this.operations.checkout(ref),
      });
    }
    actions.push({
      label: `New Branch from '${ref.name}'…`,
      iconPath: new vscode.ThemeIcon('add'),
      run: () => this.operations.promptNewBranch(ref.name, ref.name),
    });
    return actions;
  }

  private async showBranchActions(ref: BranchRef, current: boolean): Promise<void> {
    const picked = await vscode.window.showQuickPick(this.branchActions(ref, current), {
      title: `Branch '${ref.name}'`,
      placeHolder: 'Choose an action',
    });
    await picked?.run();
  }
}
