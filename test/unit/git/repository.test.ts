import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findGit, Git } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';
import {
  addWorkingTreeChanges,
  createHistoryRepo,
  type HistoryRepo,
} from '../../fixtures/testRepo';

describe('Repository', () => {
  let fixture: HistoryRepo;
  let repository: Repository;

  beforeAll(async () => {
    fixture = createHistoryRepo();
    repository = new Repository(fixture.repo.root, new Git(await findGit([])));
  });

  afterAll(() => fixture?.repo.dispose());

  describe('getStatus', () => {
    it('reports branch, upstream and ahead/behind on a clean tree', async () => {
      const status = await repository.getStatus();
      expect(status.branch).toEqual({
        commit: fixture.commits.local,
        head: 'main',
        upstream: 'origin/main',
        ahead: 1,
        behind: 1,
      });
      expect(status.entries).toEqual([]);
    });

    it('reports working tree and index changes', async () => {
      addWorkingTreeChanges(fixture.repo);
      fixture.repo.git('stash', 'push', '--quiet', '--', 'README.md');
      fixture.repo.write('README.md', '# Changed again\n');

      const status = await repository.getStatus();

      expect(status.stashCount).toBe(1);
      expect(status.entries).toEqual(
        expect.arrayContaining([
          { kind: 'changed', path: 'README.md', index: 'unmodified', worktree: 'modified' },
          { kind: 'changed', path: 'src/new file.ts', index: 'added', worktree: 'unmodified' },
          { kind: 'changed', path: 'src/logout.ts', index: 'deleted', worktree: 'unmodified' },
          {
            kind: 'changed',
            path: 'src/auth.ts',
            originalPath: 'src/login.ts',
            index: 'renamed',
            worktree: 'unmodified',
          },
          { kind: 'untracked', path: 'notes/todo ž.txt' },
        ]),
      );
      expect(status.entries).toHaveLength(5);
    });
  });
});
