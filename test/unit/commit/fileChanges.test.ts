import { describe, expect, it } from 'vitest';
import { commitPaths, groupChanges, toFileChanges } from '../../../src/features/commit/fileChanges';
import type { GitStatus, StatusEntry } from '../../../src/git/parsers/status';

const status = (...entries: StatusEntry[]): GitStatus => ({ branch: {}, entries, stashCount: 0 });

describe('toFileChanges', () => {
  it('merges index and worktree state into one change per file', () => {
    expect(
      toFileChanges(
        status(
          { kind: 'changed', path: 'z.txt', index: 'modified', worktree: 'modified' },
          { kind: 'changed', path: 'a.txt', index: 'unmodified', worktree: 'modified' },
          { kind: 'changed', path: 'new.txt', index: 'added', worktree: 'modified' },
          { kind: 'changed', path: 'gone.txt', index: 'unmodified', worktree: 'deleted' },
          { kind: 'changed', path: 'rm.txt', index: 'deleted', worktree: 'unmodified' },
          {
            kind: 'changed',
            path: 'to.txt',
            originalPath: 'from.txt',
            index: 'renamed',
            worktree: 'modified',
          },
          { kind: 'changed', path: 'type.txt', index: 'typeChanged', worktree: 'unmodified' },
          { kind: 'conflicted', path: 'c.txt', conflict: 'bothModified' },
          { kind: 'untracked', path: 'u.txt' },
          { kind: 'ignored', path: 'ignored.txt' },
        ),
      ),
    ).toEqual([
      { path: 'a.txt', kind: 'modified' },
      { path: 'c.txt', kind: 'conflicted' },
      { path: 'gone.txt', kind: 'deleted' },
      { path: 'new.txt', kind: 'added' },
      { path: 'rm.txt', kind: 'deleted' },
      { path: 'to.txt', originalPath: 'from.txt', kind: 'renamed' },
      { path: 'type.txt', kind: 'modified' },
      { path: 'u.txt', kind: 'unversioned' },
      { path: 'z.txt', kind: 'modified' },
    ]);
  });

  it('drops files added to the index and then deleted from disk', () => {
    expect(
      toFileChanges(status({ kind: 'changed', path: 'x', index: 'added', worktree: 'deleted' })),
    ).toEqual([]);
  });
});

describe('groupChanges', () => {
  it('always has a Changes group and adds conflicts and unversioned groups when needed', () => {
    expect(groupChanges([]).map((group) => group.id)).toEqual(['changes']);
    const groups = groupChanges([
      { path: 'a', kind: 'modified' },
      { path: 'b', kind: 'conflicted' },
      { path: 'c', kind: 'unversioned' },
    ]);
    expect(groups.map((group) => [group.id, group.changes.map((change) => change.path)])).toEqual([
      ['conflicts', ['b']],
      ['changes', ['a']],
      ['unversioned', ['c']],
    ]);
  });
});

describe('commitPaths', () => {
  it('commits both sides of a rename and adds unversioned files first', () => {
    expect(
      commitPaths([
        { path: 'a.txt', kind: 'modified' },
        { path: 'new.txt', originalPath: 'old.txt', kind: 'renamed' },
        { path: 'u.txt', kind: 'unversioned' },
        { path: 'd.txt', kind: 'deleted' },
      ]),
    ).toEqual({
      paths: ['a.txt', 'old.txt', 'new.txt', 'u.txt', 'd.txt'],
      addPaths: ['u.txt'],
    });
  });
});
