import { describe, expect, it } from 'vitest';
import type { FileChange } from '../../../src/features/commit/fileChanges';
import { Inclusion } from '../../../src/features/commit/inclusion';

const modified = (path: string): FileChange => ({ path, kind: 'modified' });
const unversioned = (path: string): FileChange => ({ path, kind: 'unversioned' });

describe('Inclusion', () => {
  it('includes new tracked changes but not unversioned files', () => {
    const inclusion = new Inclusion();
    const changes = [modified('a'), unversioned('b')];
    inclusion.update(changes);
    expect(inclusion.includedChanges(changes)).toEqual([modified('a')]);
  });

  it('remembers files the user excluded or included across refreshes', () => {
    const inclusion = new Inclusion();
    inclusion.update([modified('a'), unversioned('b')]);
    inclusion.set(['a'], false);
    inclusion.set(['b'], true);
    inclusion.update([modified('a'), unversioned('b'), modified('c')]);
    expect([
      inclusion.isIncluded('a'),
      inclusion.isIncluded('b'),
      inclusion.isIncluded('c'),
    ]).toEqual([false, true, true]);
  });

  it('forgets files that are no longer changed', () => {
    const inclusion = new Inclusion();
    inclusion.update([modified('a')]);
    inclusion.update([]);
    inclusion.update([unversioned('a')]);
    expect(inclusion.isIncluded('a')).toBe(false);
  });

  it('ignores paths it does not know', () => {
    const inclusion = new Inclusion();
    inclusion.set(['ghost'], true);
    inclusion.update([unversioned('ghost')]);
    expect(inclusion.isIncluded('ghost')).toBe(false);
  });
});
