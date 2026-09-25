import { describe, expect, it } from 'vitest';
import { parseRecentCheckouts } from '../../../src/git/parsers/reflog';

describe('parseRecentCheckouts', () => {
  it('lists checked out names from newest to oldest without duplicates', () => {
    const output = [
      'checkout: moving from 6f5ca25 to main',
      'checkout: moving from main to HEAD',
      'commit: 2',
      'checkout: moving from feature/x to main',
      'checkout: moving from main to feature/x',
      'checkout: moving from old to main',
      '',
    ].join('\n');
    expect(parseRecentCheckouts(output)).toEqual(['main', '6f5ca25', 'HEAD', 'feature/x', 'old']);
  });
});
