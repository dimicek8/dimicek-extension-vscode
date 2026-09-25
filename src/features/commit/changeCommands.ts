import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { ChangeActions } from './changeActions';
import type { ChangesNode, ChangesTreeProvider } from './changesTree';
import type { FileChange } from './fileChanges';
import { ignoreDirectoryPattern, ignorePattern, ignoreScopes, type IgnoreScope } from './gitignore';
import { showChangeDiff } from './showDiff';

const SCOPE_LABELS: Record<IgnoreScope, (path: string) => string> = {
  file: (path) => `Ignore file ${basename(path)}`,
  directory: () => 'Ignore the whole directory',
  extension: (path) => `Ignore all ${ignorePattern(path, 'extension')} files`,
};

export function registerChangeCommands(
  view: vscode.TreeView<ChangesNode>,
  tree: ChangesTreeProvider,
  actions: ChangeActions,
): vscode.Disposable[] {
  const targets = (node?: ChangesNode, nodes?: readonly ChangesNode[]): ChangesNode[] =>
    nodes && nodes.length > 0 ? [...nodes] : node ? [node] : [...view.selection];

  const changesOf = (node?: ChangesNode, nodes?: readonly ChangesNode[]): FileChange[] => {
    const unique = new Map<string, FileChange>();
    for (const target of targets(node, nodes)) {
      for (const change of tree.changesOf(target)) {
        unique.set(change.path, change);
      }
    }
    return [...unique.values()];
  };

  const register = (
    command: string,
    handler: (node?: ChangesNode, nodes?: readonly ChangesNode[]) => unknown,
  ) => vscode.commands.registerCommand(command, handler);

  const ignore = async (node?: ChangesNode, nodes?: readonly ChangesNode[]) => {
    const selected = targets(node, nodes);
    const directories = selected.filter(
      (target): target is Extract<ChangesNode, { type: 'directory' }> =>
        target.type === 'directory',
    );
    const files = changesOf(
      undefined,
      selected.filter((target) => target.type !== 'directory'),
    ).filter((change) => change.kind === 'unversioned');
    const patterns = directories.map((target) => ignoreDirectoryPattern(target.directory.path));

    if (files.length === 1 && directories.length === 0) {
      const path = files[0]!.path;
      const picked = await vscode.window.showQuickPick(
        ignoreScopes(path).map((scope) => ({
          label: SCOPE_LABELS[scope](path),
          description: ignorePattern(path, scope),
          scope,
        })),
        { placeHolder: 'Add to .gitignore' },
      );
      if (!picked) {
        return;
      }
      patterns.push(ignorePattern(path, picked.scope));
    } else {
      patterns.push(...files.map((change) => ignorePattern(change.path, 'file')));
    }
    await actions.ignore(patterns);
  };

  return [
    register('dimicek.changes.showDiff', async (node, nodes) => {
      const target = targets(node, nodes).find((candidate) => candidate.type === 'file');
      if (target?.type === 'file') {
        await showChangeDiff(target.root, target.change);
      }
    }),
    register('dimicek.changes.openFile', (node, nodes) =>
      actions.openFiles(changesOf(node, nodes)),
    ),
    register('dimicek.changes.rollback', (node, nodes) => actions.rollback(changesOf(node, nodes))),
    register('dimicek.changes.addToVcs', (node, nodes) => actions.addToVcs(changesOf(node, nodes))),
    register('dimicek.changes.ignore', ignore),
    register('dimicek.changes.markResolved', (node, nodes) =>
      actions.markResolved(changesOf(node, nodes)),
    ),
    register('dimicek.changes.delete', (node, nodes) => actions.delete(changesOf(node, nodes))),
  ];
}
