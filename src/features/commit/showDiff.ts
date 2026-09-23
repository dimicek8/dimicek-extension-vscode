import { basename, join } from 'node:path';
import * as vscode from 'vscode';
import { toEmptyUri, toGitUri } from '../../vscode/gitContentProvider';
import type { FileChange } from './fileChanges';

export async function showChangeDiff(root: string, change: FileChange): Promise<void> {
  const fileUri = vscode.Uri.file(join(root, change.path));
  const name = basename(change.path);
  const options: vscode.TextDocumentShowOptions = { preview: true };

  switch (change.kind) {
    case 'conflicted':
      await vscode.commands.executeCommand('vscode.open', fileUri, options);
      return;
    case 'added':
    case 'unversioned':
      await vscode.commands.executeCommand(
        'vscode.diff',
        toEmptyUri(root, change.path),
        fileUri,
        `${name} (Added)`,
        options,
      );
      return;
    case 'deleted':
      await vscode.commands.executeCommand(
        'vscode.diff',
        toGitUri(root, change.path, 'HEAD'),
        toEmptyUri(root, change.path),
        `${name} (Deleted)`,
        options,
      );
      return;
    case 'renamed':
      await vscode.commands.executeCommand(
        'vscode.diff',
        toGitUri(root, change.originalPath ?? change.path, 'HEAD'),
        fileUri,
        `${basename(change.originalPath ?? change.path)} → ${name} (HEAD ↔ Working Tree)`,
        options,
      );
      return;
    case 'modified':
      await vscode.commands.executeCommand(
        'vscode.diff',
        toGitUri(root, change.path, 'HEAD'),
        fileUri,
        `${name} (HEAD ↔ Working Tree)`,
        options,
      );
      return;
  }
}
