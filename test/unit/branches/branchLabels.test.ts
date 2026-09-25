import { describe, expect, it } from 'vitest';
import { statusBarText, statusBarTooltip } from '../../../src/features/branches/branchLabels';

describe('statusBarText', () => {
  it('shows the branch with ahead and behind counts', () => {
    expect(statusBarText({ head: 'main', commit: 'abc', ahead: 1, behind: 2 })).toBe(
      '$(git-branch) main ↑1 ↓2',
    );
    expect(statusBarText({ head: 'main', commit: 'abc', ahead: 0, behind: 0 })).toBe(
      '$(git-branch) main',
    );
  });

  it('shows the short commit for a detached HEAD', () => {
    expect(statusBarText({ commit: '1234567890abcdef' })).toBe('$(git-commit) 1234567');
  });

  it('shows the operation in progress and the rebased branch', () => {
    expect(statusBarText({ commit: 'abc' }, { kind: 'rebase', branch: 'feature' })).toBe(
      '$(git-branch) feature (Rebasing)',
    );
    expect(statusBarText({ head: 'main', commit: 'abc', ahead: 3 }, { kind: 'merge' })).toBe(
      '$(git-branch) main (Merging)',
    );
  });
});

describe('statusBarTooltip', () => {
  it('describes branch, upstream and the click action', () => {
    expect(
      statusBarTooltip('app', { head: 'main', upstream: 'origin/main', ahead: 1, behind: 0 }),
    ).toBe('Repository: app\nBranch: main\nUpstream: origin/main (↑1)\n\nClick to show branches');
    expect(statusBarTooltip('app', { head: 'topic' })).toContain('No upstream branch');
    expect(statusBarTooltip('app', { commit: 'abc' }, { kind: 'rebase', branch: 'x' })).toContain(
      'Rebasing in progress',
    );
  });
});
