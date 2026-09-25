import { describe, expect, it } from 'vitest';
import { parseNameStatus } from '../../../src/git/parsers/nameStatus';

describe('parseNameStatus', () => {
  it('parses additions, modifications, deletions and renames', () => {
    expect(
      parseNameStatus(
        [
          'A',
          'new file.txt',
          'M',
          'a.txt',
          'D',
          'b.txt',
          'R087',
          'old.txt',
          'dir/new.txt',
          'T',
          'link',
          '',
        ].join('\0'),
      ),
    ).toEqual([
      { status: 'added', path: 'new file.txt' },
      { status: 'modified', path: 'a.txt' },
      { status: 'deleted', path: 'b.txt' },
      { status: 'renamed', path: 'dir/new.txt', originalPath: 'old.txt' },
      { status: 'typeChanged', path: 'link' },
    ]);
  });

  it('returns nothing for identical trees', () => {
    expect(parseNameStatus('')).toEqual([]);
  });
});
