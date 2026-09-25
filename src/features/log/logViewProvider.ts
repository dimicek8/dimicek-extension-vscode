import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { GraphRow } from '../../git/graph/graphBuilder';
import type { Commit } from '../../git/parsers/log';
import type { LogCommit, LogFromWebview, LogToWebview } from '../../shared/protocol';
import { buildWebviewHtml, webviewOptions } from '../../vscode/webviewHtml';
import type { LogModel, LogUpdate } from './logModel';

export function toLogCommit(commit: Commit, graph: GraphRow): LogCommit {
  return {
    hash: commit.hash,
    parents: commit.parents,
    subject: commit.subject,
    author: commit.author.name,
    authorEmail: commit.author.email,
    date: commit.authorDate.getTime(),
    isHead: commit.isHead,
    graph,
  };
}

export class LogViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'dimicek.log';

  private view: vscode.WebviewView | undefined;
  private ready = false;
  private readonly disposables: vscode.Disposable[] = [];

  private readonly readyEmitter = new vscode.EventEmitter<void>();
  readonly onDidBecomeReady = this.readyEmitter.event;

  private readonly postEmitter = new vscode.EventEmitter<LogToWebview>();
  readonly onDidPost = this.postEmitter.event;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly model: LogModel,
  ) {
    this.disposables.push(
      this.readyEmitter,
      this.postEmitter,
      model.onDidUpdate((update) => this.forward(update)),
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.ready = false;
    view.webview.options = webviewOptions(this.extensionUri);
    view.webview.html = buildWebviewHtml(view.webview, this.extensionUri, 'log', 'Git Log');
    const subscription = view.webview.onDidReceiveMessage((message: LogFromWebview) =>
      this.handleMessage(message),
    );
    view.onDidDispose(() => {
      subscription.dispose();
      this.view = undefined;
      this.ready = false;
    });
  }

  private async handleMessage(message: LogFromWebview): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.ready = true;
        this.post(this.resetMessage());
        this.readyEmitter.fire();
        if (!this.model.activeRepository) {
          await this.model.reload();
        }
        break;
      case 'loadMore':
        this.post({ type: 'loading', loading: true });
        await this.model.loadMore();
        this.post({ type: 'loading', loading: false });
        break;
    }
  }

  private resetMessage(): LogToWebview {
    const repository = this.model.activeRepository;
    return {
      type: 'reset',
      repository: repository ? basename(repository.root) : undefined,
      commits: this.model.loadedCommits.map((commit, index) =>
        toLogCommit(commit, this.model.graphRows[index]!),
      ),
      hasMore: this.model.hasMore,
    };
  }

  private forward(update: LogUpdate): void {
    switch (update.kind) {
      case 'reset':
        this.post(this.resetMessage());
        break;
      case 'append':
        this.post({
          type: 'append',
          commits: update.commits.map((commit, index) => toLogCommit(commit, update.rows[index]!)),
          hasMore: update.hasMore,
        });
        break;
      case 'error':
        this.post({ type: 'error', message: update.message });
        break;
    }
  }

  private post(message: LogToWebview): void {
    this.postEmitter.fire(message);
    if (this.ready) {
      void this.view?.webview.postMessage(message);
    }
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose());
  }
}
