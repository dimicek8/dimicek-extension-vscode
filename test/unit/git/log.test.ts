import { describe, expect, it } from 'vitest';
import { buildLogArgs, LOG_FORMAT, parseLog } from '../../../src/git/parsers/log';

const record = (...fields: string[]) => `${fields.join('\x1f')}\0`;

describe('parseLog', () => {
  const output =
    record(
      '6f5ca25',
      '8276d76 1111111',
      'Jan Novák',
      'jan@example.com',
      '1790192032',
      'GitHub',
      'noreply@github.com',
      '1790192100',
      'HEAD -> refs/heads/main, tag: refs/tags/v1, refs/remotes/origin/main',
      "Merge branch 'feature'\n\nLonger description\nwith two lines.\n",
    ) +
    '\n' +
    record('8276d76', '', 'A', 'a@x', '1790190000', 'A', 'a@x', '1790190000', '', 'Initial\n');

  it('parses commits with parents, people, dates and message', () => {
    const [merge, initial] = parseLog(output);
    expect(merge).toEqual({
      hash: '6f5ca25',
      parents: ['8276d76', '1111111'],
      author: { name: 'Jan Novák', email: 'jan@example.com' },
      authorDate: new Date(1790192032 * 1000),
      committer: { name: 'GitHub', email: 'noreply@github.com' },
      commitDate: new Date(1790192100 * 1000),
      subject: "Merge branch 'feature'",
      body: 'Longer description\nwith two lines.',
      refs: ['refs/heads/main', 'refs/tags/v1', 'refs/remotes/origin/main'],
      isHead: true,
      headRef: 'refs/heads/main',
    });
    expect(initial).toMatchObject({
      parents: [],
      subject: 'Initial',
      body: '',
      refs: [],
      isHead: false,
    });
  });

  it('recognizes a detached HEAD decoration', () => {
    const [commit] = parseLog(
      record('a', '', 'A', 'a@x', '1', 'A', 'a@x', '1', 'HEAD, refs/heads/x', 'm'),
    );
    expect(commit).toMatchObject({ isHead: true, refs: ['refs/heads/x'] });
  });

  it('keeps unit separators inside the message', () => {
    const [commit] = parseLog(
      record('a', '', 'A', 'a@x', '1', 'A', 'a@x', '1', '', 'odd\x1fsubject'),
    );
    expect(commit?.subject).toBe('odd\x1fsubject');
  });

  it('returns no commits for empty output', () => {
    expect(parseLog('')).toEqual([]);
  });
});

describe('buildLogArgs', () => {
  it('defaults to HEAD in topological order', () => {
    expect(buildLogArgs()).toEqual([
      'log',
      `--format=${LOG_FORMAT}`,
      '-z',
      '--decorate=full',
      '--topo-order',
      '--end-of-options',
      'HEAD',
      '--',
    ]);
  });

  it('adds paging, filters, all refs and paths', () => {
    const args = buildLogArgs({
      maxCount: 100,
      skip: 200,
      all: true,
      author: 'Jan',
      grep: 'fix',
      since: new Date('2026-01-01T00:00:00Z'),
      until: new Date('2026-02-01T00:00:00Z'),
      order: 'date',
      paths: ['src/app.ts'],
    });
    expect(args.slice(4)).toEqual([
      '--date-order',
      '--max-count=100',
      '--skip=200',
      '--author=Jan',
      '--grep=fix',
      '--regexp-ignore-case',
      '--since=2026-01-01T00:00:00.000Z',
      '--until=2026-02-01T00:00:00.000Z',
      '--exclude=refs/stash',
      '--all',
      '--end-of-options',
      '--',
      'src/app.ts',
    ]);
  });

  it('treats revisions as data, never as options', () => {
    expect(buildLogArgs({ revisions: ['--output=/tmp/x'] }).slice(-3)).toEqual([
      '--end-of-options',
      '--output=/tmp/x',
      '--',
    ]);
  });
});
