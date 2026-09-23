import { join } from 'node:path';
import * as vscode from 'vscode';
import type { ChangeKind, FileChange } from './fileChanges';

export const CHANGE_SCHEME = 'dimicek-change';

const DECORATIONS: Record<ChangeKind, { badge: string; color: string; tooltip: string }> = {
  modified: { badge: 'M', color: 'gitDecoration.modifiedResourceForeground', tooltip: 'Modified' },
  added: { badge: 'A', color: 'gitDecoration.addedResourceForeground', tooltip: 'Added' },
  deleted: { badge: 'D', color: 'gitDecoration.deletedResourceForeground', tooltip: 'Deleted' },
  renamed: { badge: 'R', color: 'gitDecoration.renamedResourceForeground', tooltip: 'Renamed' },
  conflicted: {
    badge: '!',
    color: 'gitDecoration.conflictingResourceForeground',
    tooltip: 'Merge conflict',
  },
  unversioned: {
    badge: 'U',
    color: 'gitDecoration.untrackedResourceForeground',
    tooltip: 'Unversioned',
  },
};

export function changeUri(root: string, change: FileChange): vscode.Uri {
  return vscode.Uri.file(join(root, change.path)).with({
    scheme: CHANGE_SCHEME,
    query: change.kind,
  });
}

export class ChangeDecorationProvider implements vscode.FileDecorationProvider {
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== CHANGE_SCHEME) {
      return undefined;
    }
    const decoration = DECORATIONS[uri.query as ChangeKind];
    if (!decoration) {
      return undefined;
    }
    return new vscode.FileDecoration(
      decoration.badge,
      decoration.tooltip,
      new vscode.ThemeColor(decoration.color),
    );
  }
}
