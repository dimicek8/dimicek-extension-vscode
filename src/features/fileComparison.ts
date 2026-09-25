import { basename, dirname, join } from 'node:path';
import * as vscode from 'vscode';
import type { NameStatusEntry } from '../git/parsers/nameStatus';
import { toEmptyUri, toGitUri } from '../vscode/gitContentProvider';

export const WORKING_TREE = Symbol('working tree');

export type ComparedRevision = string | typeof WORKING_TREE;

export interface FileComparison {
  root: string;
  title: string;
  left: string;
  right: ComparedRevision;
  files: readonly NameStatusEntry[];
}

function label(revision: ComparedRevision): string {
  return revision === WORKING_TREE ? 'Working Tree' : revision.slice(0, 40);
}

export function comparisonUris(
  root: string,
  file: NameStatusEntry,
  left: string,
  right: ComparedRevision,
): { left: vscode.Uri; right: vscode.Uri } {
  return {
    left:
      file.status === 'added'
        ? toEmptyUri(root, file.path)
        : toGitUri(root, file.originalPath ?? file.path, left),
    right:
      file.status === 'deleted'
        ? toEmptyUri(root, file.path)
        : right === WORKING_TREE
          ? vscode.Uri.file(join(root, file.path))
          : toGitUri(root, file.path, right),
  };
}

export function showFileComparison(comparison: FileComparison): void {
  const { root, title, left, right, files } = comparison;
  const quickPick = vscode.window.createQuickPick<
    vscode.QuickPickItem & { file: NameStatusEntry }
  >();
  quickPick.title = title;
  quickPick.placeholder = 'Select a file to see its diff (Esc to close)';
  quickPick.ignoreFocusOut = true;
  quickPick.matchOnDescription = true;
  quickPick.items = files.map((file) => ({
    label: basename(file.path),
    description: file.originalPath
      ? `${file.originalPath} → ${file.path}`
      : dirname(file.path) === '.'
        ? undefined
        : dirname(file.path),
    detail: file.status,
    file,
  }));
  quickPick.onDidAccept(() => {
    const file = quickPick.selectedItems[0]?.file;
    if (!file) {
      return;
    }
    const uris = comparisonUris(root, file, left, right);
    void vscode.commands.executeCommand(
      'vscode.diff',
      uris.left,
      uris.right,
      `${basename(file.path)} (${label(left).slice(0, 12)} ↔ ${label(right).slice(0, 12)})`,
      { preview: true, preserveFocus: true },
    );
  });
  quickPick.onDidHide(() => quickPick.dispose());
  quickPick.show();
}
