import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { GraphRow } from '../../git/graph/graphBuilder';
import type { Commit } from '../../git/parsers/log';
import type { NameStatusEntry } from '../../git/parsers/nameStatus';
import type {
  LogCommit,
  LogCommitDetails,
  LogFileChange,
  LogFromWebview,
  LogToWebview,
} from '../../shared/protocol';
import { toEmptyUri, toGitUri } from '../../vscode/gitContentProvider';
import { buildWebviewHtml, webviewOptions } from '../../vscode/webviewHtml';
import type { LogModel, LogUpdate } from './logModel';
import { toLogRefs } from './logRefs';

export function toLogCommit(commit: Commit, graph: GraphRow): LogCommit {
  return {
    hash: commit.hash,
    parents: commit.parents,
    subject: commit.subject,
    author: commit.author.name,
    authorEmail: commit.author.email,
    date: commit.authorDate.getTime(),
    isHead: commit.isHead,
    refs: toLogRefs(commit.refs, commit.isHead, commit.headRef),
    graph,
  };
}

export function toLogDetails(commit: Commit, files: NameStatusEntry[]): LogCommitDetails {
  return {
    hash: commit.hash,
    subject: commit.subject,
    body: commit.body,
    author: commit.author.name,
    authorEmail: commit.author.email,
    date: commit.authorDate.getTime(),
    committer: commit.committer.name,
    committerEmail: commit.committer.email,
    commitDate: commit.commitDate.getTime(),
    parents: commit.parents,
    refs: toLogRefs(commit.refs, commit.isHead, commit.headRef),
    files,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class LogViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'dimicek.log';

  private view: vscode.WebviewView | undefined;
  private ready = false;
  private selectedHash: string | undefined;
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

  async handleMessage(message: LogFromWebview): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.ready = true;
        this.post(this.resetMessage(false));
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
      case 'setFilters':
        this.post({ type: 'loading', loading: true });
        await this.model.setFilters(message.filters);
        this.post({ type: 'loading', loading: false });
        break;
      case 'selectCommit':
        await this.showDetails(message.hash);
        break;
      case 'openFileDiff':
        await this.openFileDiff(message.hash, message.file, message.parent);
        break;
      case 'copy':
        await vscode.env.clipboard.writeText(message.text);
        vscode.window.setStatusBarMessage(`$(copy) Copied ${message.text}`, 3000);
        break;
    }
  }

  private async showDetails(hash: string): Promise<void> {
    this.selectedHash = hash;
    try {
      const details = await this.model.getDetails(hash);
      if (this.selectedHash !== hash) {
        return;
      }
      if (details) {
        this.post({ type: 'details', details: toLogDetails(details.commit, details.files) });
      } else {
        this.post({ type: 'detailsError', hash, message: 'Commit not found.' });
      }
    } catch (error) {
      if (this.selectedHash === hash) {
        this.post({ type: 'detailsError', hash, message: errorMessage(error) });
      }
    }
  }

  async openFileDiff(hash: string, file: LogFileChange, parent?: string): Promise<void> {
    const root = this.model.activeRepository?.root;
    if (!root) {
      return;
    }
    const left =
      file.status === 'added' || !parent
        ? toEmptyUri(root, file.path)
        : toGitUri(root, file.originalPath ?? file.path, parent);
    const right =
      file.status === 'deleted' ? toEmptyUri(root, file.path) : toGitUri(root, file.path, hash);
    const title = `${basename(file.path)} (${parent ? parent.slice(0, 8) : 'empty'} ↔ ${hash.slice(0, 8)})`;
    await vscode.commands.executeCommand('vscode.diff', left, right, title, { preview: true });
  }

  private resetMessage(preserve: boolean): LogToWebview {
    const repository = this.model.activeRepository;
    return {
      type: 'reset',
      repository: repository ? basename(repository.root) : undefined,
      commits: this.model.loadedCommits.map((commit, index) =>
        toLogCommit(commit, this.model.graphRows[index]!),
      ),
      hasMore: this.model.hasMore,
      filters: this.model.filters,
      branches: [...this.model.branches],
      preserve,
    };
  }

  private forward(update: LogUpdate): void {
    switch (update.kind) {
      case 'reset':
        this.post(this.resetMessage(update.preserve));
        break;
      case 'append':
        this.post({
          type: 'append',
          commits: update.commits.map((commit, index) => toLogCommit(commit, update.rows[index]!)),
          hasMore: this.model.hasMore,
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
