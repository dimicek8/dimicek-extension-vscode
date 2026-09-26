import { describe, expect, it } from 'vitest';
import {
  canMerge,
  conflictAction,
  conflictLabel,
} from '../../../src/features/conflicts/conflictResolution';

describe('conflictAction', () => {
  it('keeps the chosen side of files changed on both sides', () => {
    expect(conflictAction('bothModified', 'yours', false)).toBe('ours');
    expect(conflictAction('bothModified', 'theirs', false)).toBe('theirs');
    expect(conflictAction('bothAdded', 'yours', false)).toBe('ours');
  });

  it('swaps git sides while rebasing', () => {
    expect(conflictAction('bothModified', 'yours', true)).toBe('theirs');
    expect(conflictAction('bothModified', 'theirs', true)).toBe('ours');
  });

  it('keeps or removes files deleted or added on one side', () => {
    expect(conflictAction('deletedByThem', 'yours', false)).toBe('ours');
    expect(conflictAction('deletedByThem', 'theirs', false)).toBe('remove');
    expect(conflictAction('deletedByUs', 'yours', false)).toBe('remove');
    expect(conflictAction('deletedByUs', 'theirs', false)).toBe('theirs');
    expect(conflictAction('addedByUs', 'theirs', false)).toBe('remove');
    expect(conflictAction('addedByThem', 'theirs', false)).toBe('theirs');
    expect(conflictAction('bothDeleted', 'yours', false)).toBe('remove');
    expect(conflictAction('deletedByUs', 'yours', true)).toBe('theirs');
  });
});

describe('conflictLabel and canMerge', () => {
  it('describes the conflict from the user’s point of view', () => {
    expect(conflictLabel('deletedByThem', false)).toBe('Deleted by them');
    expect(conflictLabel('deletedByThem', true)).toBe('Deleted by you');
    expect(canMerge('bothModified')).toBe(true);
    expect(canMerge('deletedByUs')).toBe(false);
  });
});
