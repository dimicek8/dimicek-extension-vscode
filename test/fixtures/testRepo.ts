import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const BASE_TIMESTAMP = 1_767_225_600;

export class TestRepo {
  private clock = 0;

  private constructor(
    readonly root: string,
    private readonly sandbox: string,
  ) {}

  static create(sandbox = TestRepo.createSandbox(), name = 'repo'): TestRepo {
    const root = join(sandbox, name);
    mkdirSync(root, { recursive: true });
    const repo = new TestRepo(root, sandbox);
    repo.git('init', '--quiet', '--initial-branch=main');
    repo.git('config', 'user.name', 'Test User');
    repo.git('config', 'user.email', 'test@example.com');
    repo.git('config', 'commit.gpgsign', 'false');
    repo.git('config', 'tag.gpgsign', 'false');
    repo.git('config', 'core.autocrlf', 'false');
    return repo;
  }

  static createSandbox(): string {
    const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'dimicek-fixture-')));
    writeFileSync(join(sandbox, '.gitconfig'), '');
    return sandbox;
  }

  static env(sandbox: string, timestamp?: number): NodeJS.ProcessEnv {
    const date = timestamp === undefined ? undefined : `${timestamp} +0000`;
    return {
      ...process.env,
      HOME: sandbox,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: join(sandbox, '.gitconfig'),
      GIT_TERMINAL_PROMPT: '0',
      ...(date && { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }),
    };
  }

  git(...args: string[]): string {
    return execFileSync('git', args, {
      cwd: this.root,
      env: TestRepo.env(this.sandbox, BASE_TIMESTAMP + this.clock * 60),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  write(path: string, content: string): void {
    const file = join(this.root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }

  commit(message: string, files: Record<string, string> = {}): string {
    for (const [path, content] of Object.entries(files)) {
      this.write(path, content);
    }
    this.git('add', '--all');
    this.clock++;
    this.git('commit', '--quiet', '--allow-empty', '-m', message);
    return this.git('rev-parse', 'HEAD');
  }

  clone(name: string, bare = false): TestRepo {
    const target = join(this.sandbox, name);
    execFileSync('git', ['clone', '--quiet', ...(bare ? ['--bare'] : []), this.root, target], {
      env: TestRepo.env(this.sandbox),
      stdio: 'ignore',
    });
    const repo = new TestRepo(target, this.sandbox);
    repo.clock = this.clock;
    if (!bare) {
      repo.git('config', 'user.name', 'Other User');
      repo.git('config', 'core.autocrlf', 'false');
      repo.git('config', 'user.email', 'other@example.com');
    }
    return repo;
  }

  dispose(): void {
    try {
      rmSync(this.sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      return;
    }
  }
}

export interface HistoryRepo {
  repo: TestRepo;
  other: TestRepo;
  commits: {
    initial: string;
    app: string;
    login: string;
    logout: string;
    typo: string;
    merge: string;
    local: string;
    remote: string;
  };
}

export function createHistoryRepo(): HistoryRepo {
  const repo = TestRepo.create();
  const initial = repo.commit('Initial commit', { 'README.md': '# Test\n' });
  const app = repo.commit('Add app', { 'src/app.ts': 'export const app = 1;\n' });
  repo.git('tag', 'light', app);

  const origin = repo.clone('origin.git', true);
  repo.git('remote', 'add', 'origin', origin.root);
  repo.git('push', '--quiet', '--set-upstream', 'origin', 'main');

  repo.git('switch', '--quiet', '--create', 'feature/login');
  const login = repo.commit('Add login', { 'src/login.ts': 'export const login = true;\n' });
  const logout = repo.commit('Add logout', { 'src/logout.ts': 'export const logout = true;\n' });
  repo.git('push', '--quiet', '--set-upstream', 'origin', 'feature/login');

  repo.git('switch', '--quiet', 'main');
  const typo = repo.commit('Fix typo in README', { 'README.md': '# Test project\n' });
  repo.git('merge', '--quiet', '--no-ff', '-m', "Merge branch 'feature/login'", 'feature/login');
  const merge = repo.git('rev-parse', 'HEAD');
  repo.git('tag', '--annotate', '-m', 'Release 1.0', 'v1.0', merge);
  repo.git('push', '--quiet', 'origin', 'main', '--tags');

  repo.git('switch', '--quiet', '--create', 'gone');
  repo.git('push', '--quiet', '--set-upstream', 'origin', 'gone');
  repo.git('switch', '--quiet', 'main');
  repo.git('push', '--quiet', 'origin', '--delete', 'gone');

  const other = origin.clone('other');
  const remote = other.commit('Remote change', { 'REMOTE.md': 'remote\n' });
  other.git('push', '--quiet', 'origin', 'main');

  repo.git('fetch', '--quiet', '--prune', 'origin');
  const local = repo.commit('Local change', { 'LOCAL.md': 'local\n' });

  return { repo, other, commits: { initial, app, login, logout, typo, merge, local, remote } };
}

export function addWorkingTreeChanges(repo: TestRepo): void {
  repo.write('README.md', '# Test project\n\nMore text.\n');
  repo.write('src/new file.ts', 'export {};\n');
  repo.git('add', 'src/new file.ts');
  repo.git('rm', '--quiet', 'src/logout.ts');
  repo.git('mv', 'src/login.ts', 'src/auth.ts');
  repo.write('notes/todo ž.txt', 'todo\n');
}
