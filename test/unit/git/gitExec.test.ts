import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { findGit, Git, isVersionAtLeast, parseGitVersion, runGit } from '../../../src/git/gitExec';
import { GitError } from '../../../src/git/gitError';

describe('parseGitVersion', () => {
  it.each([
    ['git version 2.53.0\n', '2.53.0'],
    ['git version 2.39.3 (Apple Git-145)', '2.39.3'],
    ['git version 2.45.1.windows.1', '2.45.1'],
    ['git version 2.40', '2.40'],
  ])('%s → %s', (output, version) => {
    expect(parseGitVersion(output)).toBe(version);
  });

  it('rejects unknown output', () => {
    expect(() => parseGitVersion('hello')).toThrow();
  });
});

describe('isVersionAtLeast', () => {
  it.each([
    ['2.53.0', '2.35', true],
    ['2.35', '2.35.0', true],
    ['2.34.9', '2.35', false],
    ['3.0.0', '2.99.99', true],
    ['2.9.0', '2.10.0', false],
  ])('%s >= %s is %s', (version, minimum, expected) => {
    expect(isVersionAtLeast(version, minimum)).toBe(expected);
  });
});

describe('runGit', () => {
  const emptyDir = mkdtempSync(join(tmpdir(), 'dimicek-exec-'));

  afterAll(() => rmSync(emptyDir, { recursive: true, force: true }));

  it('returns stdout of a successful command', async () => {
    const { stdout } = await runGit('git', ['--version'], { cwd: emptyDir });
    expect(stdout).toMatch(/^git version /);
  });

  it('logs the command line', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    await runGit('git', ['--version'], { cwd: emptyDir }, logger);
    expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/^> git --version \[\d+ms\]$/));
  });

  it('classifies failures and logs them', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const error = await runGit('git', ['status'], { cwd: emptyDir }, logger).catch((e) => e);
    expect(error).toBeInstanceOf(GitError);
    expect(error).toMatchObject({ code: 'NotARepository', exitCode: 128 });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('passes input on stdin', async () => {
    const { stdout } = await runGit('git', ['hash-object', '--stdin'], {
      cwd: emptyDir,
      input: 'hello\n',
    });
    expect(stdout.trim()).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });

  it('rejects with GitNotFound when the executable is missing', async () => {
    await expect(
      runGit('git-does-not-exist', ['--version'], { cwd: emptyDir }),
    ).rejects.toMatchObject({
      code: 'GitNotFound',
    });
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runGit('git', ['--version'], { cwd: emptyDir, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'Cancelled' });
  });

  const slowCommand = ['-c', 'alias.wait=!node -e "setTimeout(() => {}, 3000)"', 'wait'];

  it('rejects with Timeout when the command runs too long', async () => {
    const started = Date.now();
    await expect(
      runGit('git', slowCommand, { cwd: emptyDir, timeoutMs: 200 }),
    ).rejects.toMatchObject({ code: 'Timeout' });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('rejects with Cancelled when aborted while running', async () => {
    const controller = new AbortController();
    const pending = runGit('git', slowCommand, { cwd: emptyDir, signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await expect(pending).rejects.toMatchObject({ code: 'Cancelled' });
  });
});

describe('findGit', () => {
  it('skips missing candidates and falls back to git on PATH', async () => {
    const installation = await findGit(['git-does-not-exist', undefined]);
    expect(installation.path).toBe('git');
    expect(installation.version).toMatch(/^\d+\.\d+/);
  });

  it('exposes the version through Git', async () => {
    const git = new Git(await findGit([]));
    expect(isVersionAtLeast(git.version, '2.0')).toBe(true);
  });
});
