import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findGit, Git } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';
import {
  addWorkingTreeChanges,
  createHistoryRepo,
  type HistoryRepo,
} from '../../fixtures/testRepo';

describe('Repository commit and push', () => {
  let fixture: HistoryRepo;
  let repository: Repository;

  beforeEach(async () => {
    fixture = createHistoryRepo();
    repository = new Repository(fixture.repo.root, new Git(await findGit([])));
  });

  afterEach(() => fixture?.repo.dispose());

  const paths = async () =>
    (await repository.getStatus()).entries.map((entry) => entry.path).sort();
  const show = (spec: string) => fixture.repo.git('show', spec);

  it('commits only the selected files and leaves the rest untouched', async () => {
    addWorkingTreeChanges(fixture.repo);
    await repository.commit({ message: 'Update readme', paths: ['README.md'] });

    expect(fixture.repo.git('log', '-1', '--format=%s')).toBe('Update readme');
    expect(fixture.repo.git('show', '--name-only', '--format=', 'HEAD')).toBe('README.md');
    expect(await paths()).toEqual([
      'notes/todo ž.txt',
      'src/auth.ts',
      'src/logout.ts',
      'src/new file.ts',
    ]);
  });

  it('commits renames, deletions and new unversioned files', async () => {
    addWorkingTreeChanges(fixture.repo);
    await repository.commit({
      message: 'Restructure\n\nWith a body and "quotes" — ž',
      paths: ['src/login.ts', 'src/auth.ts', 'src/logout.ts', 'notes/todo ž.txt'],
      addPaths: ['notes/todo ž.txt'],
    });

    expect(fixture.repo.git('log', '-1', '--format=%B')).toBe(
      'Restructure\n\nWith a body and "quotes" — ž',
    );
    expect(
      fixture.repo
        .git('-c', 'core.quotepath=false', 'show', '--name-status', '--format=', '-M', 'HEAD')
        .split('\n')
        .sort(),
    ).toEqual(['A\tnotes/todo ž.txt', 'D\tsrc/logout.ts', 'R100\tsrc/login.ts\tsrc/auth.ts']);
    expect(await paths()).toEqual(['README.md', 'src/new file.ts']);
  });

  it('amends only the message when no files are selected', async () => {
    const before = fixture.repo.git('rev-parse', 'HEAD~1');
    await repository.commit({ message: 'Better message', paths: [], amend: true });

    expect(fixture.repo.git('log', '-1', '--format=%s')).toBe('Better message');
    expect(fixture.repo.git('rev-parse', 'HEAD~1')).toBe(before);
    expect(await repository.getLastCommitMessage()).toBe('Better message');
  });

  it('refuses to commit without files unless amending', async () => {
    await expect(repository.commit({ message: 'Nothing', paths: [] })).rejects.toThrow(/No files/);
  });

  it('commits a resolved merge as a whole', async () => {
    fixture.repo.git('switch', '--quiet', '--create', 'conflict', fixture.commits.merge);
    fixture.repo.commit('Change readme on branch', { 'README.md': 'branch\n' });
    fixture.repo.git('switch', '--quiet', 'main');
    fixture.repo.commit('Change readme on main', { 'README.md': 'main\n' });
    expect(() => fixture.repo.git('merge', 'conflict')).toThrow();
    expect(await repository.isMerging()).toBe(true);

    fixture.repo.write('README.md', 'resolved\n');
    await repository.commit({ message: "Merge branch 'conflict'", paths: ['README.md'] });

    expect(await repository.isMerging()).toBe(false);
    expect(fixture.repo.git('log', '-1', '--format=%P').split(' ')).toHaveLength(2);
    expect(show('HEAD:README.md')).toBe('resolved');
  });

  it('pushes a new branch and sets its upstream', async () => {
    fixture.repo.git('switch', '--quiet', '--create', 'topic');
    fixture.repo.write('topic.txt', 'topic\n');
    await repository.commit({
      message: 'Topic work',
      paths: ['topic.txt'],
      addPaths: ['topic.txt'],
    });
    await repository.push();

    const { branch } = await repository.getStatus();
    expect(branch).toMatchObject({ head: 'topic', upstream: 'origin/topic', ahead: 0, behind: 0 });

    fixture.repo.commit('More topic work', { 'topic.txt': 'more\n' });
    await repository.push();
    expect((await repository.getStatus()).branch.ahead).toBe(0);
  });

  it('reports a rejected push', async () => {
    await expect(repository.push()).rejects.toMatchObject({ code: 'PushRejected' });
  });
});
