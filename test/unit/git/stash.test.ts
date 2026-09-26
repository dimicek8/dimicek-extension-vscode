import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findGit, Git } from '../../../src/git/gitExec';
import { parseStashes } from '../../../src/git/parsers/stash';
import { Repository } from '../../../src/git/repository';
import { createHistoryRepo, type HistoryRepo } from '../../fixtures/testRepo';

describe('parseStashes', () => {
  it('reads ref, index, branch, message and untracked files', () => {
    const output = [
      ['stash@{0}', 'aaa', 'p1 p2', '1790423931', 'WIP on main: c14dbe5 edit'].join('\x1f'),
      ['stash@{1}', 'bbb', 'p1 p2 p3', '1790423900', 'On feature/x: my message'].join('\x1f'),
      '',
    ].join('\0');
    expect(parseStashes(output)).toEqual([
      {
        ref: 'stash@{0}',
        index: 0,
        hash: 'aaa',
        parents: ['p1', 'p2'],
        date: new Date(1790423931 * 1000),
        branch: 'main',
        message: 'c14dbe5 edit',
        hasUntracked: false,
      },
      {
        ref: 'stash@{1}',
        index: 1,
        hash: 'bbb',
        parents: ['p1', 'p2', 'p3'],
        date: new Date(1790423900 * 1000),
        branch: 'feature/x',
        message: 'my message',
        hasUntracked: true,
      },
    ]);
  });
});

describe('Repository stash operations', () => {
  let fixture: HistoryRepo;
  let repository: Repository;

  beforeEach(async () => {
    fixture = createHistoryRepo();
    repository = new Repository(fixture.repo.root, new Git(await findGit([])));
  });

  afterEach(() => fixture?.repo.dispose());

  const read = (path: string) => readFileSync(join(fixture.repo.root, path), 'utf8');

  async function stashTwo(): Promise<void> {
    fixture.repo.write('README.md', 'first\n');
    fixture.repo.write('notes.txt', 'untracked\n');
    await repository.stash('First stash');
    fixture.repo.write('README.md', 'second\n');
    await repository.stash('Second stash', { includeUntracked: false });
  }

  it('removes stashed untracked files from the working tree', async () => {
    fixture.repo.write('notes.txt', 'untracked\n');
    await repository.stash('With untracked');
    expect(existsSync(join(fixture.repo.root, 'notes.txt'))).toBe(false);
  });

  it('lists stashes newest first with their files', async () => {
    await stashTwo();
    const stashes = await repository.getStashes();
    expect(stashes.map((stash) => [stash.ref, stash.message, stash.hasUntracked])).toEqual([
      ['stash@{0}', 'Second stash', false],
      ['stash@{1}', 'First stash', true],
    ]);
    expect(await repository.getStashFiles(stashes[1]!)).toEqual([
      { status: 'modified', path: 'README.md' },
      { status: 'added', path: 'notes.txt' },
    ]);
  });

  it('applies, pops and drops a chosen stash', async () => {
    await stashTwo();
    await repository.stashApply('stash@{1}');
    expect(read('README.md')).toBe('first\n');
    expect((await repository.getStashes()).length).toBe(2);

    fixture.repo.git('checkout', '--', 'README.md');
    fixture.repo.git('clean', '-fdq');
    await repository.stashPop('stash@{0}');
    expect(read('README.md')).toBe('second\n');
    expect((await repository.getStashes()).map((stash) => stash.message)).toEqual(['First stash']);

    await repository.stashDrop('stash@{0}');
    expect(await repository.getStashes()).toEqual([]);
  });

  it('turns a stash into a branch and clears all stashes', async () => {
    await stashTwo();
    await repository.stashBranch('from-stash', 'stash@{1}');
    expect((await repository.getStatus()).branch.head).toBe('from-stash');
    expect(read('notes.txt')).toBe('untracked\n');

    await repository.stashClear();
    expect(await repository.getStashes()).toEqual([]);
  });
});
