import { describe, expect, it } from 'vitest';
import { type BranchEntry, buildBranchEntries } from '../../../src/features/branches/branchEntries';
import type { LocalBranch, Ref, RemoteBranch } from '../../../src/git/parsers/refs';

const date = new Date(0);

function local(name: string, extra: Partial<LocalBranch> = {}): LocalBranch {
  return {
    type: 'branch',
    fullName: `refs/heads/${name}`,
    name,
    commit: 'abc',
    date,
    isHead: false,
    ...extra,
  };
}

function remote(name: string): RemoteBranch {
  const [remoteName = '', ...rest] = name.split('/');
  return {
    type: 'remoteBranch',
    fullName: `refs/remotes/${name}`,
    name,
    remote: remoteName,
    branch: rest.join('/'),
    commit: 'abc',
    date,
  };
}

const outline = (entries: BranchEntry[]) =>
  entries.map((entry) =>
    entry.kind === 'separator'
      ? `--${entry.label}--`
      : entry.kind === 'command'
        ? `>${entry.command}`
        : `${entry.icon}:${entry.label}${entry.description ? ` [${entry.description}]` : ''}`,
  );

describe('buildBranchEntries', () => {
  const refs: Ref[] = [
    local('main', {
      isHead: true,
      upstream: {
        name: 'origin/main',
        remote: 'origin',
        branch: 'main',
        ahead: 1,
        behind: 2,
        gone: false,
      },
    }),
    local('feature/b'),
    local('feature/a', {
      upstream: {
        name: 'origin/feature/a',
        remote: 'origin',
        branch: 'feature/a',
        ahead: 0,
        behind: 0,
        gone: false,
      },
    }),
    local('old', {
      upstream: {
        name: 'origin/old',
        remote: 'origin',
        branch: 'old',
        ahead: 0,
        behind: 0,
        gone: true,
      },
    }),
    remote('origin/main'),
    remote('origin/feature/a'),
    { type: 'tag', fullName: 'refs/tags/v1', name: 'v1', commit: 'abc', date, annotated: false },
  ];

  it('lists commands, recent, local and remote branches with favorites first', () => {
    const entries = buildBranchEntries({
      refs,
      recent: ['main', 'feature/b', 'deleted', 'feature/a'],
      favorites: new Set(['refs/heads/main', 'refs/heads/feature/b', 'refs/remotes/origin/main']),
    });
    expect(outline(entries)).toEqual([
      '>newBranch',
      '>checkoutRevision',
      '>fetch',
      '--Recent--',
      'star-full:feature/b',
      'git-branch:feature/a [origin/feature/a]',
      '--Local--',
      'star-full:feature/b',
      'check:main [↑1 ↓2  origin/main]',
      'git-branch:feature/a [origin/feature/a]',
      'git-branch:old [origin/old (gone)]',
      '--Remote--',
      'star-full:origin/main',
      'cloud:origin/feature/a',
    ]);
  });

  it('marks the current branch and favorites', () => {
    const entries = buildBranchEntries({
      refs,
      recent: [],
      favorites: new Set(['refs/heads/main']),
    });
    const main = entries.find((entry) => entry.kind === 'branch' && entry.label === 'main');
    expect(main).toMatchObject({ current: true, favorite: true, icon: 'check' });
    expect(outline(entries)).not.toContain('--Recent--');
  });
});

describe('buildBranchEntries during an operation', () => {
  it('offers to abort a merge or continue and abort a rebase first', () => {
    const base = { refs: [], recent: [], favorites: new Set<string>() };
    expect(outline(buildBranchEntries({ ...base, operation: 'merge' })).slice(0, 2)).toEqual([
      '>abortMerge',
      '>newBranch',
    ]);
    expect(outline(buildBranchEntries({ ...base, operation: 'rebase' })).slice(0, 3)).toEqual([
      '>continueRebase',
      '>abortRebase',
      '>newBranch',
    ]);
  });
});

describe('buildBranchEntries for GitHub repositories', () => {
  it('adds pull request commands', () => {
    const entries = buildBranchEntries({
      refs: [],
      recent: [],
      favorites: new Set(),
      github: true,
    });
    expect(outline(entries)).toEqual([
      '>newBranch',
      '>checkoutRevision',
      '>fetch',
      '>createPullRequest',
      '>pullRequests',
    ]);
  });
});
