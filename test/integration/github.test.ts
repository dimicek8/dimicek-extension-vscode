import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { GitHubClient } from '../../src/github/githubClient';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi } from './helpers';

const GITHUB_URL = 'https://github.com/acme/app.git';

function rawPull(number: number, headRef: string, headRepo: string) {
  return {
    number,
    title: `Pull ${number}`,
    html_url: `https://github.com/acme/app/pull/${number}`,
    draft: false,
    created_at: '2026-09-26T10:00:00Z',
    user: { login: 'jan' },
    head: { ref: headRef, repo: { full_name: headRepo } },
    base: { ref: 'main' },
  };
}

describe('GitHub pull requests', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;
  let requests: Array<{ method: string; url: string; body?: Record<string, unknown> }>;
  let originPath: string;

  before(async () => {
    fixture = createHistoryRepo();
    originPath = fixture.repo.git('remote', 'get-url', 'origin');
    fixture.repo.git('remote', 'set-url', 'origin', GITHUB_URL);
    fixture.repo.git('config', `url.${originPath}.insteadOf`, GITHUB_URL);
    fixture.repo.git(
      '--git-dir',
      originPath,
      'update-ref',
      'refs/pull/5/head',
      fixture.commits.app,
    );
    fixture.repo.git('switch', '--quiet', 'feature/login');
    api = await activateWithRepository(fixture.repo);
    await api.commit.model.refresh();

    api.github.service.client = new GitHubClient(
      async () => 'token',
      async (url, init) => {
        const method = init?.method ?? 'GET';
        requests.push({
          method,
          url,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (method === 'POST') {
          return new Response(JSON.stringify(rawPull(12, 'feature/login', 'acme/app')), {
            status: 201,
          });
        }
        if (url.endsWith('/repos/acme/app') || url.endsWith('/repos/upstream-org/app')) {
          return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
        }
        return new Response(
          JSON.stringify([
            rawPull(7, 'feature/login', 'acme/app'),
            rawPull(5, 'fix', 'someone/app'),
          ]),
          { status: 200 },
        );
      },
    );
  });

  beforeEach(() => {
    requests = [];
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  it('recognizes the GitHub repository behind the remote', async () => {
    const context = await api.github.service.resolve();
    assert.ok(context);
    assert.strictEqual(context.headRemote, 'origin');
    assert.deepStrictEqual(context.baseRepo, { owner: 'acme', repo: 'app' });
    assert.ok(await api.github.service.isAvailable());
    const commands = (await api.branches.popup.loadEntries()).map((entry) =>
      entry.kind === 'command' ? entry.command : '',
    );
    assert.ok(commands.includes('createPullRequest'));
    assert.ok(commands.includes('pullRequests'));
  });

  it('creates a pull request from the current branch', async () => {
    const pull = await api.github.pullRequests.create({
      base: 'main',
      title: 'Add login',
      body: 'Login and logout',
      draft: true,
    });
    assert.strictEqual(pull?.number, 12);
    assert.deepStrictEqual(requests.at(-1), {
      method: 'POST',
      url: 'https://api.github.com/repos/acme/app/pulls',
      body: {
        title: 'Add login',
        body: 'Login and logout',
        head: 'feature/login',
        base: 'main',
        draft: true,
      },
    });
  });

  it('targets the upstream repository when working on a fork', async () => {
    fixture.repo.git('remote', 'add', 'upstream', 'https://github.com/upstream-org/app.git');
    try {
      const context = await api.github.service.resolve();
      assert.deepStrictEqual(context?.baseRepo, { owner: 'upstream-org', repo: 'app' });
      await api.github.pullRequests.create({ base: 'main', title: 'From fork' });
      assert.strictEqual(
        requests.at(-1)?.url,
        'https://api.github.com/repos/upstream-org/app/pulls',
      );
      assert.strictEqual(requests.at(-1)?.body?.head, 'acme:feature/login');
    } finally {
      fixture.repo.git('remote', 'remove', 'upstream');
    }
  });

  it('lists open pull requests and checks out their branches', async () => {
    const pulls = await api.github.pullRequests.list();
    assert.deepStrictEqual(
      pulls.map((pull) => pull.number),
      [7, 5],
    );

    fixture.repo.git('switch', '--quiet', 'main');
    fixture.repo.git('branch', '--delete', '--force', 'feature/login');
    await api.commit.model.refresh();
    assert.ok(await api.github.pullRequests.checkout(pulls[0]!));
    assert.strictEqual(api.commit.model.branch.head, 'feature/login');
    assert.strictEqual(api.commit.model.branch.upstream, 'origin/feature/login');

    assert.ok(await api.github.pullRequests.checkout(pulls[1]!));
    assert.strictEqual(api.commit.model.branch.head, 'pr/5');
    assert.strictEqual(fixture.repo.git('rev-parse', 'HEAD'), fixture.commits.app);
  });
});
