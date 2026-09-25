import type * as vscode from 'vscode';
import type { ChangesModel } from '../commit/changesModel';
import { BranchStatusBar } from './branchStatusBar';

export interface BranchesFeature {
  statusBar: BranchStatusBar;
}

export function registerBranchesFeature(
  context: vscode.ExtensionContext,
  model: ChangesModel,
): BranchesFeature {
  const statusBar = new BranchStatusBar(model);
  context.subscriptions.push(statusBar);
  void statusBar.update();
  return { statusBar };
}
