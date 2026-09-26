import * as vscode from 'vscode';
import type {
  CommitViewFromWebview,
  CommitViewState,
  CommitViewToWebview,
} from '../../shared/protocol';
import { buildWebviewHtml, webviewOptions } from '../../vscode/webviewHtml';
import type { CommitMessageHistory } from './commitMessageHistory';
import type { ChangesModel } from './changesModel';
import { commitPaths } from './fileChanges';

export interface CommitOptions {
  message: string;
  amend: boolean;
  push: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fileCount(count: number): string {
  return count === 1 ? '1 file' : `${count} files`;
}

export class CommitViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'dimicek.commit';

  private view: vscode.WebviewView | undefined;
  private busy = false;
  private readonly disposables: vscode.Disposable[] = [];

  private readonly readyEmitter = new vscode.EventEmitter<void>();
  readonly onDidBecomeReady = this.readyEmitter.event;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly model: ChangesModel,
    private readonly history: CommitMessageHistory,
    private readonly output: vscode.LogOutputChannel,
    private readonly describeBranch: () => string | undefined,
  ) {
    this.disposables.push(
      this.readyEmitter,
      model.onDidChange(() => this.postState()),
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = webviewOptions(this.extensionUri);
    view.webview.html = buildWebviewHtml(view.webview, this.extensionUri, 'commit', 'Commit');
    const subscription = view.webview.onDidReceiveMessage((message: CommitViewFromWebview) =>
      this.handleMessage(message),
    );
    view.onDidDispose(() => {
      subscription.dispose();
      this.view = undefined;
    });
  }

  private async handleMessage(message: CommitViewFromWebview): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.postState();
        this.readyEmitter.fire();
        break;
      case 'commit':
        await this.commit(message);
        break;
      case 'requestLastCommitMessage': {
        const lastMessage = await this.model.repository?.getLastCommitMessage();
        if (lastMessage) {
          this.post({ type: 'lastCommitMessage', message: lastMessage });
        }
        break;
      }
      case 'showHistory':
        await this.showHistory();
        break;
    }
  }

  private post(message: CommitViewToWebview): void {
    void this.view?.webview.postMessage(message);
  }

  private postState(): void {
    const state: CommitViewState = {
      hasRepository: this.model.repository !== undefined,
      branch: this.describeBranch(),
      includedCount: this.model.includedChanges.length,
      totalCount: this.model.changes.length,
      busy: this.busy,
    };
    this.post({ type: 'state', state });
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.postState();
  }

  private async showHistory(): Promise<void> {
    const messages = this.history.list();
    if (messages.length === 0) {
      void vscode.window.showInformationMessage('No recent commit messages yet.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      messages.map((message) => {
        const [subject = '', ...rest] = message.split('\n');
        return { label: subject, detail: rest.join(' ').trim() || undefined, message };
      }),
      { placeHolder: 'Recent commit messages', matchOnDetail: true },
    );
    if (picked) {
      this.post({ type: 'setMessage', message: picked.message });
    }
  }

  async commit(options: CommitOptions): Promise<boolean> {
    const repository = this.model.repository;
    const message = options.message.trim();
    const changes = this.model.includedChanges;
    if (!repository || this.busy) {
      return false;
    }
    if (message === '') {
      void vscode.window.showWarningMessage('Enter a commit message.');
      return false;
    }
    if (!options.amend && changes.length === 0) {
      void vscode.window.showWarningMessage('Select files to commit.');
      return false;
    }

    this.setBusy(true);
    try {
      await vscode.window.withProgress(
        { location: { viewId: CommitViewProvider.viewId }, title: 'Committing…' },
        () => repository.commit({ message, amend: options.amend, ...commitPaths(changes) }),
      );
    } catch (error) {
      this.output.error(`Commit failed: ${errorMessage(error)}`);
      void vscode.window.showErrorMessage(`Commit failed: ${errorMessage(error)}`);
      this.setBusy(false);
      void this.model.refresh();
      return false;
    }

    await this.history.add(message);
    this.post({ type: 'committed' });
    const subject = message.split('\n')[0];
    const summary = options.amend
      ? `Amended commit: ${subject}`
      : `Committed ${fileCount(changes.length)}: ${subject}`;
    this.output.info(summary);
    vscode.window.setStatusBarMessage(`$(check) ${summary}`, 5000);

    this.setBusy(false);
    await this.model.refresh();
    if (options.push) {
      await vscode.commands.executeCommand('dimicek.push.show');
    }
    return true;
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose());
  }
}
