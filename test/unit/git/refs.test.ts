import { describe, expect, it } from 'vitest';
import { parseRefs, splitRemoteBranch } from '../../../src/git/parsers/refs';

const line = (...fields: string[]) => fields.join('\0');

const OUTPUT = [
  line('refs/heads/gone', '8276d76', '', ' ', 'refs/remotes/origin/gone', 'gone', '1790192032', ''),
  line(
    'refs/heads/main',
    '6f5ca25',
    '',
    '*',
    'refs/remotes/origin/main',
    'ahead 1, behind 2',
    '1790192032',
    '',
  ),
  line('refs/heads/topic', '1111111', '', ' ', 'refs/heads/main', 'behind 3', '1790192000', ''),
  line('refs/heads/solo', '2222222', '', ' ', '', '', '1790192000', ''),
  line(
    'refs/remotes/origin/HEAD',
    '8276d76',
    '',
    ' ',
    '',
    '',
    '1790192032',
    'refs/remotes/origin/main',
  ),
  line('refs/remotes/origin/main', '8276d76', '', ' ', '', '', '1790192032', ''),
  line('refs/remotes/my/fork/feature/x', '3333333', '', ' ', '', '', '1790192032', ''),
  line('refs/tags/light', '8276d76', '', ' ', '', '', '1790192032', ''),
  line('refs/tags/v1', '9a35f52', '8276d76', ' ', '', '', '1790192032', ''),
  '',
].join('\n');

describe('parseRefs', () => {
  const refs = parseRefs(OUTPUT, ['origin', 'my/fork']);
  const byName = (name: string) => refs.find((ref) => ref.fullName === name);

  it('skips symbolic refs such as origin/HEAD', () => {
    expect(byName('refs/remotes/origin/HEAD')).toBeUndefined();
    expect(refs).toHaveLength(8);
  });

  it('parses the current branch with upstream ahead/behind', () => {
    expect(byName('refs/heads/main')).toEqual({
      type: 'branch',
      fullName: 'refs/heads/main',
      name: 'main',
      commit: '6f5ca25',
      date: new Date(1790192032 * 1000),
      isHead: true,
      upstream: {
        name: 'origin/main',
        remote: 'origin',
        branch: 'main',
        ahead: 1,
        behind: 2,
        gone: false,
      },
    });
  });

  it('marks a deleted upstream as gone', () => {
    expect(byName('refs/heads/gone')).toMatchObject({
      isHead: false,
      upstream: { name: 'origin/gone', gone: true, ahead: 0, behind: 0 },
    });
  });

  it('supports local upstreams and branches without upstream', () => {
    expect(byName('refs/heads/topic')).toMatchObject({
      upstream: { name: 'main', remote: '.', branch: 'main', behind: 3 },
    });
    expect(byName('refs/heads/solo')).toMatchObject({ upstream: undefined });
  });

  it('resolves remote names containing slashes', () => {
    expect(byName('refs/remotes/my/fork/feature/x')).toMatchObject({
      type: 'remoteBranch',
      name: 'my/fork/feature/x',
      remote: 'my/fork',
      branch: 'feature/x',
    });
  });

  it('peels annotated tags to their commit', () => {
    expect(byName('refs/tags/v1')).toMatchObject({
      type: 'tag',
      name: 'v1',
      commit: '8276d76',
      annotated: true,
    });
    expect(byName('refs/tags/light')).toMatchObject({ commit: '8276d76', annotated: false });
  });
});

describe('splitRemoteBranch', () => {
  it('falls back to the first path segment for unknown remotes', () => {
    expect(splitRemoteBranch('upstream/feature/y', ['origin'])).toEqual({
      remote: 'upstream',
      branch: 'feature/y',
    });
  });
});
