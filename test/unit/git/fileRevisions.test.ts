import { describe, expect, it } from 'vitest';
import { parseFileRevisions } from '../../../src/git/parsers/fileRevisions';
import { findGit, Git } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';
import { createHistoryRepo } from '../../fixtures/testRepo';

const header = (hash: string, subject: string) =>
  ['h' + hash, 'Jan', '1790000000', subject].join('\x1f');

describe('parseFileRevisions', () => {
  it('assigns the file path of every revision and carries it over merge commits', () => {
    const output = [
      header('3', 'Edit'),
      '\nnew.txt',
      header('m', 'Merge'),
      header('2', 'Move'),
      '\nnew.txt',
      header('1', 'Create'),
      '\nold.txt',
      '',
    ].join('\0');
    expect(
      parseFileRevisions(output, 'new.txt').map((revision) => [revision.hash, revision.path]),
    ).toEqual([
      ['h3', 'new.txt'],
      ['hm', 'new.txt'],
      ['h2', 'new.txt'],
      ['h1', 'old.txt'],
    ]);
  });
});

describe('Repository file revisions', () => {
  it('lists revisions of a file with its path at each revision', async () => {
    const fixture = createHistoryRepo();
    try {
      const repository = new Repository(fixture.repo.root, new Git(await findGit([])));
      fixture.repo.git('mv', 'src/login.ts', 'src/auth.ts');
      fixture.repo.commit('Rename login');

      const revisions = await repository.getFileRevisions('src/auth.ts');
      expect(revisions.map((revision) => [revision.subject, revision.path])).toEqual([
        ['Rename login', 'src/auth.ts'],
        ['Add login', 'src/login.ts'],
      ]);
      expect(await repository.pathExistsAt(revisions[1]!.hash, 'src/login.ts')).toBe(true);
      expect(await repository.pathExistsAt(revisions[1]!.hash, 'src/auth.ts')).toBe(false);
      expect(await repository.diffWithWorkingTree(fixture.commits.app, ['src'])).toEqual([
        { status: 'added', path: 'src/auth.ts' },
        { status: 'added', path: 'src/logout.ts' },
      ]);
    } finally {
      fixture.repo.dispose();
    }
  });
});
