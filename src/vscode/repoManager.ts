import { isAbsolute, relative } from 'node:path';
import * as vscode from 'vscode';
import type { Git } from '../git/gitExec';
import { Repository } from '../git/repository';
import type { GitApi, GitApiRepository, GitExtension } from './gitExtensionApi';
import { createGit } from './gitSetup';

interface ManagedRepository {
  repository: Repository;
  subscription: vscode.Disposable;
}

export interface RepoManagerOptions {
  debounceMs?: number;
}

function contains(root: string, file: string): boolean {
  const path = relative(root, file);
  return !path.startsWith('..') && !isAbsolute(path);
}

async function getGitApi(): Promise<GitApi> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!extension) {
    throw new Error('The built-in Git extension (vscode.git) is not available.');
  }
  const gitExtension = extension.isActive ? extension.exports : await extension.activate();
  if (!gitExtension.enabled) {
    throw new Error(
      'Git is disabled in VS Code. Enable the "git.enabled" setting and reload the window.',
    );
  }
  return gitExtension.getAPI(1);
}

export class RepoManager implements vscode.Disposable {
  private readonly managed = new Map<string, ManagedRepository>();
  private readonly changeTimers = new Map<string, NodeJS.Timeout>();
  private readonly disposables: vscode.Disposable[] = [];
  private active: Repository | undefined;

  private readonly repositoriesEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeRepositories = this.repositoriesEmitter.event;

  private readonly activeEmitter = new vscode.EventEmitter<Repository | undefined>();
  readonly onDidChangeActiveRepository = this.activeEmitter.event;

  private readonly changeEmitter = new vscode.EventEmitter<Repository>();
  readonly onDidChangeRepository = this.changeEmitter.event;

  static async create(
    output: vscode.LogOutputChannel,
    options: RepoManagerOptions = {},
  ): Promise<RepoManager> {
    const api = await getGitApi();
    const git = await createGit(output, api.git.path);
    const manager = new RepoManager(api, git, output, options.debounceMs ?? 300);
    await manager.initialized();
    return manager;
  }

  private constructor(
    readonly gitApi: GitApi,
    private readonly git: Git,
    private readonly output: vscode.LogOutputChannel,
    private readonly debounceMs: number,
  ) {
    this.disposables.push(
      this.repositoriesEmitter,
      this.activeEmitter,
      this.changeEmitter,
      gitApi.onDidOpenRepository((repository) => this.open(repository)),
      gitApi.onDidCloseRepository((repository) => this.close(repository)),
      vscode.window.onDidChangeActiveTextEditor(() => this.updateActive()),
    );
    gitApi.repositories.forEach((repository) => this.open(repository));
  }

  private initialized(): Promise<void> {
    if (this.gitApi.state === 'initialized') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const subscription = this.gitApi.onDidChangeState((state) => {
        if (state === 'initialized') {
          subscription.dispose();
          resolve();
        }
      });
      this.disposables.push(subscription);
    });
  }

  get repositories(): Repository[] {
    return [...this.managed.values()].map(({ repository }) => repository);
  }

  get activeRepository(): Repository | undefined {
    return this.active;
  }

  getRepository(uri: vscode.Uri): Repository | undefined {
    if (uri.scheme !== 'file') {
      return undefined;
    }
    return this.repositories
      .filter((repository) => contains(repository.root, uri.fsPath))
      .sort((a, b) => b.root.length - a.root.length)[0];
  }

  private open(gitRepository: GitApiRepository): void {
    const root = gitRepository.rootUri.fsPath;
    if (this.managed.has(root)) {
      return;
    }
    const repository = new Repository(root, this.git);
    const subscription = gitRepository.state.onDidChange(() => this.scheduleChange(repository));
    this.managed.set(root, { repository, subscription });
    this.output.info(`Repository opened: ${root}`);
    this.repositoriesEmitter.fire();
    this.updateActive();
  }

  private close(gitRepository: GitApiRepository): void {
    const root = gitRepository.rootUri.fsPath;
    const entry = this.managed.get(root);
    if (!entry) {
      return;
    }
    entry.subscription.dispose();
    clearTimeout(this.changeTimers.get(root));
    this.changeTimers.delete(root);
    this.managed.delete(root);
    this.output.info(`Repository closed: ${root}`);
    this.repositoriesEmitter.fire();
    this.updateActive();
  }

  private scheduleChange(repository: Repository): void {
    clearTimeout(this.changeTimers.get(repository.root));
    this.changeTimers.set(
      repository.root,
      setTimeout(() => {
        this.changeTimers.delete(repository.root);
        this.changeEmitter.fire(repository);
      }, this.debounceMs),
    );
  }

  private updateActive(): void {
    const document = vscode.window.activeTextEditor?.document;
    const fromEditor = document ? this.getRepository(document.uri) : undefined;
    const stillOpen = this.active && this.managed.has(this.active.root) ? this.active : undefined;
    const next = fromEditor ?? stillOpen ?? this.repositories[0];
    if (next !== this.active) {
      this.active = next;
      this.output.info(`Active repository: ${next?.root ?? 'none'}`);
      this.activeEmitter.fire(next);
    }
  }

  dispose(): void {
    this.changeTimers.forEach((timer) => clearTimeout(timer));
    this.changeTimers.clear();
    this.managed.forEach(({ subscription }) => subscription.dispose());
    this.managed.clear();
    this.disposables.forEach((disposable) => disposable.dispose());
  }
}
