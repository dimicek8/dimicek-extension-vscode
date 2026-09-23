import { type ChildProcess, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { classifyGitError, GitError } from './gitError';

export interface GitLogger {
  info(message: string): void;
  error(message: string): void;
}

export interface GitExecOptions {
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  input?: string;
  env?: Record<string, string>;
}

export interface GitResult {
  stdout: string;
  stderr: string;
}

export interface GitInstallation {
  path: string;
  version: string;
}

export const DEFAULT_TIMEOUT_MS = 60_000;

const isWindows = process.platform === 'win32';

const BASE_ARGS = ['-c', 'core.quotepath=false', '-c', 'color.ui=false'];

const BASE_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  LC_ALL: 'C',
  LANG: 'C',
};

function killProcessTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) {
    return;
  }
  try {
    if (isWindows) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on(
        'error',
        () => child.kill(),
      );
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    child.kill();
  }
}

export function runGit(
  gitPath: string,
  args: readonly string[],
  options: GitExecOptions,
  logger?: GitLogger,
): Promise<GitResult> {
  const commandLine = `git ${args.join(' ')}`;
  const started = Date.now();

  if (options.signal?.aborted) {
    const error = new GitError({ code: 'Cancelled', args, message: `Cancelled: ${commandLine}` });
    logger?.error(`> ${commandLine} [0ms]\n${error.message}`);
    return Promise.reject(error);
  }

  return new Promise<GitResult>((resolve, reject) => {
    const child = spawn(gitPath, [...BASE_ARGS, ...args], {
      cwd: options.cwd,
      env: { ...process.env, ...BASE_ENV, ...options.env },
      windowsHide: true,
      detached: !isWindows,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;

    const settle = (error: GitError | undefined, result?: GitResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      const elapsed = `[${Date.now() - started}ms]`;
      if (error) {
        logger?.error(`> ${commandLine} ${elapsed}\n${error.message}`);
        reject(error);
      } else {
        logger?.info(`> ${commandLine} ${elapsed}`);
        resolve(result!);
      }
    };

    const abortWith = (code: 'Cancelled' | 'Timeout') => {
      const reason = code === 'Cancelled' ? 'Cancelled' : 'Timed out';
      settle(new GitError({ code, args, message: `${reason}: ${commandLine}` }));
      killProcessTree(child);
    };
    const onAbort = () => abortWith('Cancelled');
    const timer = setTimeout(() => abortWith('Timeout'), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    options.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.stdin.on('error', () => undefined);

    child.on('error', (error: NodeJS.ErrnoException) => {
      settle(
        new GitError({
          code: error.code === 'ENOENT' ? 'GitNotFound' : 'Unknown',
          args,
          message: error.message,
        }),
      );
    });

    child.on('close', (exitCode) => {
      const out = Buffer.concat(stdout).toString('utf8');
      const err = Buffer.concat(stderr).toString('utf8');
      if (exitCode === 0) {
        settle(undefined, { stdout: out, stderr: err });
        return;
      }
      settle(
        new GitError({
          code: classifyGitError(err),
          args,
          exitCode,
          stdout: out,
          stderr: err,
          message: err.trim() || `${commandLine} exited with code ${exitCode}`,
        }),
      );
    });

    child.stdin.end(options.input);
  });
}

export interface GitRunner {
  readonly version: string;
  exec(args: readonly string[], options: GitExecOptions): Promise<GitResult>;
}

export class Git implements GitRunner {
  constructor(
    readonly installation: GitInstallation,
    private readonly logger?: GitLogger,
  ) {}

  get version(): string {
    return this.installation.version;
  }

  exec(args: readonly string[], options: GitExecOptions): Promise<GitResult> {
    return runGit(this.installation.path, args, options, this.logger);
  }
}

export function parseGitVersion(output: string): string {
  const match = /git version (\d+\.\d+(?:\.\d+)?)/.exec(output);
  if (!match?.[1]) {
    throw new Error(`Unrecognized git version output: ${output.trim()}`);
  }
  return match[1];
}

export function isVersionAtLeast(version: string, minimum: string): boolean {
  const actual = version.split('.').map(Number);
  const required = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(actual.length, required.length); i++) {
    const a = actual[i] ?? 0;
    const r = required[i] ?? 0;
    if (a !== r) {
      return a > r;
    }
  }
  return true;
}

export async function findGit(
  candidates: ReadonlyArray<string | undefined>,
): Promise<GitInstallation> {
  const tried = new Set<string>();
  for (const candidate of [...candidates, 'git']) {
    if (!candidate || tried.has(candidate)) {
      continue;
    }
    tried.add(candidate);
    try {
      const { stdout } = await runGit(candidate, ['--version'], {
        cwd: tmpdir(),
        timeoutMs: 10_000,
      });
      return { path: candidate, version: parseGitVersion(stdout) };
    } catch {
      continue;
    }
  }
  throw new GitError({
    code: 'GitNotFound',
    args: ['--version'],
    message: `Git was not found (tried: ${[...tried].join(', ')}). Install Git or set "git.path".`,
  });
}
