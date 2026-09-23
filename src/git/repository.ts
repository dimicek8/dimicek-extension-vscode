import { GitError } from './gitError';
import { type GitRunner, isVersionAtLeast } from './gitExec';
import { buildLogArgs, type Commit, type LogOptions, parseLog } from './parsers/log';
import { parseRefs, type Ref, REFS_FORMAT } from './parsers/refs';
import { type GitStatus, parseStatus } from './parsers/status';

export class Repository {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly root: string,
    private readonly git: GitRunner,
  ) {}

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  private async run(args: string[], signal?: AbortSignal): Promise<string> {
    const { stdout } = await this.git.exec(args, { cwd: this.root, signal });
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

  add(paths: readonly string[]): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['add', '--', ...paths]);
    });
  }
}
