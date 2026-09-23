import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findGit, Git } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';
import {
  addWorkingTreeChanges,
  createHistoryRepo,
  type HistoryRepo,
  TestRepo,
} from '../../fixtures/testRepo';

describe('Repository', () => {
  let fixture: HistoryRepo;
  let repository: Repository;

  beforeAll(async () => {
    fixture = createHistoryRepo();
    repository = new Repository(fixture.repo.root, new Git(await findGit([])));
  });

  afterAll(() => fixture?.repo.dispose());

  describe('getRefs', () => {
    it('lists local branches, remote branches and tags', async () => {
      const refs = await repository.getRefs();
      const names = refs.map((ref) => `${ref.type}:${ref.name}`);
      expect(names.sort()).toEqual(
        [
          'branch:feature/login',
          'branch:gone',
          'branch:main',
          'remoteBranch:origin/feature/login',
          'remoteBranch:origin/main',
          'tag:light',
          'tag:v1.0',
        ].sort(),
      );
    });

    it('reports upstream tracking and peeled tags', async () => {
      const refs = await repository.getRefs();
      const find = (name: string) => refs.find((ref) => ref.fullName === name);
      const { commits } = fixture;

      expect(find('refs/heads/main')).toMatchObject({
        isHead: true,
        commit: commits.local,
        upstream: { name: 'origin/main', ahead: 1, behind: 1, gone: false },
      });
      expect(find('refs/heads/feature/login')).toMatchObject({
        isHead: false,
        commit: commits.logout,
        upstream: { name: 'origin/feature/login', ahead: 0, behind: 0, gone: false },
      });
      expect(find('refs/heads/gone')).toMatchObject({ upstream: { gone: true } });
      expect(find('refs/remotes/origin/main')).toMatchObject({ commit: commits.remote });
      expect(find('refs/tags/v1.0')).toMatchObject({ annotated: true, commit: commits.merge });
      expect(find('refs/tags/light')).toMatchObject({ annotated: false, commit: commits.app });
    });
  });

  describe('getLog', () => {
    it('returns HEAD history in topological order with merge parents', async () => {
      const { commits } = fixture;
      const log = await repository.getLog();

      expect(log.map((commit) => commit.hash).slice(0, 2)).toEqual([commits.local, commits.merge]);
      expect(new Set(log.map((commit) => commit.hash))).toEqual(
        new Set([
          commits.local,
          commits.merge,
          commits.typo,
          commits.logout,
          commits.login,
          commits.app,
          commits.initial,
        ]),
      );
      expect(log[1]).toMatchObject({
        parents: [commits.typo, commits.logout],
        subject: "Merge branch 'feature/login'",
        refs: ['refs/tags/v1.0', 'refs/heads/gone'],
        author: { name: 'Test User', email: 'test@example.com' },
      });
      expect(log[0]).toMatchObject({ isHead: true, refs: ['refs/heads/main'] });
    });

    it('includes all refs, pages and filters', async () => {
      const { commits } = fixture;
      const all = await repository.getLog({ all: true });
      expect(all.map((commit) => commit.hash)).toContain(commits.remote);

      const head = await repository.getLog();
      const page = await repository.getLog({ maxCount: 2, skip: 1 });
      expect(page).toEqual(head.slice(1, 3));

      const byPath = await repository.getLog({ paths: ['README.md'] });
      expect(byPath.map((commit) => commit.hash)).toEqual([commits.typo, commits.initial]);

      const byMessage = await repository.getLog({ all: true, grep: 'REMOTE change' });
      expect(byMessage.map((commit) => commit.hash)).toEqual([commits.remote]);
    });

    it('returns an empty history for a repository without commits', async () => {
      const empty = TestRepo.create();
      try {
        const log = await new Repository(empty.root, new Git(await findGit([]))).getLog();
        expect(log).toEqual([]);
      } finally {
        empty.dispose();
      }
    });
  });

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
