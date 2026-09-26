import { basename } from 'node:path';
import * as vscode from 'vscode';
import type {
  BranchesFromWebview,
  BranchesToWebview,
  BranchesViewAction,
  BranchesViewState,
} from '../../shared/protocol';
import { buildWebviewHtml, webviewOptions } from '../../vscode/webviewHtml';
import type { ChangesModel } from '../commit/changesModel';
import { operationLabel } from './branchLabels';
import type { BranchCommand, BranchEntry, BranchRef } from './branchEntries';
import type { BranchFavorites } from './branchFavorites';
import type { BranchesPopup } from './branchesPopup';

export class BranchesWindow implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private entries: BranchEntry[] = [];
  private state: BranchesViewState | undefined;
  private readonly subscription: vscode.Disposable;

  private readonly readyEmitter = new vscode.EventEmitter<void>();
  readonly onDidBecomeReady = this.readyEmitter.event;

  private readonly postEmitter = new vscode.EventEmitter<BranchesToWebview>();
  readonly onDidPost = this.postEmitter.event;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly model: ChangesModel,
    private readonly popup: BranchesPopup,
    private readonly favorites: BranchFavorites,
  ) {
    this.subscription = model.onDidChange(() => {
      if (this.panel) {
        void this.refresh();
      }
    });
  }

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  get currentState(): BranchesViewState | undefined {
    return this.state;
  }

  show(): void {
    if (!this.model.repository) {
      void vscode.window.showInformationMessage('No Git repository is open.');
      return;
    }
    if (this.panel) {
      this.panel.reveal();
      void this.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'dimicek.branches',
      'Branches',
      vscode.ViewColumn.Active,
      { ...webviewOptions(this.extensionUri), retainContextWhenHidden: true },
    );
    panel.iconPath = new vscode.ThemeIcon('git-branch');
    panel.webview.html = buildWebviewHtml(panel.webview, this.extensionUri, 'branches', 'Branches');
    const subscription = panel.webview.onDidReceiveMessage((message: BranchesFromWebview) =>
      this.handleMessage(message),
    );
    panel.onDidDispose(() => {
      subscription.dispose();
      this.panel = undefined;
      this.state = undefined;
    });
    this.panel = panel;
  }

  close(): void {
    this.panel?.dispose();
  }

  private post(message: BranchesToWebview): void {
    this.postEmitter.fire(message);
    void this.panel?.webview.postMessage(message);
  }

  async refresh(): Promise<void> {
    const repository = this.model.repository;
    if (!repository) {
      return;
    }
    const [entries, operation] = await Promise.all([
      this.popup.loadEntries(),
      repository.getOperationState().catch(() => undefined),
    ]);
    this.entries = entries;
    const branches = entries.flatMap((entry) => (entry.kind === 'branch' ? [entry] : []));
    const recentStart = entries.findIndex(
      (entry) => entry.kind === 'separator' && entry.label === 'Recent',
    );
    const recentEnd = entries.findIndex(
      (entry, index) => index > recentStart && entry.kind === 'separator',
    );
    const recent =
      recentStart === -1
        ? []
        : entries
            .slice(recentStart + 1, recentEnd === -1 ? undefined : recentEnd)
            .flatMap((entry) => (entry.kind === 'branch' ? [entry.ref.fullName] : []));
    const unique = new Map(branches.map((entry) => [entry.ref.fullName, entry]));

    this.state = {
      repository: basename(repository.root),
      current: this.model.branch.head,
      operation: operation ? `${operationLabel(operation.kind)} in progress` : undefined,
      commands: entries.flatMap((entry) =>
        entry.kind === 'command'
          ? [{ command: entry.command, label: entry.label, icon: entry.icon }]
          : [],
      ),
      recent,
      branches: [...unique.values()].map((entry) => ({
        fullName: entry.ref.fullName,
        name: entry.ref.name,
        kind: entry.ref.type === 'branch' ? 'local' : 'remote',
        remote: entry.ref.type === 'remoteBranch' ? entry.ref.remote : undefined,
        shortName: entry.ref.type === 'remoteBranch' ? entry.ref.branch : entry.ref.name,
        current: entry.current,
        favorite: entry.favorite,
        description: entry.description,
      })),
    };
    if (this.panel) {
      this.panel.title = `Branches — ${this.state.repository}`;
    }
    this.post({ type: 'state', state: this.state });
  }

  private find(fullName: string): { ref: BranchRef; current: boolean } | undefined {
    const entry = this.entries.find(
      (candidate) => candidate.kind === 'branch' && candidate.ref.fullName === fullName,
    );
    return entry?.kind === 'branch' ? { ref: entry.ref, current: entry.current } : undefined;
  }

  actionsFor(fullName: string): BranchesViewAction[] {
    const branch = this.find(fullName);
    if (!branch) {
      return [];
    }
    let group = 0;
    const actions: BranchesViewAction[] = [];
    for (const item of this.popup.branchActions(branch.ref, branch.current)) {
      if (item.kind === vscode.QuickPickItemKind.Separator) {
        group++;
      } else if (item.id) {
        actions.push({ id: item.id, label: item.label, icon: item.icon ?? 'circle', group });
      }
    }
    return actions;
  }

  async runAction(fullName: string, id: string): Promise<unknown> {
    const branch = this.find(fullName);
    const action = branch
      ? this.popup.branchActions(branch.ref, branch.current).find((item) => item.id === id)
      : undefined;
    return action?.run?.();
  }

  async handleMessage(message: BranchesFromWebview): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.refresh();
        this.readyEmitter.fire();
        break;
      case 'select':
        this.post({
          type: 'actions',
          fullName: message.fullName,
          actions: this.actionsFor(message.fullName),
        });
        break;
      case 'runAction':
        await this.runAction(message.fullName, message.action);
        break;
      case 'runCommand':
        await this.popup.runCommand(message.command as BranchCommand);
        break;
      case 'toggleFavorite': {
        const root = this.model.repository?.root;
        if (root) {
          await this.favorites.toggle(root, message.fullName);
          await this.refresh();
        }
        break;
      }
      case 'close':
        this.close();
        break;
    }
  }

  dispose(): void {
    this.close();
    this.subscription.dispose();
    this.readyEmitter.dispose();
    this.postEmitter.dispose();
  }
}
