import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findGit, Git } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';
import { createHistoryRepo, type HistoryRepo } from '../../fixtures/testRepo';

describe('Repository branch actions', () => {
  let fixture: HistoryRepo;
  let repository: Repository;

  beforeEach(async () => {
    fixture = createHistoryRepo();
    repository = new Repository(fixture.repo.root, new Git(await findGit([])));
  });

  afterEach(() => fixture?.repo.dispose());

  const git = (...args: string[]) => fixture.repo.git(...args);
  const read = (path: string) => readFileSync(join(fixture.repo.root, path), 'utf8');

  function createConflict(): void {
    git('switch', '--quiet', '--create', 'conflict', fixture.commits.merge);
    fixture.repo.commit('Change readme on branch', { 'README.md': 'branch\n' });
    git('switch', '--quiet', 'main');
    fixture.repo.commit('Change readme on main', { 'README.md': 'main\n' });
  }

  it('merges a branch into the current one', async () => {
    git('switch', '--quiet', '--create', 'extra');
    fixture.repo.commit('Extra work', { 'extra.txt': 'extra\n' });
    git('switch', '--quiet', 'main');

    await repository.merge('extra');

    expect(read('extra.txt')).toBe('extra\n');
    expect(await repository.getOperationState()).toBeUndefined();
  });

  it('reports merge conflicts and can abort the merge', async () => {
    createConflict();
    await expect(repository.merge('conflict')).rejects.toMatchObject({ code: 'Conflict' });
    expect(await repository.getOperationState()).toEqual({ kind: 'merge' });

    await repository.abortMerge();
    expect(await repository.getOperationState()).toBeUndefined();
    expect(read('README.md')).toBe('main\n');
  });

  it('rebases the current branch or another branch onto a revision', async () => {
    git('switch', '--quiet', '--create', 'extra', fixture.commits.app);
    fixture.repo.commit('Extra work', { 'extra.txt': 'extra\n' });

    await repository.rebase('main');
    expect(git('rev-parse', 'extra~1')).toBe(fixture.commits.local);

    git('switch', '--quiet', 'main');
    await repository.rebase('main', 'feature/login');
    expect(git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('feature/login');
    expect(git('merge-base', '--is-ancestor', 'main', 'feature/login')).toBe('');
  });

  it('continues a rebase after conflicts are resolved and can abort another one', async () => {
    createConflict();
    git('switch', '--quiet', 'conflict');
    await expect(repository.rebase('main')).rejects.toMatchObject({ code: 'Conflict' });
    expect(await repository.getOperationState()).toEqual({ kind: 'rebase', branch: 'conflict' });

    fixture.repo.write('README.md', 'resolved\n');
    git('add', 'README.md');
    await repository.continueRebase();
    expect(await repository.getOperationState()).toBeUndefined();
    expect(git('log', '-1', '--format=%s')).toBe('Change readme on branch');

    git('reset', '--hard', '--quiet', 'ORIG_HEAD');
    await expect(repository.rebase('main')).rejects.toMatchObject({ code: 'Conflict' });
    await repository.abortRebase();
    expect(await repository.getOperationState()).toBeUndefined();
  });

  it('renames and deletes branches, refusing unmerged ones unless forced', async () => {
    await repository.renameBranch('feature/login', 'feature/auth');
    expect(git('branch', '--list', 'feature/auth')).toContain('feature/auth');

    git('switch', '--quiet', '--create', 'unmerged');
    fixture.repo.commit('Unmerged work', { 'u.txt': 'u\n' });
    git('switch', '--quiet', 'main');
    await expect(repository.deleteBranch('unmerged')).rejects.toMatchObject({
      code: 'BranchNotFullyMerged',
    });
    await repository.deleteBranch('unmerged', { force: true });
    expect(git('branch', '--list', 'unmerged')).toBe('');
  });

  it('deletes a remote branch', async () => {
    await repository.deleteRemoteBranch('origin', 'feature/login');
    expect(git('ls-remote', '--heads', 'origin', 'feature/login')).toBe('');
  });

  it('pushes a branch that is not checked out', async () => {
    git('switch', '--quiet', 'feature/login');
    fixture.repo.commit('More login work', { 'src/login.ts': 'export const login = 2;\n' });
    git('switch', '--quiet', 'main');

    await repository.push('feature/login');
    expect(git('rev-parse', 'origin/feature/login')).toBe(git('rev-parse', 'feature/login'));
  });

  it('updates a branch that is not checked out by fast-forwarding it', async () => {
    fixture.other.git('switch', '--quiet', '--track', 'origin/feature/login');
    fixture.other.commit('Remote login work', { 'remote-login.txt': 'x\n' });
    fixture.other.git('push', '--quiet', 'origin', 'feature/login');

    await repository.update('feature/login');
    expect(git('rev-parse', 'feature/login')).toBe(fixture.other.git('rev-parse', 'HEAD'));
  });

  it('updates the current branch by merging its upstream', async () => {
    await repository.update();
    const { branch } = await repository.getStatus();
    expect(branch).toMatchObject({ ahead: 2, behind: 0 });
    expect(git('log', '-1', '--format=%P').split(' ')).toHaveLength(2);
  });

  it('compares two revisions', async () => {
    expect(await repository.diffNameStatus('main', 'feature/login')).toEqual([
      { status: 'deleted', path: 'LOCAL.md' },
      { status: 'modified', path: 'README.md' },
    ]);
    expect(await repository.countAheadBehind('main', 'feature/login')).toEqual({
      ahead: 0,
      behind: 3,
    });
  });
});
