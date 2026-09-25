import * as vscode from 'vscode';
import { GraphBuilder, type GraphRow } from '../../git/graph/graphBuilder';
import type { Commit } from '../../git/parsers/log';
import type { Repository } from '../../git/repository';
import type { RepoManager } from '../../vscode/repoManager';

export const LOG_PAGE_SIZE = 500;

export type LogUpdate =
  | {
      kind: 'reset';
      repository: Repository | undefined;
      commits: Commit[];
      rows: GraphRow[];
      hasMore: boolean;
    }
  | { kind: 'append'; commits: Commit[]; rows: GraphRow[]; hasMore: boolean }
  | { kind: 'error'; message: string };

export class LogModel implements vscode.Disposable {
  private repository: Repository | undefined;
  private commits: Commit[] = [];
  private rows: GraphRow[] = [];
  private graph = new GraphBuilder();
  private more = false;
  private generation = 0;
  private loadingMore: Promise<void> | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  private readonly updateEmitter = new vscode.EventEmitter<LogUpdate>();
  readonly onDidUpdate = this.updateEmitter.event;

  constructor(
    private readonly repoManager: RepoManager,
    private readonly output: vscode.LogOutputChannel,
    private readonly pageSize = LOG_PAGE_SIZE,
  ) {
    this.disposables.push(
      this.updateEmitter,
      repoManager.onDidChangeActiveRepository(() => void this.reload()),
    );
  }

  get loadedCommits(): readonly Commit[] {
    return this.commits;
  }

  get graphRows(): readonly GraphRow[] {
    return this.rows;
  }

  get hasMore(): boolean {
    return this.more;
  }

  get activeRepository(): Repository | undefined {
    return this.repository;
  }

  private async fetchPage(repository: Repository, skip: number, count: number): Promise<Commit[]> {
    return repository.getLog({ all: true, maxCount: count + 1, skip });
  }

  async reload(): Promise<void> {
    const generation = ++this.generation;
    this.loadingMore = undefined;
    const repository = this.repoManager.activeRepository;
    try {
      const page = repository ? await this.fetchPage(repository, 0, this.pageSize) : [];
      if (generation !== this.generation) {
        return;
      }
      this.repository = repository;
      this.more = page.length > this.pageSize;
      this.commits = page.slice(0, this.pageSize);
      this.graph = new GraphBuilder();
      this.rows = this.graph.add(this.commits);
      this.updateEmitter.fire({
        kind: 'reset',
        repository,
        commits: this.commits,
        rows: this.rows,
        hasMore: this.more,
      });
    } catch (error) {
      if (generation === this.generation) {
        this.report(error);
      }
    }
  }

  loadMore(): Promise<void> {
    if (!this.more || !this.repository) {
      return Promise.resolve();
    }
    this.loadingMore ??= this.loadNextPage(this.repository, this.generation).finally(() => {
      this.loadingMore = undefined;
    });
    return this.loadingMore;
  }

  private async loadNextPage(repository: Repository, generation: number): Promise<void> {
    try {
      const page = await this.fetchPage(repository, this.commits.length, this.pageSize);
      if (generation !== this.generation) {
        return;
      }
      const commits = page.slice(0, this.pageSize);
      this.more = page.length > this.pageSize;
      const rows = this.graph.add(commits);
      this.commits = [...this.commits, ...commits];
      this.rows = [...this.rows, ...rows];
      this.updateEmitter.fire({ kind: 'append', commits, rows, hasMore: this.more });
    } catch (error) {
      if (generation === this.generation) {
        this.report(error);
      }
    }
  }

  private report(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.output.error(`Loading log failed: ${message}`);
    this.updateEmitter.fire({ kind: 'error', message });
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose());
  }
}
