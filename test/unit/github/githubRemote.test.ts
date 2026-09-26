import { describe, expect, it } from 'vitest';
import { parseGitHubRemote, sameRepo } from '../../../src/github/githubRemote';

describe('parseGitHubRemote', () => {
  it.each([
    ['https://github.com/acme/app.git', 'acme/app'],
    ['https://github.com/acme/app', 'acme/app'],
    ['https://user@github.com/acme/app.git/', 'acme/app'],
    ['git@github.com:acme/app.git', 'acme/app'],
    ['ssh://git@github.com/acme/my.app.git', 'acme/my.app'],
  ])('%s → %s', (url, expected) => {
    const parsed = parseGitHubRemote(url);
    expect(parsed && `${parsed.owner}/${parsed.repo}`).toBe(expected);
  });

  it('ignores other hosts', () => {
    expect(parseGitHubRemote('https://gitlab.com/acme/app.git')).toBeUndefined();
    expect(parseGitHubRemote('/tmp/origin.git')).toBeUndefined();
  });

  it('compares repositories case-insensitively', () => {
    expect(sameRepo({ owner: 'Acme', repo: 'App' }, { owner: 'acme', repo: 'app' })).toBe(true);
  });
});
