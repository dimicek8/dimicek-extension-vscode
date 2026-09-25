import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GitError } from './gitError';
import { type GitRunner, isVersionAtLeast } from './gitExec';
import { buildLogArgs, type Commit, type LogOptions, parseLog } from './parsers/log';
import { parseRefs, type Ref, REFS_FORMAT } from './parsers/refs';
import { type GitStatus, parseStatus } from './parsers/status';

export interface CommitRequest {
  message: string;
  paths: readonly string[];
  addPaths?: readonly string[];
  amend?: boolean;
}

const PUSH_TIMEOUT_MS = 5 * 60_000;

export type OperationKind = 'merge' | 'rebase' | 'cherryPick' | 'revert';

export interface OperationState {
  kind: OperationKind;
  branch?: string;
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

export class Repository {
  private writeQueue: Promise<unknown> = Promise.resolve();
  private gitDir: Promise<string> | undefined;

  constructor(
    readonly root: string,
    private readonly git: GitRunner,
  ) {}

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  private async run(
    args: string[],
    signal?: AbortSignal,
    options: { input?: string; timeoutMs?: number } = {},
  ): Promise<string> {
    const { stdout } = await this.git.exec(args, { cwd: this.root, signal, ...options });
    return stdout;
  }

  async getStatus(signal?: AbortSignal): Promise<GitStatus> {
    const args = ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'];
    if (isVersionAtLeast(this.git.version, '2.35')) {
      args.push('--show-stash');
    }
    return parseStatus(await this.run(args, signal));
  }

  async getRemotes(signal?: AbortSignal): Promise<string[]> {
    return (await this.run(['remote'], signal)).split('\n').filter(Boolean);
  }

  async getRefs(signal?: AbortSignal): Promise<Ref[]> {
    const [remotes, output] = await Promise.all([
      this.getRemotes(signal),
      this.run(
        ['for-each-ref', `--format=${REFS_FORMAT}`, 'refs/heads', 'refs/remotes', 'refs/tags'],
        signal,
      ),
    ]);
    return parseRefs(output, remotes);
  }

  async hasCommits(signal?: AbortSignal): Promise<boolean> {
    try {
      await this.run(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], signal);
      return true;
    } catch (error) {
      if (error instanceof GitError && error.exitCode === 1) {
        return false;
      }
      throw error;
    }
  }

  async getLog(options: LogOptions = {}, signal?: AbortSignal): Promise<Commit[]> {
    try {
      return parseLog(await this.run(buildLogArgs(options), signal));
    } catch (error) {
      if (error instanceof GitError && !(await this.hasCommits(signal))) {
        return [];
      }
      throw error;
    }
  }

  getFileContent(ref: string, path: string, signal?: AbortSignal): Promise<string> {
    return this.run(['cat-file', '--filters', `${ref}:${path}`], signal);
  }

  rollback(plan: { restore: readonly string[]; unstage: readonly string[] }): Promise<void> {
    return this.exclusive(async () => {
      if (plan.restore.length > 0) {
        await this.run([
          'restore',
          '--source=HEAD',
          '--staged',
          '--worktree',
          '--',
          ...plan.restore,
        ]);
      }
      if (plan.unstage.length > 0) {
        await this.run(['rm', '--cached', '--quiet', '-r', '--force', '--', ...plan.unstage]);
      }
    });
  }

  add(paths: readonly string[]): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['add', '--', ...paths]);
    });
  }

  getGitDir(): Promise<string> {
    this.gitDir ??= this.run(['rev-parse', '--absolute-git-dir']).then(
      (output) => output.trim(),
      (error: unknown) => {
        this.gitDir = undefined;
        throw error;
      },
    );
    return this.gitDir;
  }

  async getOperationState(): Promise<OperationState | undefined> {
    const gitDir = await this.getGitDir();
    for (const directory of ['rebase-merge', 'rebase-apply']) {
      if (await exists(join(gitDir, directory))) {
        const headName = await readFile(join(gitDir, directory, 'head-name'), 'utf8').catch(
          () => '',
        );
        const branch = headName.trim().replace(/^refs\/heads\//, '');
        return {
          kind: 'rebase',
          branch: branch && branch !== 'detached HEAD' ? branch : undefined,
        };
      }
    }
    const markers: Array<[string, OperationKind]> = [
      ['MERGE_HEAD', 'merge'],
      ['CHERRY_PICK_HEAD', 'cherryPick'],
      ['REVERT_HEAD', 'revert'],
    ];
    for (const [file, kind] of markers) {
      if (await exists(join(gitDir, file))) {
        return { kind };
      }
    }
    return undefined;
  }

  async isMerging(signal?: AbortSignal): Promise<boolean> {
    try {
      await this.run(['rev-parse', '--quiet', '--verify', 'MERGE_HEAD'], signal);
      return true;
    } catch (error) {
      if (error instanceof GitError && error.exitCode === 1) {
        return false;
      }
      throw error;
    }
  }

  async getLastCommitMessage(signal?: AbortSignal): Promise<string> {
    if (!(await this.hasCommits(signal))) {
      return '';
    }
    return (await this.run(['log', '-1', '--format=%B'], signal)).trim();
  }

  commit(request: CommitRequest): Promise<void> {
    return this.exclusive(async () => {
      const { message, paths, addPaths = [], amend = false } = request;
      if (paths.length === 0 && !amend) {
        throw new Error('No files selected for commit.');
      }
      if (addPaths.length > 0) {
        await this.run(['add', '--', ...addPaths]);
      }
      const args = ['commit', '--quiet', '--file=-'];
      if (amend) {
        args.push('--amend');
      }
      if (await this.isMerging()) {
        if (paths.length > 0) {
          await this.run(['add', '--all', '--', ...paths]);
        }
      } else {
        args.push('--only');
        if (paths.length > 0) {
          args.push('--', ...paths);
        }
      }
      await this.run(args, undefined, { input: message });
    });
  }

  push(signal?: AbortSignal): Promise<void> {
    return this.exclusive(async () => {
      const { branch } = await this.getStatus(signal);
      if (!branch.head) {
        throw new Error('Cannot push: HEAD is detached.');
      }
      if (branch.upstream) {
        await this.run(['push'], signal, { timeoutMs: PUSH_TIMEOUT_MS });
        return;
      }
      const remotes = await this.getRemotes(signal);
      if (remotes.length !== 1) {
        throw new Error(
          remotes.length === 0
            ? 'Cannot push: the repository has no remote.'
            : `Cannot push: branch "${branch.head}" has no upstream and there are several remotes.`,
        );
      }
      await this.run(['push', '--set-upstream', remotes[0]!, branch.head], signal, {
        timeoutMs: PUSH_TIMEOUT_MS,
      });
    });
  }
}
