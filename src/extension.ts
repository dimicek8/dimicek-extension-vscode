import * as vscode from 'vscode';
import { type CommitFeature, registerCommitFeature } from './features/commit/commitFeature';
import { DemoViewProvider } from './features/demo/demoViewProvider';
import { RepoManager } from './vscode/repoManager';

export interface DimicekApi {
  demoView: DemoViewProvider;
  repoManager: RepoManager | undefined;
  commit: CommitFeature | undefined;
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
  let commit: CommitFeature | undefined;
  try {
    repoManager = await RepoManager.create(output);
    context.subscriptions.push(repoManager);
    commit = registerCommitFeature(context, repoManager, output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.error(message);
    void vscode.window.showErrorMessage(`Dimicek: ${message}`);
  }

  return { demoView, repoManager, commit };
}

export function deactivate(): void {}
