import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findGit, Git } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';
import { createHistoryRepo, type HistoryRepo } from '../../fixtures/testRepo';

describe('Repository.getOperationState', () => {
  let fixture: HistoryRepo;
  let repository: Repository;

  beforeEach(async () => {
    fixture = createHistoryRepo();
    repository = new Repository(fixture.repo.root, new Git(await findGit([])));
    fixture.repo.git('switch', '--quiet', '--create', 'conflict', fixture.commits.merge);
    fixture.repo.commit('Change readme on branch', { 'README.md': 'branch\n' });
    fixture.repo.git('switch', '--quiet', 'main');
    fixture.repo.commit('Change readme on main', { 'README.md': 'main\n' });
  });

  afterEach(() => fixture?.repo.dispose());

  it('reports no operation on a clean repository', async () => {
    expect(await repository.getOperationState()).toBeUndefined();
  });

  it('detects a merge with conflicts', async () => {
    expect(() => fixture.repo.git('merge', 'conflict')).toThrow();
    expect(await repository.getOperationState()).toEqual({ kind: 'merge' });
  });

  it('detects a rebase and the branch being rebased', async () => {
    fixture.repo.git('switch', '--quiet', 'conflict');
    expect(() => fixture.repo.git('rebase', 'main')).toThrow();
    expect(await repository.getOperationState()).toEqual({ kind: 'rebase', branch: 'conflict' });
  });

  it('detects a cherry-pick with conflicts', async () => {
    expect(() => fixture.repo.git('cherry-pick', 'conflict')).toThrow();
    expect(await repository.getOperationState()).toEqual({ kind: 'cherryPick' });
  });
});
