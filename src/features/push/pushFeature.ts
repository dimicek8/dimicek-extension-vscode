import * as vscode from 'vscode';
import type { ChangesModel } from '../commit/changesModel';
import { PushDialog } from './pushDialog';

export interface PushFeature {
  dialog: PushDialog;
}

export function registerPushFeature(
  context: vscode.ExtensionContext,
  model: ChangesModel,
  output: vscode.LogOutputChannel,
): PushFeature {
  const dialog = new PushDialog(context.extensionUri, model, output);
  context.subscriptions.push(
    dialog,
    vscode.commands.registerCommand('dimicek.push.show', () => dialog.show()),
  );
  return { dialog };
}
