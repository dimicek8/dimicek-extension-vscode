import * as vscode from 'vscode';
import { type BlameFeature, registerBlameFeature } from './features/blame/blameFeature';
import { type BranchesFeature, registerBranchesFeature } from './features/branches/branchesFeature';
import { type CommitFeature, registerCommitFeature } from './features/commit/commitFeature';
import { type CompareFeature, registerCompareFeature } from './features/compare/compareFeature';
import { type FetchFeature, registerFetchFeature } from './features/fetch/fetchFeature';
import { type LogFeature, registerLogFeature } from './features/log/logFeature';
import { type PushFeature, registerPushFeature } from './features/push/pushFeature';
import { registerStashFeature, type StashFeature } from './features/stash/stashFeature';
import { registerUpdateFeature, type UpdateFeature } from './features/update/updateFeature';
import { RepoManager } from './vscode/repoManager';

export interface DimicekApi {
  repoManager: RepoManager | undefined;
  commit: CommitFeature | undefined;
  branches: BranchesFeature | undefined;
  log: LogFeature | undefined;
  push: PushFeature | undefined;
  update: UpdateFeature | undefined;
  fetch: FetchFeature | undefined;
  blame: BlameFeature | undefined;
  compare: CompareFeature | undefined;
  stash: StashFeature | undefined;
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
    const log = registerLogFeature(context, repoManager, commit.model, branches.operations, output);
    const push = registerPushFeature(context, commit.model, output);
    const update = registerUpdateFeature(context, commit.model, output);
    const fetch = registerFetchFeature(context, repoManager, output);
    const blame = registerBlameFeature(context, repoManager, output);
    const compare = registerCompareFeature(context, repoManager, output);
    const stash = registerStashFeature(context, commit.model, output);
    return { repoManager, commit, branches, log, push, update, fetch, blame, compare, stash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.error(message);
    void vscode.window.showErrorMessage(`Dimicek: ${message}`);
    return {
      repoManager: undefined,
      commit: undefined,
      branches: undefined,
      log: undefined,
      push: undefined,
      update: undefined,
      fetch: undefined,
      blame: undefined,
      compare: undefined,
      stash: undefined,
    };
  }
}

export function deactivate(): void {}
