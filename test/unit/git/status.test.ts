import { describe, expect, it } from 'vitest';
import { parseStatus } from '../../../src/git/parsers/status';

const z = (...records: string[]) => records.map((record) => `${record}\0`).join('');

describe('parseStatus', () => {
  it('parses branch headers with upstream, ahead/behind and stash', () => {
    const status = parseStatus(
      z(
        '# branch.oid 2b286487d8cfcfaf1be32a997be5b9f15ac99d1d',
        '# branch.head feature/login',
        '# branch.upstream origin/feature/login',
        '# branch.ab +2 -3',
        '# stash 4',
      ),
    );
    expect(status).toEqual({
      branch: {
        commit: '2b286487d8cfcfaf1be32a997be5b9f15ac99d1d',
        head: 'feature/login',
        upstream: 'origin/feature/login',
        ahead: 2,
        behind: 3,
      },
      entries: [],
      stashCount: 4,
    });
  });

  it('handles an initial commit and a detached HEAD', () => {
    expect(parseStatus(z('# branch.oid (initial)', '# branch.head main')).branch).toEqual({
      commit: undefined,
      head: 'main',
    });
    expect(parseStatus(z('# branch.oid abc', '# branch.head (detached)')).branch).toEqual({
      commit: 'abc',
      head: undefined,
    });
  });

  it('parses ordinary, renamed, untracked and ignored entries including paths with spaces', () => {
    const status = parseStatus(
      z(
        '# branch.oid 2b286487d8cfcfaf1be32a997be5b9f15ac99d1d',
        '# branch.head main',
        '1 .M N... 100644 100644 100644 7898192 7898192 a.txt',
        '1 A. N... 000000 100644 100644 0000000 8ba3a16 added.txt',
        '1 .D N... 100644 100644 000000 6178079 6178079 b c.txt',
        '1 MM N... 100644 100644 100644 28ce6a8 2ea3be2 m.txt',
        '2 R. N... 100644 100644 100644 587be6b 587be6b R100 dir/new name.txt',
        'dir/old name.txt',
        '? untr ack.txt',
        '! build/out.js',
      ),
    );
    expect(status.entries).toEqual([
      { kind: 'changed', path: 'a.txt', index: 'unmodified', worktree: 'modified' },
      { kind: 'changed', path: 'added.txt', index: 'added', worktree: 'unmodified' },
      { kind: 'changed', path: 'b c.txt', index: 'unmodified', worktree: 'deleted' },
      { kind: 'changed', path: 'm.txt', index: 'modified', worktree: 'modified' },
      {
        kind: 'changed',
        path: 'dir/new name.txt',
        originalPath: 'dir/old name.txt',
        index: 'renamed',
        worktree: 'unmodified',
      },
      { kind: 'untracked', path: 'untr ack.txt' },
      { kind: 'ignored', path: 'build/out.js' },
    ]);
  });

  it('parses conflicts', () => {
    const status = parseStatus(
      z(
        'u UU N... 100644 100644 100644 100644 d00491f 00750ed 0cfbf08 c.txt',
        'u AA N... 000000 100644 100644 100644 0000000 1111111 2222222 both added.txt',
        'u DU N... 100644 000000 100644 100644 3333333 0000000 4444444 d.txt',
      ),
    );
    expect(status.entries).toEqual([
      { kind: 'conflicted', path: 'c.txt', conflict: 'bothModified' },
      { kind: 'conflicted', path: 'both added.txt', conflict: 'bothAdded' },
      { kind: 'conflicted', path: 'd.txt', conflict: 'deletedByUs' },
    ]);
  });

  it('keeps non-ASCII paths intact', () => {
    const status = parseStatus(z('? složka/žluťoučký kůň.txt'));
    expect(status.entries).toEqual([{ kind: 'untracked', path: 'složka/žluťoučký kůň.txt' }]);
  });

  it('returns an empty status for empty output', () => {
    expect(parseStatus('')).toEqual({ branch: {}, entries: [], stashCount: 0 });
  });

  it('rejects unknown records', () => {
    expect(() => parseStatus(z('x something'))).toThrow(/Unknown status record/);
  });
});
