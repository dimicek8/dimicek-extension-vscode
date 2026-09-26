import * as vscode from 'vscode';
import type { ChangesModel } from '../commit/changesModel';
import type { PushDialog } from '../push/pushDialog';
import { GitHubService } from './githubService';
import { PullRequestActions } from './pullRequestActions';

export interface GitHubFeature {
  service: GitHubService;
  pullRequests: PullRequestActions;
}

export function registerGitHubFeature(
  context: vscode.ExtensionContext,
  model: ChangesModel,
  pushDialog: PushDialog,
  output: vscode.LogOutputChannel,
): GitHubFeature {
  const service = new GitHubService(model);
  const pullRequests = new PullRequestActions(model, service, output);
  context.subscriptions.push(
    service,
    vscode.commands.registerCommand('dimicek.github.createPullRequest', () =>
      pullRequests.promptCreate(),
    ),
    vscode.commands.registerCommand('dimicek.github.pullRequests', () => pullRequests.showList()),
    pushDialog.onDidPush(async (state) => {
      if (!state.setUpstream || !(await service.isAvailable())) {
        return;
      }
      const choice = await vscode.window.showInformationMessage(
        `Pushed '${state.branch}' to ${state.remote}. Create a pull request?`,
        'Create Pull Request…',
      );
      if (choice) {
        await pullRequests.promptCreate();
      }
    }),
  );
  void service.updateContext();
  return { service, pullRequests };
}
