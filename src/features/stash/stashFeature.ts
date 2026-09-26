import * as vscode from 'vscode';
import type { ChangesModel } from '../commit/changesModel';
import { StashActions } from './stashActions';
import { type StashNode, StashTreeProvider } from './stashTree';

export interface StashFeature {
  tree: StashTreeProvider;
  actions: StashActions;
}

export function registerStashFeature(
  context: vscode.ExtensionContext,
  model: ChangesModel,
  output: vscode.LogOutputChannel,
): StashFeature {
  const tree = new StashTreeProvider(model, output);
  const actions = new StashActions(model, tree, output);
  const view = vscode.window.createTreeView('dimicek.stashes', { treeDataProvider: tree });

  const withStash =
    (run: (node: Extract<StashNode, { type: 'stash' }>) => Promise<unknown>) =>
    (node?: StashNode) => {
      const target = node ?? view.selection[0];
      return target?.type === 'stash' ? run(target) : undefined;
    };

  context.subscriptions.push(
    tree,
    view,
    vscode.commands.registerCommand('dimicek.stash.stash', () => actions.promptStash()),
    vscode.commands.registerCommand('dimicek.stash.refresh', () => tree.refresh()),
    vscode.commands.registerCommand('dimicek.stash.clear', () => actions.clear()),
    vscode.commands.registerCommand(
      'dimicek.stash.apply',
      withStash(({ stash }) => actions.apply(stash)),
    ),
    vscode.commands.registerCommand(
      'dimicek.stash.pop',
      withStash(({ stash }) => actions.pop(stash)),
    ),
    vscode.commands.registerCommand(
      'dimicek.stash.drop',
      withStash(({ stash }) => actions.drop(stash)),
    ),
    vscode.commands.registerCommand(
      'dimicek.stash.branch',
      withStash(({ stash }) => actions.promptBranch(stash)),
    ),
    vscode.commands.registerCommand('dimicek.stash.showDiff', (node?: StashNode) =>
      node?.type === 'file' ? actions.showDiff(node.stash, node.file) : undefined,
    ),
  );
  void tree.refresh();
  return { tree, actions };
}
