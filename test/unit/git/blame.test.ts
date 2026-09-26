import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseBlame, UNCOMMITTED_HASH } from '../../../src/git/parsers/blame';
import { findGit, Git } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';
import { createHistoryRepo, type HistoryRepo } from '../../fixtures/testRepo';

const A = '47ba150edab09b697257fe2bc48c21761c1d63f8';
const B = 'c14dbe52bdd224cca118c8714ed6a8ec8db285ff';

const PORCELAIN = [
  `${A} 1 1 1`,
  'author Jan Novák',
  'author-mail <jan@example.com>',
  'author-time 1790422021',
  'author-tz +0200',
  'summary one',
  'boundary',
  'filename old.txt',
  '\ta',
  `${B} 2 2 1`,
  'author T',
  'author-mail <t@t>',
  'author-time 1790422100',
  'summary edit',
  'previous b84ce2b43736cee05f6c82c409e6c33b8d945acc new.txt',
  'filename new.txt',
  '\tB',
  `${A} 3 3 1`,
  '\tc',
  `${UNCOMMITTED_HASH} 4 4 1`,
  'author Not Committed Yet',
  'author-mail <not.committed.yet>',
  'author-time 1790422200',
  'summary Version of new.txt from new.txt',
  'filename new.txt',
  '\td',
  '',
].join('\n');

describe('parseBlame', () => {
  const lines = parseBlame(PORCELAIN);

  it('assigns a commit to every line and reuses commit metadata', () => {
    expect(lines.map((line) => [line.line, line.commit.hash])).toEqual([
      [0, A],
      [1, B],
      [2, A],
      [3, UNCOMMITTED_HASH],
    ]);
    expect(lines[2]!.commit).toBe(lines[0]!.commit);
  });

  it('reads author, email, time, summary and file name', () => {
    expect(lines[0]!.commit).toEqual({
      hash: A,
      author: 'Jan Novák',
      authorEmail: 'jan@example.com',
      authorTime: new Date(1790422021 * 1000),
      summary: 'one',
      filename: 'old.txt',
      uncommitted: false,
    });
    expect(lines[3]!.commit.uncommitted).toBe(true);
  });
});

describe('Repository.blame', () => {
  let fixture: HistoryRepo;
  let repository: Repository;

  beforeAll(async () => {
    fixture = createHistoryRepo();
    repository = new Repository(fixture.repo.root, new Git(await findGit([])));
  });

  afterAll(() => fixture?.repo.dispose());

  it('blames the committed file', async () => {
    const lines = await repository.blame('README.md');
    expect(lines.map((line) => line.commit.hash)).toEqual([fixture.commits.typo]);
  });

  it('blames unsaved editor contents', async () => {
    const lines = await repository.blame('README.md', '# Test project\nnew line\n');
    expect(lines.map((line) => line.commit.uncommitted)).toEqual([false, true]);
  });

  it('fails for files that are not tracked', async () => {
    fixture.repo.write('scratch.txt', 'x\n');
    await expect(repository.blame('scratch.txt')).rejects.toThrow();
  });
});
