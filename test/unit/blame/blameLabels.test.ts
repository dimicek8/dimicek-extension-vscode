import { describe, expect, it } from 'vitest';
import { blameLabels, LABEL_WIDTH } from '../../../src/features/blame/blameLabels';
import type { BlameCommit } from '../../../src/git/parsers/blame';

function commit(hash: string, author: string, uncommitted = false): BlameCommit {
  return {
    hash,
    author,
    authorEmail: '',
    authorTime: new Date(2026, 8, 25, 12),
    summary: '',
    filename: 'a.txt',
    uncommitted,
  };
}

describe('blameLabels', () => {
  it('labels the first line of each block and pads all labels to the same width', () => {
    const a = commit('a', 'Jan Novák');
    const b = commit('b', 'A very long author name that does not fit');
    const labels = blameLabels([
      { line: 0, commit: a },
      { line: 1, commit: a },
      { line: 2, commit: b },
      { line: 3, commit: commit('0', 'Not Committed Yet', true) },
    ]);

    expect(labels.map((label) => label.text.trimEnd())).toEqual([
      '2026-09-25 Jan Novák',
      '',
      '2026-09-25 A very long author…',
      'Not committed yet',
    ]);
    expect(labels.map((label) => label.first)).toEqual([true, false, true, true]);
    expect(labels.every((label) => label.text.length === LABEL_WIDTH)).toBe(true);
  });
});
