import { describe, expect, it } from 'vitest';
import { GitHubApiError, GitHubClient } from '../../../src/github/githubClient';

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

function fakeFetch(status: number, body: unknown, requests: Recorded[]) {
  return async (url: string, init?: RequestInit) => {
    requests.push({
      url,
      method: init?.method ?? 'GET',
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(JSON.stringify(body), { status });
  };
}

const rawPull = {
  number: 7,
  title: 'Add login',
  html_url: 'https://github.com/acme/app/pull/7',
  draft: false,
  created_at: '2026-09-26T10:00:00Z',
  user: { login: 'jan' },
  head: { ref: 'feature/login', repo: { full_name: 'acme/app' } },
  base: { ref: 'main' },
};

const repo = { owner: 'acme', repo: 'app' };

describe('GitHubClient', () => {
  it('lists open pull requests with the token from VS Code', async () => {
    const requests: Recorded[] = [];
    const client = new GitHubClient(async () => 'secret', fakeFetch(200, [rawPull], requests));

    expect(await client.listPullRequests(repo)).toEqual([
      {
        number: 7,
        title: 'Add login',
        url: 'https://github.com/acme/app/pull/7',
        author: 'jan',
        draft: false,
        headRef: 'feature/login',
        headRepo: 'acme/app',
        baseRef: 'main',
        createdAt: new Date('2026-09-26T10:00:00Z'),
      },
    ]);
    expect(requests[0]).toMatchObject({
      url: 'https://api.github.com/repos/acme/app/pulls?state=open&per_page=100',
      method: 'GET',
      headers: { Authorization: 'Bearer secret' },
    });
  });

  it('creates a pull request', async () => {
    const requests: Recorded[] = [];
    const client = new GitHubClient(async () => 't', fakeFetch(201, rawPull, requests));
    const pull = await client.createPullRequest(repo, {
      title: 'Add login',
      head: 'feature/login',
      base: 'main',
      draft: true,
    });
    expect(pull.number).toBe(7);
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.github.com/repos/acme/app/pulls',
      body: { title: 'Add login', body: '', head: 'feature/login', base: 'main', draft: true },
    });
  });

  it('reports the reason GitHub gives for a failure', async () => {
    const client = new GitHubClient(
      async () => 't',
      fakeFetch(
        422,
        {
          message: 'Validation Failed',
          errors: [{ message: 'A pull request already exists for acme:feature/login.' }],
        },
        [],
      ),
    );
    const error = await client
      .createPullRequest(repo, { title: 'x', head: 'a', base: 'b' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error).toMatchObject({
      status: 422,
      message: 'A pull request already exists for acme:feature/login.',
    });
  });

  it('reads the default branch and finds a pull request by head', async () => {
    const requests: Recorded[] = [];
    const client = new GitHubClient(
      async () => 't',
      fakeFetch(200, { default_branch: 'develop' }, requests),
    );
    expect(await client.getDefaultBranch(repo)).toBe('develop');

    const finder = new GitHubClient(async () => 't', fakeFetch(200, [], requests));
    expect(await finder.findPullRequest(repo, 'acme:topic')).toBeUndefined();
    expect(requests[1]!.url).toBe(
      'https://api.github.com/repos/acme/app/pulls?state=open&head=acme%3Atopic',
    );
  });
});
