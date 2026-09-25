import * as vscode from 'vscode';
import type { ChangesModel } from '../commit/changesModel';
import { BranchFavorites } from './branchFavorites';
import { BranchOperations } from './branchOperations';
import { BranchesPopup } from './branchesPopup';
import { BranchStatusBar } from './branchStatusBar';

export interface BranchesFeature {
  statusBar: BranchStatusBar;
  popup: BranchesPopup;
  operations: BranchOperations;
  favorites: BranchFavorites;
}

export function registerBranchesFeature(
  context: vscode.ExtensionContext,
  model: ChangesModel,
  output: vscode.LogOutputChannel,
): BranchesFeature {
  const statusBar = new BranchStatusBar(model);
  const favorites = new BranchFavorites(context.workspaceState);
  const operations = new BranchOperations(model, output);
  const popup = new BranchesPopup(model, favorites, operations);

  context.subscriptions.push(
    statusBar,
    vscode.commands.registerCommand('dimicek.branches.show', () => popup.show()),
    vscode.commands.registerCommand('dimicek.branches.newBranch', () =>
      operations.promptNewBranch('HEAD', model.branch.head ?? 'HEAD'),
    ),
    vscode.commands.registerCommand('dimicek.branches.checkoutRevision', () =>
      operations.promptCheckoutRevision(),
    ),
    vscode.commands.registerCommand('dimicek.branches.fetch', () => operations.fetch()),
  );
  void statusBar.update();
  return { statusBar, popup, operations, favorites };
}
