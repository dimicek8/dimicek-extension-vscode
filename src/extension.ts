import * as vscode from 'vscode';
import { type BranchesFeature, registerBranchesFeature } from './features/branches/branchesFeature';
import { type CommitFeature, registerCommitFeature } from './features/commit/commitFeature';
import { type LogFeature, registerLogFeature } from './features/log/logFeature';
import { RepoManager } from './vscode/repoManager';

export interface DimicekApi {
  repoManager: RepoManager | undefined;
  commit: CommitFeature | undefined;
  branches: BranchesFeature | undefined;
  log: LogFeature | undefined;
}

export async function activate(context: vscode.ExtensionContext): Promise<DimicekApi> {
  const output = vscode.window.createOutputChannel('Dimicek', { log: true });
  context.subscriptions.push(output);
  output.info('Dimicek activated');

  try {
    const repoManager = await RepoManager.create(output);
    context.subscriptions.push(repoManager);
    const commit = registerCommitFeature(context, repoManager, output);
    const branches = registerBranchesFeature(context, commit.model, output);
    const log = registerLogFeature(context, repoManager, output);
    return { repoManager, commit, branches, log };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.error(message);
    void vscode.window.showErrorMessage(`Dimicek: ${message}`);
    return { repoManager: undefined, commit: undefined, branches: undefined, log: undefined };
  }
}

export function deactivate(): void {}
