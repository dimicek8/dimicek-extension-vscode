import { describe, expect, it } from 'vitest';
import type { BranchesViewBranch, BranchesViewState } from '../../../src/shared/protocol';
import { type BranchRow, buildBranchRows } from '../../../webview-ui/src/branches/branchRows';

function local(name: string, extra: Partial<BranchesViewBranch> = {}): BranchesViewBranch {
  return {
    fullName: `refs/heads/${name}`,
    name,
    kind: 'local',
    shortName: name,
    current: false,
    favorite: false,
    ...extra,
  };
}

function remote(remoteName: string, branch: string): BranchesViewBranch {
  return {
    fullName: `refs/remotes/${remoteName}/${branch}`,
    name: `${remoteName}/${branch}`,
    kind: 'remote',
    remote: remoteName,
    shortName: branch,
    current: false,
    favorite: false,
  };
}

const state: BranchesViewState = {
  repository: 'app',
  current: 'main',
  commands: [],
  recent: ['refs/heads/feature/login'],
  branches: [
    local('main', { current: true, favorite: true }),
    local('feature/login'),
    local('feature/logout'),
    local('zeta', { favorite: true }),
    remote('origin', 'main'),
    remote('origin', 'feature/login'),
    remote('fork', 'fix'),
  ],
};

const outline = (rows: BranchRow[]) =>
  rows.map(
    (row) =>
      `${'  '.repeat(row.depth)}${row.type === 'branch' ? '' : row.type === 'folder' ? '[' : '#'}${row.label}`,
  );

describe('buildBranchRows', () => {
  it('shows recent branches flat, local branches in folders and remotes by remote', () => {
    expect(outline(buildBranchRows(state, '', new Set()))).toEqual([
      '#Recent',
      '  feature/login',
      '#Local',
      '  [feature',
      '    login',
      '    logout',
      '  main',
      '  zeta',
      '#Remote',
      '  #fork',
      '    fix',
      '  #origin',
      '    [feature',
      '      login',
      '    main',
    ]);
  });

  it('collapses sections and folders', () => {
    const rows = buildBranchRows(state, '', new Set(['recent', 'local/feature', 'remote']));
    expect(outline(rows)).toEqual([
      '#Recent',
      '#Local',
      '  [feature',
      '  main',
      '  zeta',
      '#Remote',
    ]);
  });

  it('filters by name and expands everything while searching', () => {
    const rows = buildBranchRows(state, 'LOG', new Set(['local', 'remote']));
    expect(outline(rows)).toEqual([
      '#Recent',
      '  feature/login',
      '#Local',
      '  [feature',
      '    login',
      '    logout',
      '#Remote',
      '  #origin',
      '    [feature',
      '      login',
    ]);
  });
});
