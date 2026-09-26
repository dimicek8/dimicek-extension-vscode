import * as vscode from 'vscode';
import type { ChangesModel } from '../commit/changesModel';
import type { ChangesNode, ChangesTreeProvider } from '../commit/changesTree';
import { ConflictResolver } from './conflictResolver';

export interface ConflictsFeature {
  resolver: ConflictResolver;
}

export function registerConflictsFeature(
  context: vscode.ExtensionContext,
  model: ChangesModel,
  tree: ChangesTreeProvider,
  output: vscode.LogOutputChannel,
): ConflictsFeature {
  const resolver = new ConflictResolver(model, output);
  const conflictedPaths = (node?: ChangesNode, nodes?: readonly ChangesNode[]) =>
    (nodes && nodes.length > 0 ? nodes : node ? [node] : [])
      .flatMap((target) => tree.changesOf(target))
      .filter((change) => change.kind === 'conflicted')
      .map((change) => change.path);

  context.subscriptions.push(
    vscode.commands.registerCommand('dimicek.conflicts.resolve', () => resolver.show()),
    vscode.commands.registerCommand(
      'dimicek.conflicts.acceptYours',
      (node?: ChangesNode, nodes?: readonly ChangesNode[]) =>
        resolver.accept(conflictedPaths(node, nodes), 'yours'),
    ),
    vscode.commands.registerCommand(
      'dimicek.conflicts.acceptTheirs',
      (node?: ChangesNode, nodes?: readonly ChangesNode[]) =>
        resolver.accept(conflictedPaths(node, nodes), 'theirs'),
    ),
    vscode.commands.registerCommand('dimicek.conflicts.openMergeEditor', (node?: ChangesNode) =>
      node?.type === 'file' ? resolver.openMergeEditor(node.change.path) : undefined,
    ),
  );
  return { resolver };
}
