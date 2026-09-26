import type { ConflictType } from '../../git/parsers/status';

export type ConflictSide = 'yours' | 'theirs';
export type ConflictAction = 'ours' | 'theirs' | 'remove';

const LABELS: Record<ConflictType, string> = {
  bothModified: 'Both modified',
  bothAdded: 'Both added',
  bothDeleted: 'Both deleted',
  addedByUs: 'Added by you',
  addedByThem: 'Added by them',
  deletedByUs: 'Deleted by you',
  deletedByThem: 'Deleted by them',
};

export function conflictLabel(conflict: ConflictType, rebasing: boolean): string {
  if (!rebasing) {
    return LABELS[conflict];
  }
  const swapped: Partial<Record<ConflictType, ConflictType>> = {
    addedByUs: 'addedByThem',
    addedByThem: 'addedByUs',
    deletedByUs: 'deletedByThem',
    deletedByThem: 'deletedByUs',
  };
  return LABELS[swapped[conflict] ?? conflict];
}

export function canMerge(conflict: ConflictType): boolean {
  return conflict === 'bothModified' || conflict === 'bothAdded';
}

export function conflictAction(
  conflict: ConflictType,
  side: ConflictSide,
  rebasing: boolean,
): ConflictAction {
  const gitSide: 'ours' | 'theirs' = (side === 'yours') !== rebasing ? 'ours' : 'theirs';
  switch (conflict) {
    case 'bothModified':
    case 'bothAdded':
      return gitSide;
    case 'bothDeleted':
      return 'remove';
    case 'addedByUs':
    case 'deletedByThem':
      return gitSide === 'ours' ? 'ours' : 'remove';
    case 'addedByThem':
    case 'deletedByUs':
      return gitSide === 'theirs' ? 'theirs' : 'remove';
  }
}
