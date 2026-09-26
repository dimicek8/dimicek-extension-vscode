import * as vscode from 'vscode';
import type { RebaseEntry } from '../../git/rebase/rebaseTodo';
import type { RebaseFromWebview, RebaseState, RebaseToWebview } from '../../shared/protocol';
import { buildWebviewHtml, webviewOptions } from '../../vscode/webviewHtml';
import type { ChangesModel } from '../commit/changesModel';
import { continueOnConflict, describeGitError, errorMessage } from '../operations';

export class RebaseDialog implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private state: RebaseState | undefined;

  private readonly readyEmitter = new vscode.EventEmitter<void>();
  readonly onDidBecomeReady = this.readyEmitter.event;

  private readonly postEmitter = new vscode.EventEmitter<RebaseToWebview>();
  readonly onDidPost = this.postEmitter.event;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly model: ChangesModel,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  get currentState(): RebaseState | undefined {
    return this.state;
  }

  async show(hash: string): Promise<boolean> {
    const repository = this.model.repository;
    const branch = this.model.branch.head;
    if (!repository || !branch) {
      void vscode.window.showWarningMessage('Interactive rebase needs a checked out branch.');
      return false;
    }
    try {
      const { base, commits } = await repository.getRebaseCommits(hash);
      this.state = {
        branch,
        base,
        commits: commits.map((commit) => ({
          hash: commit.hash,
          subject: commit.subject,
          message: commit.body ? `${commit.subject}\n\n${commit.body}` : commit.subject,
          author: commit.author.name,
          date: commit.authorDate.getTime(),
        })),
      };
    } catch (error) {
      void vscode.window.showWarningMessage(`Cannot rebase interactively: ${errorMessage(error)}`);
      return false;
    }

    if (this.panel) {
      this.panel.reveal();
      this.post({ type: 'state', state: this.state });
      return true;
    }
    const panel = vscode.window.createWebviewPanel(
      'dimicek.rebase',
      `Rebase ${branch}`,
      vscode.ViewColumn.Active,
      { ...webviewOptions(this.extensionUri), retainContextWhenHidden: true },
    );
    panel.iconPath = new vscode.ThemeIcon('git-pull-request');
    panel.webview.html = buildWebviewHtml(panel.webview, this.extensionUri, 'rebase', 'Rebase');
    const subscription = panel.webview.onDidReceiveMessage((message: RebaseFromWebview) =>
      this.handleMessage(message),
    );
    panel.onDidDispose(() => {
      subscription.dispose();
      this.panel = undefined;
      this.state = undefined;
    });
    this.panel = panel;
    return true;
  }

  close(): void {
    this.panel?.dispose();
  }

  private post(message: RebaseToWebview): void {
    this.postEmitter.fire(message);
    void this.panel?.webview.postMessage(message);
  }

  async handleMessage(message: RebaseFromWebview): Promise<void> {
    switch (message.type) {
      case 'ready':
        if (this.state) {
          this.post({ type: 'state', state: this.state });
        }
        this.readyEmitter.fire();
        break;
      case 'start':
        await this.start(message.entries);
        break;
      case 'cancel':
        this.close();
        break;
    }
  }

  async start(entries: readonly RebaseEntry[]): Promise<boolean> {
    const repository = this.model.repository;
    const state = this.state;
    if (!repository || !state) {
      return false;
    }
    this.post({ type: 'busy', busy: true });
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Rebasing ${state.branch}…` },
        () =>
          continueOnConflict(
            () => repository.interactiveRebase(state.base, entries),
            `Rebasing '${state.branch}' stopped because of conflicts. Resolve them, mark the files as resolved and choose Continue Rebase in the branches popup.`,
          ),
      );
    } catch (error) {
      this.output.error(`Interactive rebase failed: ${errorMessage(error)}`);
      this.post({ type: 'busy', busy: false });
      this.post({ type: 'error', message: describeGitError(error) });
      return false;
    }
    vscode.window.setStatusBarMessage(`$(check) Rebased ${state.branch}`, 5000);
    this.close();
    await this.model.refresh();
    return true;
  }

  dispose(): void {
    this.close();
    this.readyEmitter.dispose();
    this.postEmitter.dispose();
  }
}
