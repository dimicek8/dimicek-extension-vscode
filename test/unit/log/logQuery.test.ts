import { describe, expect, it } from 'vitest';
import { isFiltered, looksLikeHash, toLogOptions } from '../../../src/features/log/logQuery';

describe('toLogOptions', () => {
  const now = new Date('2026-09-25T12:00:00Z');

  it('shows all branches without filters', () => {
    expect(toLogOptions({}, now)).toEqual({ all: true });
  });

  it('maps every filter to git log options', () => {
    expect(
      toLogOptions(
        { text: ' fix ', branch: 'main', author: 'Jan', since: 'week', path: 'src/app.ts' },
        now,
      ),
    ).toEqual({
      revisions: ['main'],
      grep: 'fix',
      author: 'Jan',
      since: new Date('2026-09-18T12:00:00Z'),
      paths: ['src/app.ts'],
    });
  });
});

describe('isFiltered', () => {
  it('ignores the branch filter because the graph still makes sense', () => {
    expect(isFiltered({ branch: 'main' })).toBe(false);
    expect(isFiltered({ author: 'x' })).toBe(true);
  });
});

describe('looksLikeHash', () => {
  it('accepts hexadecimal strings of 4 to 40 characters', () => {
    expect(looksLikeHash('a1b2')).toBe(true);
    expect(looksLikeHash('abc')).toBe(false);
    expect(looksLikeHash('fix bug')).toBe(false);
    expect(looksLikeHash(undefined)).toBe(false);
  });
});
