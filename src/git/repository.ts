import { type Git, isVersionAtLeast } from './gitExec';
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
}
