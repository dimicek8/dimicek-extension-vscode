import type { GitHubRepoId } from './githubRemote';

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  author: string;
  draft: boolean;
  headRef: string;
  headRepo?: string;
  baseRef: string;
  createdAt: Date;
}

export interface NewPullRequest {
  title: string;
  body?: string;
  head: string;
  base: string;
  draft?: boolean;
}

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

interface RawPullRequest {
  number: number;
  title: string;
  html_url: string;
  draft?: boolean;
  created_at: string;
  user?: { login?: string };
  head: { ref: string; repo?: { full_name?: string } | null };
  base: { ref: string };
}

function toPullRequest(raw: RawPullRequest): PullRequest {
  return {
    number: raw.number,
    title: raw.title,
    url: raw.html_url,
    author: raw.user?.login ?? 'unknown',
    draft: raw.draft ?? false,
    headRef: raw.head.ref,
    headRepo: raw.head.repo?.full_name ?? undefined,
    baseRef: raw.base.ref,
    createdAt: new Date(raw.created_at),
  };
}

export class GitHubClient {
  constructor(
    private readonly token: () => Promise<string>,
    private readonly fetchImpl: Fetch = (input, init) => fetch(input, init),
    private readonly apiUrl = 'https://api.github.com',
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${await this.token()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      const details = data as
        { message?: string; errors?: Array<{ message?: string }> } | undefined;
      const reason = details?.errors?.find((error) => error.message)?.message ?? details?.message;
      throw new GitHubApiError(
        response.status,
        reason ?? `GitHub request failed (${response.status})`,
      );
    }
    return data as T;
  }

  async getDefaultBranch({ owner, repo }: GitHubRepoId): Promise<string> {
    const data = await this.request<{ default_branch: string }>('GET', `/repos/${owner}/${repo}`);
    return data.default_branch;
  }

  async listPullRequests({ owner, repo }: GitHubRepoId): Promise<PullRequest[]> {
    const data = await this.request<RawPullRequest[]>(
      'GET',
      `/repos/${owner}/${repo}/pulls?state=open&per_page=100`,
    );
    return data.map(toPullRequest);
  }

  async findPullRequest(
    { owner, repo }: GitHubRepoId,
    head: string,
  ): Promise<PullRequest | undefined> {
    const data = await this.request<RawPullRequest[]>(
      'GET',
      `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(head)}`,
    );
    return data[0] ? toPullRequest(data[0]) : undefined;
  }

  async createPullRequest(
    { owner, repo }: GitHubRepoId,
    pull: NewPullRequest,
  ): Promise<PullRequest> {
    return toPullRequest(
      await this.request<RawPullRequest>('POST', `/repos/${owner}/${repo}/pulls`, {
        title: pull.title,
        body: pull.body ?? '',
        head: pull.head,
        base: pull.base,
        draft: pull.draft ?? false,
      }),
    );
  }
}
