import * as vscode from 'vscode';
import { GitHubApiError, type PullRequest } from '../../github/githubClient';
import { sameRepo } from '../../github/githubRemote';
import type { ChangesModel } from '../commit/changesModel';
import { errorMessage, runOperation } from '../operations';
import type { GitHubContext, GitHubService } from './githubService';

export interface PullRequestDraft {
  base: string;
  title: string;
  body?: string;
  draft?: boolean;
}

function describeError(error: unknown): string {
  return error instanceof GitHubApiError && error.status === 401
    ? 'GitHub rejected the sign-in. Sign in again from the Accounts menu.'
    : errorMessage(error);
}

export class PullRequestActions {
  constructor(
    private readonly model: ChangesModel,
    private readonly github: GitHubService,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  private async context(): Promise<GitHubContext | undefined> {
    const context = await this.github.resolve();
    if (!context) {
      void vscode.window.showWarningMessage('This repository has no GitHub remote.');
    }
    return context;
  }

  private headFor(context: GitHubContext, branch: string): string {
    return sameRepo(context.headRepo, context.baseRepo)
      ? branch
      : `${context.headRepo.owner}:${branch}`;
  }

  private async offerOpen(message: string, pull: PullRequest): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      message,
      'Open in Browser',
      'Copy URL',
    );
    if (choice === 'Open in Browser') {
      await vscode.env.openExternal(vscode.Uri.parse(pull.url));
    } else if (choice === 'Copy URL') {
      await vscode.env.clipboard.writeText(pull.url);
    }
  }

  async create(draft: PullRequestDraft): Promise<PullRequest | undefined> {
    const context = await this.context();
    const branch = this.model.branch.head;
    if (!context || !branch) {
      return undefined;
    }
    const head = this.headFor(context, branch);
    try {
      const pull = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Creating pull request…' },
        () =>
          this.github.client.createPullRequest(context.baseRepo, {
            title: draft.title,
            body: draft.body,
            head,
            base: draft.base,
            draft: draft.draft,
          }),
      );
      this.output.info(`Created pull request #${pull.number}: ${pull.url}`);
      void this.offerOpen(`Pull request #${pull.number} created.`, pull);
      return pull;
    } catch (error) {
      if (
        error instanceof GitHubApiError &&
        error.status === 422 &&
        /already exists/i.test(error.message)
      ) {
        const existing = await this.github.client
          .findPullRequest(context.baseRepo, `${context.headRepo.owner}:${branch}`)
          .catch(() => undefined);
        if (existing) {
          void this.offerOpen(
            `A pull request for '${branch}' already exists (#${existing.number}).`,
            existing,
          );
          return existing;
        }
      }
      this.output.error(`Creating pull request failed: ${errorMessage(error)}`);
      void vscode.window.showErrorMessage(`Creating pull request failed: ${describeError(error)}`);
      return undefined;
    }
  }

  async promptCreate(): Promise<PullRequest | undefined> {
    const context = await this.context();
    const branch = this.model.branch.head;
    if (!context) {
      return undefined;
    }
    if (!branch) {
      void vscode.window.showWarningMessage('Check out a branch to create a pull request.');
      return undefined;
    }
    const refs = await context.repository.getRefs();
    const pushed = refs.some(
      (ref) => ref.fullName === `refs/remotes/${context.headRemote}/${branch}`,
    );
    if (!pushed) {
      const choice = await vscode.window.showWarningMessage(
        `Branch '${branch}' is not on GitHub yet. Push it first.`,
        'Push…',
      );
      if (choice) {
        await vscode.commands.executeCommand('dimicek.push.show');
      }
      return undefined;
    }

    const defaultBranch = await this.github.client
      .getDefaultBranch(context.baseRepo)
      .catch(() => 'main');
    const baseBranches = refs
      .filter((ref) => ref.type === 'remoteBranch' && ref.remote === context.baseRemote)
      .map((ref) => (ref.type === 'remoteBranch' ? ref.branch : ''))
      .filter((name) => name !== 'HEAD' && name !== branch);
    const base = await vscode.window.showQuickPick(
      [defaultBranch, ...baseBranches.filter((name) => name !== defaultBranch)].map((name) => ({
        label: name,
        description: name === defaultBranch ? 'default branch' : undefined,
      })),
      {
        title: `Create Pull Request — ${this.headFor(context, branch)} → ${context.baseRepo.owner}/${context.baseRepo.repo}`,
        placeHolder: 'Base branch the changes should be merged into',
      },
    );
    if (!base) {
      return undefined;
    }
    const lastSubject = (await context.repository.getLastCommitMessage()).split('\n')[0] ?? '';
    const title = await vscode.window.showInputBox({
      title: 'Create Pull Request — Title',
      value: lastSubject || branch,
      validateInput: (value) => (value.trim() ? undefined : 'Enter a title.'),
    });
    if (!title) {
      return undefined;
    }
    const body = await vscode.window.showInputBox({
      title: 'Create Pull Request — Description (optional)',
      placeHolder: 'What does this pull request change?',
    });
    if (body === undefined) {
      return undefined;
    }
    const mode = await vscode.window.showQuickPick(
      [
        { label: 'Create Pull Request', draft: false },
        { label: 'Create Draft Pull Request', draft: true },
      ],
      { title: `Create Pull Request — '${title.trim()}' into '${base.label}'` },
    );
    if (!mode) {
      return undefined;
    }
    return this.create({
      base: base.label,
      title: title.trim(),
      body: body.trim(),
      draft: mode.draft,
    });
  }

  async list(): Promise<PullRequest[]> {
    const context = await this.context();
    return context ? this.github.client.listPullRequests(context.baseRepo) : [];
  }

  async checkout(pull: PullRequest): Promise<boolean> {
    const context = await this.context();
    if (!context) {
      return false;
    }
    const sameRepository =
      pull.headRepo?.toLowerCase() ===
      `${context.baseRepo.owner}/${context.baseRepo.repo}`.toLowerCase();
    return runOperation(
      this.model,
      this.output,
      `Checking out #${pull.number}…`,
      async (repository) => {
        const locals = new Set(
          (await repository.getRefs())
            .filter((ref) => ref.type === 'branch')
            .map((ref) => ref.name),
        );
        if (sameRepository) {
          await repository.fetchRefspec(
            context.baseRemote,
            `refs/heads/${pull.headRef}:refs/remotes/${context.baseRemote}/${pull.headRef}`,
          );
          if (locals.has(pull.headRef)) {
            await repository.switchBranch(pull.headRef);
          } else {
            await repository.switchToRemoteBranch(
              `${context.baseRemote}/${pull.headRef}`,
              pull.headRef,
            );
          }
          return;
        }
        const local = `pr/${pull.number}`;
        await repository.fetchRefspec(
          context.baseRemote,
          `+refs/pull/${pull.number}/head:refs/heads/${local}`,
        );
        await repository.switchBranch(local);
      },
    );
  }

  async showList(): Promise<void> {
    let pulls: PullRequest[];
    try {
      pulls = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Loading pull requests…' },
        () => this.list(),
      );
    } catch (error) {
      this.output.error(`Loading pull requests failed: ${errorMessage(error)}`);
      void vscode.window.showErrorMessage(`Loading pull requests failed: ${describeError(error)}`);
      return;
    }
    if (pulls.length === 0) {
      void vscode.window.showInformationMessage('There are no open pull requests.');
      return;
    }
    const openButton = {
      iconPath: new vscode.ThemeIcon('link-external'),
      tooltip: 'Open in Browser',
    };
    const checkoutButton = { iconPath: new vscode.ThemeIcon('git-branch'), tooltip: 'Checkout' };
    const copyButton = { iconPath: new vscode.ThemeIcon('copy'), tooltip: 'Copy URL' };
    const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem & { pull: PullRequest }>();
    quickPick.title = 'Open Pull Requests';
    quickPick.placeholder = 'Enter opens the pull request in the browser';
    quickPick.matchOnDescription = true;
    quickPick.items = pulls.map((pull) => ({
      label: `#${pull.number} ${pull.title}`,
      description: `${pull.author} · ${pull.headRef} → ${pull.baseRef}${pull.draft ? ' · draft' : ''}`,
      iconPath: new vscode.ThemeIcon(pull.draft ? 'git-pull-request-draft' : 'git-pull-request'),
      buttons: [checkoutButton, copyButton, openButton],
      pull,
    }));
    quickPick.onDidTriggerItemButton(async ({ item, button }) => {
      if (button === checkoutButton) {
        quickPick.hide();
        await this.checkout(item.pull);
      } else if (button === copyButton) {
        await vscode.env.clipboard.writeText(item.pull.url);
        vscode.window.setStatusBarMessage('$(copy) Copied pull request URL', 3000);
      } else {
        await vscode.env.openExternal(vscode.Uri.parse(item.pull.url));
      }
    });
    quickPick.onDidAccept(async () => {
      const item = quickPick.selectedItems[0];
      quickPick.hide();
      if (item) {
        await vscode.env.openExternal(vscode.Uri.parse(item.pull.url));
      }
    });
    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
  }
}
