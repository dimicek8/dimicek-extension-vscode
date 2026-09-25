import { describe, expect, it } from 'vitest';
import { toLogRefs } from '../../../src/features/log/logRefs';

describe('toLogRefs', () => {
  it('orders the current branch first, then local, remote branches and tags', () => {
    expect(
      toLogRefs(
        [
          'refs/tags/v1.0',
          'refs/remotes/origin/main',
          'refs/remotes/origin/HEAD',
          'refs/heads/topic',
          'refs/heads/main',
          'refs/stash',
        ],
        true,
        'refs/heads/main',
      ),
    ).toEqual([
      { name: 'main', kind: 'branch', current: true },
      { name: 'topic', kind: 'branch', current: false },
      { name: 'origin/main', kind: 'remote', current: false },
      { name: 'v1.0', kind: 'tag', current: false },
    ]);
  });

  it('shows HEAD for a detached HEAD', () => {
    expect(toLogRefs(['refs/tags/v1.0'], true)).toEqual([
      { name: 'HEAD', kind: 'head', current: true },
      { name: 'v1.0', kind: 'tag', current: false },
    ]);
  });
});
