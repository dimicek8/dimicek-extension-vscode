import * as vscode from 'vscode';
import type { ChangesModel } from '../commit/changesModel';
import { BranchFavorites } from './branchFavorites';
import { BranchOperations } from './branchOperations';
import { BranchesPopup } from './branchesPopup';
import { BranchesWindow } from './branchesWindow';
import { BranchStatusBar } from './branchStatusBar';

export const POPUP_STYLE_SETTING = 'dimicek.branches.popupStyle';

export interface BranchesFeature {
  statusBar: BranchStatusBar;
  popup: BranchesPopup;
  window: BranchesWindow;
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
  const window = new BranchesWindow(context.extensionUri, model, popup, favorites);

  const show = () =>
    vscode.workspace.getConfiguration().get<string>(POPUP_STYLE_SETTING, 'window') === 'quickPick'
      ? popup.show()
      : window.show();

  context.subscriptions.push(
    statusBar,
    window,
    vscode.commands.registerCommand('dimicek.branches.show', show),
    vscode.commands.registerCommand('dimicek.branches.showWindow', () => window.show()),
    vscode.commands.registerCommand('dimicek.branches.showQuickPick', () => popup.show()),
    vscode.commands.registerCommand('dimicek.branches.newBranch', () =>
      operations.promptNewBranch('HEAD', model.branch.head ?? 'HEAD'),
    ),
    vscode.commands.registerCommand('dimicek.branches.checkoutRevision', () =>
      operations.promptCheckoutRevision(),
    ),
    vscode.commands.registerCommand('dimicek.branches.fetch', () => operations.fetch()),
  );
  void statusBar.update();
  return { statusBar, popup, window, operations, favorites };
}
