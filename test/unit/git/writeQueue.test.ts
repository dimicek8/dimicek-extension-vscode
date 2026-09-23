import { describe, expect, it } from 'vitest';
import type { GitExecOptions, GitResult, GitRunner } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';

class RecordingGit implements GitRunner {
  readonly version = '2.53.0';
  readonly events: string[] = [];
  private running = 0;
  maxConcurrent = 0;

  async exec(args: readonly string[], _options: GitExecOptions): Promise<GitResult> {
    const name = args.join(' ');
    this.running++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.running);
    this.events.push(`start ${name}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    this.events.push(`end ${name}`);
    this.running--;
    if (name.includes('fail')) {
      throw new Error('failed');
    }
    return { stdout: '', stderr: '' };
  }
}

describe('Repository write queue', () => {
  it('runs write operations one after another', async () => {
    const git = new RecordingGit();
    const repository = new Repository('/repo', git);

    await Promise.all([repository.add(['a']), repository.add(['b']), repository.add(['c'])]);

    expect(git.maxConcurrent).toBe(1);
    expect(git.events).toEqual([
      'start add -- a',
      'end add -- a',
      'start add -- b',
      'end add -- b',
      'start add -- c',
      'end add -- c',
    ]);
  });

  it('keeps going after a failed write', async () => {
    const git = new RecordingGit();
    const repository = new Repository('/repo', git);

    const results = await Promise.allSettled([repository.add(['fail']), repository.add(['ok'])]);

    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
  });

  it('does not queue reads behind writes', async () => {
    const git = new RecordingGit();
    const repository = new Repository('/repo', git);

    await Promise.all([repository.add(['a']), repository.getRemotes()]);

    expect(git.maxConcurrent).toBe(2);
  });
});
