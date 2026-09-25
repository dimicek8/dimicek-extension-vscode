import { describe, expect, it } from 'vitest';
import { formatCommitDate, shortHash } from '../../../webview-ui/src/log/format';

describe('formatCommitDate', () => {
  const now = new Date(2026, 8, 25, 18, 30).getTime();

  it('uses Today and Yesterday for recent commits', () => {
    expect(formatCommitDate(new Date(2026, 8, 25, 14, 3).getTime(), now, 'en-GB')).toBe(
      'Today 14:03',
    );
    expect(formatCommitDate(new Date(2026, 8, 24, 23, 59).getTime(), now, 'en-GB')).toBe(
      'Yesterday 23:59',
    );
  });

  it('shows the full date for older commits', () => {
    expect(formatCommitDate(new Date(2026, 8, 20, 9, 5).getTime(), now, 'en-GB')).toBe(
      '20/09/2026 09:05',
    );
  });
});

describe('shortHash', () => {
  it('keeps the first eight characters', () => {
    expect(shortHash('0123456789abcdef')).toBe('01234567');
  });
});
