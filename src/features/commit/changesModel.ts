import * as vscode from 'vscode';
import type { BranchStatus } from '../../git/parsers/status';
import type { Repository } from '../../git/repository';
import type { RepoManager } from '../../vscode/repoManager';
import { type FileChange, toFileChanges } from './fileChanges';

export class ChangesModel implements vscode.Disposable {
  private currentRepository: Repository | undefined;
  private currentChanges: FileChange[] = [];
  private currentBranch: BranchStatus = {};
  private pending: AbortController | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changeEmitter.event;

  constructor(
    private readonly repoManager: RepoManager,
    private readonly output: vscode.LogOutputChannel,
  ) {
    this.disposables.push(
      this.changeEmitter,
      repoManager.onDidChangeActiveRepository(() => void this.refresh()),
      repoManager.onDidChangeRepository((repository) => {
        if (repository === this.repoManager.activeRepository) {
          void this.refresh();
        }
      }),
    );
  }

  get repository(): Repository | undefined {
    return this.currentRepository;
  }

  get changes(): readonly FileChange[] {
    return this.currentChanges;
  }

  get branch(): BranchStatus {
    return this.currentBranch;
  }

  async refresh(): Promise<void> {
    this.pending?.abort();
    const controller = new AbortController();
    this.pending = controller;
    const repository = this.repoManager.activeRepository;

    try {
      const status = repository ? await repository.getStatus(controller.signal) : undefined;
      if (controller.signal.aborted) {
        return;
      }
      this.currentRepository = repository;
      this.currentChanges = status ? toFileChanges(status) : [];
      this.currentBranch = status?.branch ?? {};
      await vscode.commands.executeCommand('setContext', 'dimicek.hasRepository', !!repository);
      this.changeEmitter.fire();
    } catch (error) {
      if (!controller.signal.aborted) {
        this.output.error(
          `Refreshing changes failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    } finally {
      if (this.pending === controller) {
        this.pending = undefined;
      }
    }
  }

  dispose(): void {
    this.pending?.abort();
    this.disposables.forEach((disposable) => disposable.dispose());
  }
}
