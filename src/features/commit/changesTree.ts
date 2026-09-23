import { basename, dirname } from 'node:path';
import * as vscode from 'vscode';
import { changeUri } from './changeDecorations';
import type { ChangesModel } from './changesModel';
import { type ChangeGroup, type FileChange, groupChanges } from './fileChanges';

export type ChangesNode =
  { type: 'group'; group: ChangeGroup } | { type: 'file'; change: FileChange; root: string };

function fileCount(count: number): string {
  return count === 1 ? '1 file' : `${count} files`;
}

export class ChangesTreeProvider
  implements vscode.TreeDataProvider<ChangesNode>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly model: ChangesModel) {
    this.subscription = model.onDidChange(() => this.changeEmitter.fire());
  }

  getChildren(node?: ChangesNode): ChangesNode[] {
    const root = this.model.repository?.root;
    if (!root) {
      return [];
    }
    if (!node) {
      if (this.model.changes.length === 0) {
        return [];
      }
      return groupChanges(this.model.changes).map((group) => ({ type: 'group', group }));
    }
    if (node.type === 'group') {
      return node.group.changes.map((change) => ({ type: 'file', change, root }));
    }
    return [];
  }

  applyCheckboxChanges(
    items: ReadonlyArray<readonly [ChangesNode, vscode.TreeItemCheckboxState]>,
  ): void {
    const include: string[] = [];
    const exclude: string[] = [];
    for (const [node, state] of items) {
      const target = state === vscode.TreeItemCheckboxState.Checked ? include : exclude;
      target.push(...this.pathsOf(node));
    }
    if (include.length > 0) {
      this.model.setIncluded(include, true);
    }
    if (exclude.length > 0) {
      this.model.setIncluded(exclude, false);
    }
  }

  private pathsOf(node: ChangesNode): string[] {
    return node.type === 'group'
      ? node.group.changes.map((change) => change.path)
      : [node.change.path];
  }

  private checkbox(paths: readonly string[]): vscode.TreeItemCheckboxState {
    const included =
      paths.length > 0 && paths.every((path) => this.model.inclusion.isIncluded(path));
    return included ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
  }

  getTreeItem(node: ChangesNode): vscode.TreeItem {
    if (node.type === 'group') {
      const item = new vscode.TreeItem(node.group.label, vscode.TreeItemCollapsibleState.Expanded);
      item.checkboxState = this.checkbox(this.pathsOf(node));
      item.id = `group:${node.group.id}`;
      item.description = fileCount(node.group.changes.length);
      item.contextValue = `group:${node.group.id}`;
      return item;
    }

    const { change, root } = node;
    const item = new vscode.TreeItem(changeUri(root, change));
    item.id = `file:${change.path}`;
    item.label = basename(change.path);
    const directory = dirname(change.path);
    item.description = directory === '.' ? undefined : directory;
    item.tooltip =
      change.kind === 'renamed' ? `${change.originalPath} → ${change.path}` : change.path;
    item.contextValue = `file:${change.kind}`;
    item.checkboxState = this.checkbox([change.path]);
    return item;
  }

  dispose(): void {
    this.subscription.dispose();
    this.changeEmitter.dispose();
  }
}
