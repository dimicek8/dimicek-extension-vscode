import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { LocalBranch } from '../../git/parsers/refs';
import type { Repository } from '../../git/repository';
import type { PushFromWebview, PushState, PushToWebview } from '../../shared/protocol';
import { buildWebviewHtml, webviewOptions } from '../../vscode/webviewHtml';
import type { ChangesModel } from '../commit/changesModel';
import { openCommitFileDiff } from '../fileComparison';
import { describeGitError, errorMessage } from '../operations';

interface PushTarget {
  remote: string;
  remoteBranch: string;
}

export async function computePushState(
  repository: Repository,
  branchName: string,
  target?: PushTarget,
): Promise<PushState> {
  const [refs, remotes] = await Promise.all([repository.getRefs(), repository.getRemotes()]);
  if (remotes.length === 0) {
    throw new Error('This repository has no remote to push to.');
  }
  const local = refs.find(
    (ref): ref is LocalBranch => ref.type === 'branch' && ref.name === branchName,
  );
  if (!local) {
    throw new Error(`Branch '${branchName}' does not exist.`);
  }
  const upstream = local.upstream && local.upstream.remote !== '.' ? local.upstream : undefined;
  const remote =
    target?.remote ?? upstream?.remote ?? (remotes.includes('origin') ? 'origin' : remotes[0]!);
  const remoteBranch =
    target?.remoteBranch.trim() ||
    (upstream && upstream.remote === remote ? upstream.branch : branchName);
  const remoteRef = `refs/remotes/${remote}/${remoteBranch}`;
  const remoteBranchExists = refs.some((ref) => ref.fullName === remoteRef);

  const [commits, counts] = await Promise.all([
    repository.getOutgoingCommits(branchName, remote, remoteBranch),
    remoteBranchExists
      ? repository.countAheadBehind(`refs/heads/${branchName}`, remoteRef)
      : Promise.resolve({ ahead: 0, behind: 0 }),
  ]);

  return {
    repository: basename(repository.root),
    branch: branchName,
    remotes,
    remote,
    remoteBranch,
    remoteBranchExists,
    setUpstream: !upstream || upstream.gone,
    behind: counts.ahead,
    commits: commits.map((commit) => ({
      hash: commit.hash,
      parents: commit.parents,
      subject: commit.subject,
      author: commit.author.name,
      date: commit.authorDate.getTime(),
    })),
  };
}

export class PushDialog implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private state: PushState | undefined;
  private target: PushTarget | undefined;

  private readonly readyEmitter = new vscode.EventEmitter<void>();
  readonly onDidBecomeReady = this.readyEmitter.event;

  private readonly postEmitter = new vscode.EventEmitter<PushToWebview>();
  readonly onDidPost = this.postEmitter.event;

  private readonly pushedEmitter = new vscode.EventEmitter<PushState>();
  readonly onDidPush = this.pushedEmitter.event;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly model: ChangesModel,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  get currentState(): PushState | undefined {
    return this.state;
  }

  show(): void {
    const branch = this.model.branch.head;
    if (!this.model.repository) {
      void vscode.window.showWarningMessage('No Git repository is open.');
      return;
    }
    if (!branch) {
      void vscode.window.showWarningMessage(
        'Cannot push: HEAD is detached. Check out a branch first.',
      );
      return;
    }
    this.target = undefined;
    if (this.panel) {
      this.panel.reveal();
      void this.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'dimicek.push',
      `Push ${branch}`,
      vscode.ViewColumn.Active,
      { ...webviewOptions(this.extensionUri), retainContextWhenHidden: true },
    );
    panel.iconPath = new vscode.ThemeIcon('repo-push');
    panel.webview.html = buildWebviewHtml(panel.webview, this.extensionUri, 'push', 'Push');
    const subscription = panel.webview.onDidReceiveMessage((message: PushFromWebview) =>
      this.handleMessage(message),
    );
    panel.onDidDispose(() => {
      subscription.dispose();
      this.panel = undefined;
      this.state = undefined;
    });
    this.panel = panel;
  }

  close(): void {
    this.panel?.dispose();
  }

  private post(message: PushToWebview): void {
    this.postEmitter.fire(message);
    void this.panel?.webview.postMessage(message);
  }

  async refresh(): Promise<void> {
    const repository = this.model.repository;
    const branch = this.model.branch.head;
    if (!repository || !branch) {
      return;
    }
    try {
      this.state = await computePushState(repository, branch, this.target);
      if (this.panel) {
        this.panel.title = `Push ${branch}`;
      }
      this.post({ type: 'state', state: this.state });
    } catch (error) {
      this.post({ type: 'error', message: errorMessage(error) });
    }
  }

  async handleMessage(message: PushFromWebview): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.refresh();
        this.readyEmitter.fire();
        break;
      case 'changeTarget':
        this.target = { remote: message.remote, remoteBranch: message.remoteBranch };
        await this.refresh();
        break;
      case 'selectCommit': {
        const commit = this.state?.commits.find((candidate) => candidate.hash === message.hash);
        const repository = this.model.repository;
        if (commit && repository) {
          const files = await repository.getCommitFiles(commit.hash, commit.parents);
          this.post({ type: 'files', hash: commit.hash, files });
        }
        break;
      }
      case 'openFileDiff': {
        const root = this.model.repository?.root;
        if (root) {
          await openCommitFileDiff(root, message.hash, message.file, message.parent);
        }
        break;
      }
      case 'push':
        await this.push(message.force, message.tags);
        break;
      case 'cancel':
        this.close();
        break;
    }
  }

  async push(force: boolean, tags: boolean): Promise<boolean> {
    const repository = this.model.repository;
    const state = this.state;
    if (!repository || !state) {
      return false;
    }
    const destination = `${state.remote}/${state.remoteBranch}`;
    this.post({ type: 'busy', busy: true });
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Pushing ${state.branch} to ${destination}…`,
        },
        () =>
          repository.pushBranch({
            branch: state.branch,
            remote: state.remote,
            remoteBranch: state.remoteBranch,
            force,
            tags,
            setUpstream: state.setUpstream,
          }),
      );
    } catch (error) {
      this.output.error(`Push failed: ${errorMessage(error)}`);
      this.post({ type: 'busy', busy: false });
      this.post({ type: 'error', message: describeGitError(error) });
      return false;
    }
    const count = state.commits.length;
    const summary = `Pushed ${count === 1 ? '1 commit' : `${count} commits`} to ${destination}`;
    this.output.info(summary);
    vscode.window.setStatusBarMessage(`$(check) ${summary}`, 5000);
    this.pushedEmitter.fire(state);
    this.close();
    await this.model.refresh();
    return true;
  }

  dispose(): void {
    this.close();
    this.readyEmitter.dispose();
    this.postEmitter.dispose();
    this.pushedEmitter.dispose();
  }
}
