import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findGit, Git } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';
import { createHistoryRepo, type HistoryRepo } from '../../fixtures/testRepo';

describe('Repository branch operations', () => {
  let fixture: HistoryRepo;
  let repository: Repository;

  beforeEach(async () => {
    fixture = createHistoryRepo();
    repository = new Repository(fixture.repo.root, new Git(await findGit([])));
  });

  afterEach(() => fixture?.repo.dispose());

  const head = async () => (await repository.getStatus()).branch;

  it('switches between local branches and remembers recent checkouts', async () => {
    await repository.switchBranch('feature/login');
    expect((await head()).head).toBe('feature/login');
    await repository.switchBranch('main');

    const recent = await repository.getRecentCheckouts();
    expect(recent.slice(0, 2)).toEqual(['main', 'feature/login']);
  });

  it('checks out a remote branch as a new tracking branch', async () => {
    fixture.repo.git('branch', '--delete', '--force', 'feature/login');
    await repository.switchToRemoteBranch('origin/feature/login', 'feature/login');
    expect(await head()).toMatchObject({
      head: 'feature/login',
      upstream: 'origin/feature/login',
      ahead: 0,
      behind: 0,
    });
  });

  it('checks out a tag as a detached HEAD', async () => {
    await repository.switchDetached('v1.0');
    expect(await head()).toMatchObject({ head: undefined, commit: fixture.commits.merge });
  });

  it('creates a branch with or without checking it out', async () => {
    await repository.createBranch('topic', 'feature/login', { checkout: false });
    expect((await head()).head).toBe('main');
    await repository.createBranch('topic2', 'v1.0', { checkout: true });
    expect(await head()).toMatchObject({ head: 'topic2', commit: fixture.commits.merge });
  });

  it('validates branch names and revisions', async () => {
    expect(await repository.isValidBranchName('feature/new-thing')).toBe(true);
    expect(await repository.isValidBranchName('bad..name')).toBe(false);
    expect(await repository.isValidBranchName('with space')).toBe(false);
    expect(await repository.revisionExists('v1.0')).toBe(true);
    expect(await repository.revisionExists(fixture.commits.app.slice(0, 8))).toBe(true);
    expect(await repository.revisionExists('no-such-thing')).toBe(false);
  });

  it('reports local changes that block a checkout and can force or stash them', async () => {
    fixture.repo.write('README.md', 'local edit\n');
    await expect(repository.switchBranch('feature/login')).rejects.toMatchObject({
      code: 'LocalChangesOverwritten',
    });

    await repository.stash('smart checkout');
    await repository.switchBranch('feature/login');
    await repository.switchBranch('main');
    await repository.stashPop();
    expect(readFileSync(join(fixture.repo.root, 'README.md'), 'utf8')).toBe('local edit\n');

    await repository.switchBranch('feature/login', { force: true });
    expect((await head()).head).toBe('feature/login');
    expect(readFileSync(join(fixture.repo.root, 'README.md'), 'utf8')).toBe('# Test\n');
  });

  it('fetches from all remotes', async () => {
    fixture.other.commit('Another remote change');
    fixture.other.git('push', '--quiet', 'origin', 'main');

    await repository.fetch();
    expect((await head()).behind).toBe(2);
  });
});

describe('Repository log of all branches', () => {
  it('does not include stash commits', async () => {
    const fixture = createHistoryRepo();
    try {
      const repository = new Repository(fixture.repo.root, new Git(await findGit([])));
      fixture.repo.write('README.md', 'stashed\n');
      fixture.repo.git('stash', 'push', '--quiet');
      const stash = fixture.repo.git('rev-parse', 'refs/stash');

      const log = await repository.getLog({ all: true });

      expect(log.map((commit) => commit.hash)).not.toContain(stash);
      expect(log).toHaveLength(8);
    } finally {
      fixture.repo.dispose();
    }
  });
});
