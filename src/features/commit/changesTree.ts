import { basename, dirname, join } from 'node:path';
import * as vscode from 'vscode';
import { changeUri } from './changeDecorations';
import type { ChangesModel } from './changesModel';
import { buildDirectoryTree, type DirectoryNode, filesUnder } from './directoryTree';
import { type ChangeGroup, type ChangeGroupId, type FileChange, groupChanges } from './fileChanges';

export type ChangesNode =
  | { type: 'group'; group: ChangeGroup }
  | { type: 'directory'; directory: DirectoryNode; groupId: ChangeGroupId; root: string }
  | { type: 'file'; change: FileChange; root: string; flat: boolean };

export const GROUP_BY_DIRECTORY_SETTING = 'dimicek.changes.groupByDirectory';

function fileCount(count: number): string {
  return count === 1 ? '1 file' : `${count} files`;
}

export function isGroupedByDirectory(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(GROUP_BY_DIRECTORY_SETTING, true);
}

export class ChangesTreeProvider
  implements vscode.TreeDataProvider<ChangesNode>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private readonly subscriptions: vscode.Disposable[];

  constructor(private readonly model: ChangesModel) {
    this.subscriptions = [
      model.onDidChange(() => this.changeEmitter.fire()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(GROUP_BY_DIRECTORY_SETTING)) {
          this.changeEmitter.fire();
        }
      }),
    ];
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
    switch (node.type) {
      case 'group':
        if (!isGroupedByDirectory()) {
          return node.group.changes.map((change) => ({ type: 'file', change, root, flat: true }));
        }
        return this.directoryChildren(buildDirectoryTree(node.group.changes), node.group.id, root);
      case 'directory':
        return this.directoryChildren(node.directory, node.groupId, root);
      case 'file':
        return [];
    }
  }

  private directoryChildren(
    directory: DirectoryNode,
    groupId: ChangeGroupId,
    root: string,
  ): ChangesNode[] {
    return [
      ...directory.directories.map((child): ChangesNode => ({
        type: 'directory',
        directory: child,
        groupId,
        root,
      })),
      ...directory.files.map((change): ChangesNode => ({
        type: 'file',
        change,
        root,
        flat: false,
      })),
    ];
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

  changesOf(node: ChangesNode): FileChange[] {
    switch (node.type) {
      case 'group':
        return node.group.changes;
      case 'directory':
        return filesUnder(node.directory);
      case 'file':
        return [node.change];
    }
  }

  private pathsOf(node: ChangesNode): string[] {
    return this.changesOf(node).map((change) => change.path);
  }

  private checkbox(paths: readonly string[]): vscode.TreeItemCheckboxState {
    const included =
      paths.length > 0 && paths.every((path) => this.model.inclusion.isIncluded(path));
    return included ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
  }

  getTreeItem(node: ChangesNode): vscode.TreeItem {
    switch (node.type) {
      case 'group': {
        const item = new vscode.TreeItem(
          node.group.label,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.id = `group:${node.group.id}`;
        item.description = fileCount(node.group.changes.length);
        item.contextValue = `group:${node.group.id}`;
        item.checkboxState = this.checkbox(this.pathsOf(node));
        return item;
      }
      case 'directory': {
        const { directory, groupId, root } = node;
        const item = new vscode.TreeItem(
          vscode.Uri.file(join(root, directory.path)),
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.id = `directory:${groupId}:${directory.path}`;
        item.label = directory.name;
        item.iconPath = vscode.ThemeIcon.Folder;
        item.description = fileCount(filesUnder(directory).length);
        item.contextValue = `directory:${groupId}`;
        item.checkboxState = this.checkbox(this.pathsOf(node));
        return item;
      }
      case 'file': {
        const { change, root, flat } = node;
        const item = new vscode.TreeItem(changeUri(root, change));
        item.id = `file:${change.path}`;
        item.label = basename(change.path);
        const directory = dirname(change.path);
        item.description = flat && directory !== '.' ? directory : undefined;
        item.tooltip =
          change.kind === 'renamed' ? `${change.originalPath} → ${change.path}` : change.path;
        item.contextValue = `file:${change.kind}`;
        item.checkboxState = this.checkbox([change.path]);
        item.command = {
          command: 'dimicek.changes.showDiff',
          title: 'Show Diff',
          arguments: [node],
        };
        return item;
      }
    }
  }

  dispose(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.changeEmitter.dispose();
  }
}
