import * as vscode from 'vscode';
import type { Repository } from '../../git/repository';
import { GitHubClient } from '../../github/githubClient';
import { type GitHubRepoId, parseGitHubRemote, sameRepo } from '../../github/githubRemote';
import type { ChangesModel } from '../commit/changesModel';

export interface GitHubContext {
  repository: Repository;
  headRemote: string;
  headRepo: GitHubRepoId;
  baseRemote: string;
  baseRepo: GitHubRepoId;
}

export class GitHubService implements vscode.Disposable {
  client: GitHubClient;
  private lastRepository: Repository | undefined;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly model: ChangesModel) {
    this.client = new GitHubClient(() => this.token());
    this.subscription = model.onDidChange(() => {
      if (model.repository !== this.lastRepository) {
        this.lastRepository = model.repository;
        void this.updateContext();
      }
    });
  }

  async token(): Promise<string> {
    const session = await vscode.authentication.getSession('github', ['repo'], {
      createIfNone: true,
    });
    return session.accessToken;
  }

  async resolve(): Promise<GitHubContext | undefined> {
    const repository = this.model.repository;
    if (!repository) {
      return undefined;
    }
    const repos = new Map<string, GitHubRepoId>();
    for (const [name, url] of await repository.getRemoteUrls()) {
      const id = parseGitHubRemote(url);
      if (id) {
        repos.set(name, id);
      }
    }
    if (repos.size === 0) {
      return undefined;
    }
    const upstreamRemote = [...repos.keys()]
      .sort((a, b) => b.length - a.length)
      .find((name) => this.model.branch.upstream?.startsWith(`${name}/`));
    const headRemote = upstreamRemote ?? (repos.has('origin') ? 'origin' : [...repos.keys()][0]!);
    const headRepo = repos.get(headRemote)!;
    const upstream = repos.get('upstream');
    const fork = upstream && headRemote !== 'upstream' && !sameRepo(upstream, headRepo);
    return {
      repository,
      headRemote,
      headRepo,
      baseRemote: fork ? 'upstream' : headRemote,
      baseRepo: fork ? upstream : headRepo,
    };
  }

  async isAvailable(): Promise<boolean> {
    return (await this.resolve().catch(() => undefined)) !== undefined;
  }

  async updateContext(): Promise<void> {
    await vscode.commands.executeCommand(
      'setContext',
      'dimicek.hasGitHubRemote',
      await this.isAvailable(),
    );
  }

  dispose(): void {
    this.subscription.dispose();
  }
}
