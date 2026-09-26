import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findGit, Git } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';
import { createHistoryRepo, type HistoryRepo } from '../../fixtures/testRepo';

describe('Repository interactive rebase', () => {
  let fixture: HistoryRepo;
  let repository: Repository;
  let hashes: Record<string, string>;

  beforeEach(async () => {
    fixture = createHistoryRepo();
    repository = new Repository(fixture.repo.root, new Git(await findGit([])));
    fixture.repo.git('switch', '--quiet', '--create', 'work');
    hashes = {
      one: fixture.repo.commit('One', { 'one.txt': '1\n' }),
      two: fixture.repo.commit('Two', { 'two.txt': '2\n' }),
      three: fixture.repo.commit('Three', { 'three.txt': '3\n' }),
    };
  });

  afterEach(() => fixture?.repo.dispose());

  const subjects = () =>
    fixture.repo.git('log', '--format=%s', `${fixture.commits.local}..HEAD`).split('\n');

  it('lists the commits from the chosen one to HEAD, oldest first', async () => {
    const { base, commits } = await repository.getRebaseCommits(hashes.one!);
    expect(base).toBe(fixture.commits.local);
    expect(commits.map((commit) => commit.subject)).toEqual(['One', 'Two', 'Three']);
  });

  it('refuses ranges with merge commits and commits outside the branch', async () => {
    await expect(repository.getRebaseCommits(fixture.commits.logout)).rejects.toThrow(
      /merge commit/,
    );
    await expect(repository.getRebaseCommits(fixture.commits.remote)).rejects.toThrow(/not part/);
  });

  it('rewords, squashes, reorders and drops commits', async () => {
    await repository.interactiveRebase(fixture.commits.local, [
      { hash: hashes.three!, action: 'reword', message: 'Third, reworded\n\nWith body' },
      { hash: hashes.one!, action: 'pick' },
      { hash: hashes.two!, action: 'fixup' },
    ]);
    expect(subjects()).toEqual(['One', 'Third, reworded']);
    expect(fixture.repo.git('log', '-1', '--format=%B', 'HEAD~1')).toBe(
      'Third, reworded\n\nWith body',
    );
    expect(fixture.repo.git('show', '--name-only', '--format=', 'HEAD').split('\n').sort()).toEqual(
      ['one.txt', 'two.txt'],
    );

    await repository.interactiveRebase(fixture.commits.local, [
      { hash: fixture.repo.git('rev-parse', 'HEAD~1'), action: 'drop' },
      { hash: fixture.repo.git('rev-parse', 'HEAD'), action: 'pick' },
    ]);
    expect(subjects()).toEqual(['One']);
  });

  it('validates the entries before starting', async () => {
    await expect(
      repository.interactiveRebase(fixture.commits.local, [
        { hash: hashes.one!, action: 'squash' },
      ]),
    ).rejects.toThrow(/cannot be squashed/);
    expect(await repository.getOperationState()).toBeUndefined();
  });
});
