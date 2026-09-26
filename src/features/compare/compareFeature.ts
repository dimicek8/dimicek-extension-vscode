import * as vscode from 'vscode';
import type { RepoManager } from '../../vscode/repoManager';
import { CompareActions } from './compareActions';

export interface CompareFeature {
  actions: CompareActions;
}

export function registerCompareFeature(
  context: vscode.ExtensionContext,
  repoManager: RepoManager,
  output: vscode.LogOutputChannel,
): CompareFeature {
  const actions = new CompareActions(repoManager, output);
  context.subscriptions.push(
    vscode.commands.registerCommand('dimicek.compare.withBranch', (uri?: vscode.Uri) =>
      actions.withBranch(uri),
    ),
    vscode.commands.registerCommand('dimicek.compare.withRevision', (uri?: vscode.Uri) =>
      actions.withRevision(uri),
    ),
  );
  return { actions };
}
