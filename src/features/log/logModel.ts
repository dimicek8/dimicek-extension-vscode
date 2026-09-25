import * as vscode from 'vscode';
import { GraphBuilder, type GraphRow, linearRows } from '../../git/graph/graphBuilder';
import type { Commit } from '../../git/parsers/log';
import type { NameStatusEntry } from '../../git/parsers/nameStatus';
import type { Repository } from '../../git/repository';
import type { LogFilters } from '../../shared/protocol';
import type { RepoManager } from '../../vscode/repoManager';
import { isFiltered, looksLikeHash, toLogOptions } from './logQuery';

export const LOG_PAGE_SIZE = 500;

export type LogUpdate =
  | {
      kind: 'reset';
      repository: Repository | undefined;
      commits: Commit[];
      rows: GraphRow[];
      preserve: boolean;
    }
  | { kind: 'append'; commits: Commit[]; rows: GraphRow[] }
  | { kind: 'error'; message: string };

export class LogModel implements vscode.Disposable {
  private repository: Repository | undefined;
  private commits: Commit[] = [];
  private rows: GraphRow[] = [];
  private graph: GraphBuilder | undefined;
  private more = false;
  private currentFilters: LogFilters = {};
  private branchNames: string[] = [];
  private generation = 0;
  private loadingMore: Promise<void> | undefined;
  private fingerprint: string | undefined;
  private latestLoad: Promise<void> = Promise.resolve();
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
      repoManager.onDidChangeActiveRepository(() => {
        this.currentFilters = {};
        void this.reload();
      }),
      repoManager.onDidChangeRepository((repository) => {
        if (repository === this.repository) {
          void this.refresh();
        }
      }),
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

  get filters(): LogFilters {
    return this.currentFilters;
  }

  get branches(): readonly string[] {
    return this.branchNames;
  }

  async getDetails(
    hash: string,
  ): Promise<{ commit: Commit; files: NameStatusEntry[] } | undefined> {
    const repository = this.repository;
    if (!repository) {
      return undefined;
    }
    const commit =
      this.commits.find((candidate) => candidate.hash === hash) ??
      (await repository.getLog({ revisions: [hash], maxCount: 1 }))[0];
    if (!commit) {
      return undefined;
    }
    return { commit, files: await repository.getCommitFiles(commit.hash, commit.parents) };
  }

  setFilters(filters: LogFilters): Promise<void> {
    this.currentFilters = filters;
    return this.reload();
  }

  private async fetchPage(
    repository: Repository,
    skip: number,
    count = this.pageSize,
  ): Promise<Commit[]> {
    const { text } = this.currentFilters;
    if (skip === 0 && looksLikeHash(text) && (await repository.revisionExists(text.trim()))) {
      return repository.getLog({ revisions: [text.trim()], maxCount: 1 });
    }
    return repository.getLog({
      ...toLogOptions(this.currentFilters),
      maxCount: count + 1,
      skip,
    });
  }

  private graphRowsFor(commits: readonly Commit[]): GraphRow[] {
    return this.graph ? this.graph.add(commits) : linearRows(commits.length);
  }

  private async loadBranchNames(repository: Repository): Promise<string[]> {
    const refs = await repository.getRefs();
    const locals = refs.filter((ref) => ref.type === 'branch').map((ref) => ref.name);
    const remotes = refs.filter((ref) => ref.type === 'remoteBranch').map((ref) => ref.name);
    return [...locals.sort(), ...remotes.sort()];
  }

  reload(): Promise<void> {
    return this.load(false);
  }

  async refresh(): Promise<boolean> {
    const repository = this.repository;
    if (!repository || repository !== this.repoManager.activeRepository) {
      return false;
    }
    const fingerprint = await repository.getHistoryFingerprint().catch(() => undefined);
    if (fingerprint !== undefined && fingerprint === this.fingerprint) {
      return false;
    }
    await this.load(true);
    return true;
  }

  private load(preserve: boolean): Promise<void> {
    const run = this.runLoad(preserve);
    this.latestLoad = run;
    return this.settle(run);
  }

  private async settle(run: Promise<void>): Promise<void> {
    await run;
    if (this.latestLoad !== run) {
      await this.settle(this.latestLoad);
    }
  }

  private async runLoad(preserve: boolean): Promise<void> {
    const generation = ++this.generation;
    this.loadingMore = undefined;
    const repository = this.repoManager.activeRepository;
    const count = preserve ? Math.max(this.pageSize, this.commits.length) : this.pageSize;
    try {
      const [page, branches, fingerprint] = repository
        ? await Promise.all([
            this.fetchPage(repository, 0, count),
            this.loadBranchNames(repository),
            repository.getHistoryFingerprint().catch(() => undefined),
          ])
        : [[], [], undefined];
      if (generation !== this.generation) {
        return;
      }
      this.repository = repository;
      this.fingerprint = fingerprint;
      this.branchNames = branches;
      this.more = page.length > count;
      this.commits = page.slice(0, count);
      this.graph = isFiltered(this.currentFilters) ? undefined : new GraphBuilder();
      this.rows = this.graphRowsFor(this.commits);
      this.updateEmitter.fire({
        kind: 'reset',
        repository,
        commits: this.commits,
        rows: this.rows,
        preserve,
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
      const page = await this.fetchPage(repository, this.commits.length);
      if (generation !== this.generation) {
        return;
      }
      const commits = page.slice(0, this.pageSize);
      const rows = this.graphRowsFor(commits);
      this.more = page.length > this.pageSize;
      this.commits = [...this.commits, ...commits];
      this.rows = [...this.rows, ...rows];
      this.updateEmitter.fire({ kind: 'append', commits, rows });
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
