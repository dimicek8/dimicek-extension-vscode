import * as vscode from 'vscode';
import type { ChangesModel } from '../commit/changesModel';
import { RebaseDialog } from './rebaseDialog';

export interface RebaseFeature {
  dialog: RebaseDialog;
}

export function registerRebaseFeature(
  context: vscode.ExtensionContext,
  model: ChangesModel,
  output: vscode.LogOutputChannel,
): RebaseFeature {
  const dialog = new RebaseDialog(context.extensionUri, model, output);
  context.subscriptions.push(
    dialog,
    vscode.commands.registerCommand(
      'dimicek.log.interactiveRebase',
      (target?: { hash?: string }) => (target?.hash ? dialog.show(target.hash) : undefined),
    ),
  );
  return { dialog };
}
