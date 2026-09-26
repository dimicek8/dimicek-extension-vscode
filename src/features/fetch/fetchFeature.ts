import type * as vscode from 'vscode';
import type { RepoManager } from '../../vscode/repoManager';
import { AutoFetcher } from './autoFetcher';

export interface FetchFeature {
  autoFetcher: AutoFetcher;
}

export function registerFetchFeature(
  context: vscode.ExtensionContext,
  repoManager: RepoManager,
  output: vscode.LogOutputChannel,
): FetchFeature {
  const autoFetcher = new AutoFetcher(repoManager, output);
  context.subscriptions.push(autoFetcher);
  return { autoFetcher };
}
