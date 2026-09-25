import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findGit, Git } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';
import { createHistoryRepo, type HistoryRepo } from '../../fixtures/testRepo';

describe('Repository.getCommitFiles', () => {
  let fixture: HistoryRepo;
  let repository: Repository;

  beforeAll(async () => {
    fixture = createHistoryRepo();
    repository = new Repository(fixture.repo.root, new Git(await findGit([])));
  });

  afterAll(() => fixture?.repo.dispose());

  it('lists the files of the root commit as added', async () => {
    expect(await repository.getCommitFiles(fixture.commits.initial, [])).toEqual([
      { status: 'added', path: 'README.md' },
    ]);
  });

  it('compares a commit with its first parent', async () => {
    expect(await repository.getCommitFiles(fixture.commits.typo, [fixture.commits.app])).toEqual([
      { status: 'modified', path: 'README.md' },
    ]);
    expect(
      await repository.getCommitFiles(fixture.commits.merge, [
        fixture.commits.typo,
        fixture.commits.logout,
      ]),
    ).toEqual([
      { status: 'added', path: 'src/login.ts' },
      { status: 'added', path: 'src/logout.ts' },
    ]);
  });
});
