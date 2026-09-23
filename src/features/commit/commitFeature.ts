import * as vscode from 'vscode';
import type { BranchStatus } from '../../git/parsers/status';
import type { RepoManager } from '../../vscode/repoManager';
import { ChangeDecorationProvider } from './changeDecorations';
import { ChangesModel } from './changesModel';
import { ChangesTreeProvider } from './changesTree';

export interface CommitFeature {
  model: ChangesModel;
  tree: ChangesTreeProvider;
}

function describeBranch(branch: BranchStatus): string | undefined {
  const name =
    branch.head ?? (branch.commit ? `detached at ${branch.commit.slice(0, 7)}` : undefined);
  if (!name) {
    return undefined;
  }
  const ahead = branch.ahead ? ` ↑${branch.ahead}` : '';
  const behind = branch.behind ? ` ↓${branch.behind}` : '';
  return `${name}${ahead}${behind}`;
}

export function registerCommitFeature(
  context: vscode.ExtensionContext,
  repoManager: RepoManager,
  output: vscode.LogOutputChannel,
): CommitFeature {
  const model = new ChangesModel(repoManager, output);
  const tree = new ChangesTreeProvider(model);
  const view = vscode.window.createTreeView('dimicek.changes', {
    treeDataProvider: tree,
    showCollapseAll: true,
  });

  const updateView = () => {
    view.description = describeBranch(model.branch);
    const count = model.changes.filter((change) => change.kind !== 'unversioned').length;
    view.badge = count > 0 ? { value: count, tooltip: `${count} changed files` } : undefined;
  };

  context.subscriptions.push(
    model,
    tree,
    view,
    model.onDidChange(updateView),
    vscode.window.registerFileDecorationProvider(new ChangeDecorationProvider()),
    vscode.commands.registerCommand('dimicek.changes.refresh', () => model.refresh()),
  );

  void model.refresh();
  return { model, tree };
}
