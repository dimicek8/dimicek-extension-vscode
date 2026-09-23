import * as vscode from 'vscode';
import { DemoViewProvider } from './features/demo/demoViewProvider';
import { createGit } from './vscode/gitSetup';

export interface DimicekApi {
  demoView: DemoViewProvider;
}

export function activate(context: vscode.ExtensionContext): DimicekApi {
  const output = vscode.window.createOutputChannel('Dimicek', { log: true });
  context.subscriptions.push(output);
  output.info('Dimicek activated');

  createGit(output).catch((error: Error) => {
    output.error(error.message);
    void vscode.window.showErrorMessage(error.message);
  });

  const demoView = new DemoViewProvider(context, output);
  context.subscriptions.push(
    demoView,
    vscode.commands.registerCommand('dimicek.hello', () => {
      output.info('Hello command executed');
      void vscode.window.showInformationMessage('Hello from Dimicek!');
    }),
    vscode.window.registerWebviewViewProvider(DemoViewProvider.viewId, demoView),
  );

  return { demoView };
}

export function deactivate(): void {}
