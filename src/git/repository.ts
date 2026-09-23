import { type Git, isVersionAtLeast } from './gitExec';
import { parseRefs, type Ref, REFS_FORMAT } from './parsers/refs';
import { type GitStatus, parseStatus } from './parsers/status';

export class Repository {
  constructor(
    readonly root: string,
    private readonly git: Git,
  ) {}

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
}
