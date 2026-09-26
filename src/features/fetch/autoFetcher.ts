import * as vscode from 'vscode';
import type { RepoManager } from '../../vscode/repoManager';
import { errorMessage } from '../operations';

export const AUTO_FETCH_SETTING = 'dimicek.fetch.autoFetchInterval';

export class AutoFetcher implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private minutes = 0;
  private readonly subscription: vscode.Disposable;

  constructor(
    private readonly repoManager: RepoManager,
    private readonly output: vscode.LogOutputChannel,
  ) {
    this.subscription = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(AUTO_FETCH_SETTING)) {
        this.configure();
      }
    });
    this.configure();
  }

  get intervalMinutes(): number {
    return this.minutes;
  }

  private configure(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.minutes = Math.max(
      0,
      vscode.workspace.getConfiguration().get<number>(AUTO_FETCH_SETTING, 0),
    );
    if (this.minutes > 0) {
      this.timer = setInterval(() => void this.fetchAll(), this.minutes * 60_000);
      this.output.info(`Automatic fetch every ${this.minutes} min`);
    }
  }

  fetchAll(): Promise<void> {
    this.running ??= this.fetchRepositories().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async fetchRepositories(): Promise<void> {
    for (const repository of this.repoManager.repositories) {
      try {
        await repository.fetch();
      } catch (error) {
        this.output.warn(`Automatic fetch of ${repository.root} failed: ${errorMessage(error)}`);
      }
    }
  }

  dispose(): void {
    clearInterval(this.timer);
    this.subscription.dispose();
  }
}
