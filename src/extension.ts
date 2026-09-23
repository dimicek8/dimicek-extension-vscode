import * as vscode from 'vscode';
import { DemoViewProvider } from './features/demo/demoViewProvider';
import { RepoManager } from './vscode/repoManager';

export interface DimicekApi {
  demoView: DemoViewProvider;
  repoManager: RepoManager | undefined;
}

export async function activate(context: vscode.ExtensionContext): Promise<DimicekApi> {
  const output = vscode.window.createOutputChannel('Dimicek', { log: true });
  context.subscriptions.push(output);
  output.info('Dimicek activated');

  const demoView = new DemoViewProvider(context, output);
  context.subscriptions.push(
    demoView,
    vscode.commands.registerCommand('dimicek.hello', () => {
      output.info('Hello command executed');
      void vscode.window.showInformationMessage('Hello from Dimicek!');
    }),
    vscode.window.registerWebviewViewProvider(DemoViewProvider.viewId, demoView),
  );

  let repoManager: RepoManager | undefined;
  try {
    repoManager = await RepoManager.create(output);
    context.subscriptions.push(repoManager);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.error(message);
    void vscode.window.showErrorMessage(`Dimicek: ${message}`);
  }

  return { demoView, repoManager };
}

export function deactivate(): void {}
