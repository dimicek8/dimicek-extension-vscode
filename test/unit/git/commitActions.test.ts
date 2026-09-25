import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findGit, Git } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';
import { createHistoryRepo, type HistoryRepo } from '../../fixtures/testRepo';

describe('Repository commit actions', () => {
  let fixture: HistoryRepo;
  let repository: Repository;

  beforeEach(async () => {
    fixture = createHistoryRepo();
    repository = new Repository(fixture.repo.root, new Git(await findGit([])));
  });

  afterEach(() => fixture?.repo.dispose());

  const git = (...args: string[]) => fixture.repo.git(...args);
  const read = (path: string) => readFileSync(join(fixture.repo.root, path), 'utf8');

  it('cherry-picks a commit onto the current branch', async () => {
    git('switch', '--quiet', '--create', 'pick', fixture.commits.app);
    await repository.cherryPick(fixture.commits.typo);
    expect(git('log', '-1', '--format=%s')).toBe('Fix typo in README');
    expect(read('README.md')).toBe('# Test project\n');
  });

  it('stops a conflicting cherry-pick and can continue or abort it', async () => {
    git('switch', '--quiet', '--create', 'pick', fixture.commits.app);
    fixture.repo.commit('Other readme', { 'README.md': 'other\n' });

    await expect(repository.cherryPick(fixture.commits.typo)).rejects.toMatchObject({
      code: 'Conflict',
    });
    expect(await repository.getOperationState()).toEqual({ kind: 'cherryPick' });
    await repository.abortOperation('cherryPick');
    expect(await repository.getOperationState()).toBeUndefined();

    await expect(repository.cherryPick(fixture.commits.typo)).rejects.toMatchObject({
      code: 'Conflict',
    });
    fixture.repo.write('README.md', 'resolved\n');
    git('add', 'README.md');
    await repository.continueOperation('cherryPick');
    expect(await repository.getOperationState()).toBeUndefined();
    expect(git('log', '-1', '--format=%s')).toBe('Fix typo in README');
  });

  it('reverts a commit', async () => {
    await repository.revert(fixture.commits.local);
    expect(git('log', '-1', '--format=%s')).toBe('Revert "Local change"');
  });

  it('resets the current branch in every mode', async () => {
    await repository.reset(fixture.commits.merge, 'soft');
    expect(git('rev-parse', 'HEAD')).toBe(fixture.commits.merge);
    expect(git('diff', '--cached', '--name-only')).toBe('LOCAL.md');

    await repository.reset(fixture.commits.merge, 'mixed');
    expect(git('diff', '--cached', '--name-only')).toBe('');
    expect(git('status', '--porcelain')).toBe('?? LOCAL.md');

    await repository.reset(fixture.commits.app, 'hard');
    expect(git('rev-parse', 'HEAD')).toBe(fixture.commits.app);
    expect(read('README.md')).toBe('# Test\n');
  });

  it('creates lightweight and annotated tags', async () => {
    expect(await repository.isValidTagName('v2.0')).toBe(true);
    expect(await repository.isValidTagName('bad tag')).toBe(false);

    await repository.createTag('v0.1', fixture.commits.app);
    await repository.createTag('v0.2', fixture.commits.typo, 'Second release');
    expect(git('rev-parse', 'v0.1')).toBe(fixture.commits.app);
    expect(git('cat-file', '-t', 'v0.2')).toBe('tag');
    expect(git('rev-parse', 'v0.2^{commit}')).toBe(fixture.commits.typo);
  });

  it('compares a commit with the working tree', async () => {
    fixture.repo.write('README.md', 'local edit\n');
    expect(await repository.diffWithWorkingTree(fixture.commits.merge)).toEqual([
      { status: 'added', path: 'LOCAL.md' },
      { status: 'modified', path: 'README.md' },
    ]);
  });
});

describe('Repository.getHistoryFingerprint', () => {
  it('changes with commits, checkouts and tags but not with working tree edits', async () => {
    const fixture = createHistoryRepo();
    try {
      const repository = new Repository(fixture.repo.root, new Git(await findGit([])));
      const initial = await repository.getHistoryFingerprint();

      fixture.repo.write('README.md', 'edit\n');
      expect(await repository.getHistoryFingerprint()).toBe(initial);

      fixture.repo.git('tag', 'new-tag');
      const tagged = await repository.getHistoryFingerprint();
      expect(tagged).not.toBe(initial);

      fixture.repo.git('switch', '--quiet', '--create', 'same-commit');
      const switched = await repository.getHistoryFingerprint();
      expect(switched).not.toBe(tagged);

      fixture.repo.commit('Another');
      expect(await repository.getHistoryFingerprint()).not.toBe(switched);
    } finally {
      fixture.repo.dispose();
    }
  });
});
