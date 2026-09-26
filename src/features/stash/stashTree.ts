import { basename, dirname } from 'node:path';
import * as vscode from 'vscode';
import type { NameStatusEntry } from '../../git/parsers/nameStatus';
import type { Stash } from '../../git/parsers/stash';
import type { ChangesModel } from '../commit/changesModel';
import { changeUri } from '../commit/changeDecorations';
import type { ChangeKind } from '../commit/fileChanges';

export type StashNode =
  | { type: 'stash'; stash: Stash }
  | { type: 'file'; stash: Stash; file: NameStatusEntry; root: string };

const KINDS: Record<NameStatusEntry['status'], ChangeKind> = {
  added: 'added',
  modified: 'modified',
  deleted: 'deleted',
  renamed: 'renamed',
  copied: 'added',
  typeChanged: 'modified',
};

function age(date: Date, now = Date.now()): string {
  const minutes = Math.round((now - date.getTime()) / 60_000);
  if (minutes < 60) {
    return `${Math.max(minutes, 1)} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  return date.toLocaleDateString();
}

export class StashTreeProvider implements vscode.TreeDataProvider<StashNode>, vscode.Disposable {
  private stashes: Stash[] = [];
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private readonly subscription: vscode.Disposable;

  constructor(
    private readonly model: ChangesModel,
    private readonly output: vscode.LogOutputChannel,
  ) {
    this.subscription = model.onDidChange(() => void this.refresh());
  }

  get entries(): readonly Stash[] {
    return this.stashes;
  }

  async refresh(): Promise<void> {
    const repository = this.model.repository;
    try {
      this.stashes = repository ? await repository.getStashes() : [];
    } catch (error) {
      this.output.warn(`Loading stashes failed: ${error instanceof Error ? error.message : error}`);
      this.stashes = [];
    }
    await vscode.commands.executeCommand(
      'setContext',
      'dimicek.hasStashes',
      this.stashes.length > 0,
    );
    this.changeEmitter.fire();
  }

  async getChildren(node?: StashNode): Promise<StashNode[]> {
    const repository = this.model.repository;
    if (!repository) {
      return [];
    }
    if (!node) {
      return this.stashes.map((stash) => ({ type: 'stash', stash }));
    }
    if (node.type === 'stash') {
      const files = await repository.getStashFiles(node.stash);
      return files.map((file) => ({
        type: 'file',
        stash: node.stash,
        file,
        root: repository.root,
      }));
    }
    return [];
  }

  getTreeItem(node: StashNode): vscode.TreeItem {
    if (node.type === 'stash') {
      const { stash } = node;
      const item = new vscode.TreeItem(stash.message, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `stash:${stash.hash}`;
      item.description = [stash.ref, stash.branch, age(stash.date)].filter(Boolean).join(' · ');
      item.tooltip = `${stash.ref}\n${stash.message}\n${stash.branch ? `on ${stash.branch}\n` : ''}${stash.date.toLocaleString()}`;
      item.iconPath = new vscode.ThemeIcon('archive');
      item.contextValue = 'stash';
      return item;
    }
    const { file, root, stash } = node;
    const item = new vscode.TreeItem(
      changeUri(root, {
        path: file.path,
        originalPath: file.originalPath,
        kind: KINDS[file.status],
      }),
    );
    item.id = `stash:${stash.hash}:${file.path}`;
    item.label = basename(file.path);
    const directory = dirname(file.path);
    item.description = directory === '.' ? undefined : directory;
    item.contextValue = 'stashFile';
    item.command = { command: 'dimicek.stash.showDiff', title: 'Show Diff', arguments: [node] };
    return item;
  }

  dispose(): void {
    this.subscription.dispose();
    this.changeEmitter.dispose();
  }
}
