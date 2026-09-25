import * as vscode from 'vscode';
import type { RepoManager } from '../../vscode/repoManager';
import { LogModel } from './logModel';
import { LogViewProvider } from './logViewProvider';

export interface LogFeature {
  model: LogModel;
  view: LogViewProvider;
}

export function registerLogFeature(
  context: vscode.ExtensionContext,
  repoManager: RepoManager,
  output: vscode.LogOutputChannel,
): LogFeature {
  const model = new LogModel(repoManager, output);
  const view = new LogViewProvider(context.extensionUri, model);
  context.subscriptions.push(
    model,
    view,
    vscode.window.registerWebviewViewProvider(LogViewProvider.viewId, view, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('dimicek.log.show', () =>
      vscode.commands.executeCommand(`${LogViewProvider.viewId}.focus`),
    ),
    vscode.commands.registerCommand('dimicek.log.refresh', () => model.reload()),
  );
  void model.reload();
  return { model, view };
}
