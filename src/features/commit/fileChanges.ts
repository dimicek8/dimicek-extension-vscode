import type { GitStatus, StatusEntry } from '../../git/parsers/status';

export type ChangeKind =
  'modified' | 'added' | 'deleted' | 'renamed' | 'conflicted' | 'unversioned';

export interface FileChange {
  path: string;
  originalPath?: string;
  kind: ChangeKind;
}

function toFileChange(entry: StatusEntry): FileChange | undefined {
  switch (entry.kind) {
    case 'ignored':
      return undefined;
    case 'untracked':
      return { path: entry.path, kind: 'unversioned' };
    case 'conflicted':
      return { path: entry.path, kind: 'conflicted' };
    case 'changed': {
      const { index, worktree, path, originalPath } = entry;
      if (index === 'added' && worktree === 'deleted') {
        return undefined;
      }
      if (index === 'deleted' || worktree === 'deleted') {
        return { path, kind: 'deleted' };
      }
      if (index === 'renamed' && originalPath !== undefined) {
        return { path, originalPath, kind: 'renamed' };
      }
      if (index === 'added' || index === 'copied') {
        return { path, kind: 'added' };
      }
      return { path, kind: 'modified' };
    }
  }
}

export function toFileChanges(status: GitStatus): FileChange[] {
  return status.entries
    .map(toFileChange)
    .filter((change): change is FileChange => change !== undefined)
    .sort((a, b) => a.path.localeCompare(b.path));
}

export type ChangeGroupId = 'conflicts' | 'changes' | 'unversioned';

export interface ChangeGroup {
  id: ChangeGroupId;
  label: string;
  changes: FileChange[];
}

export function groupChanges(changes: readonly FileChange[]): ChangeGroup[] {
  const conflicts = changes.filter((change) => change.kind === 'conflicted');
  const unversioned = changes.filter((change) => change.kind === 'unversioned');
  const tracked = changes.filter(
    (change) => change.kind !== 'conflicted' && change.kind !== 'unversioned',
  );
  const groups: ChangeGroup[] = [];
  if (conflicts.length > 0) {
    groups.push({ id: 'conflicts', label: 'Merge Conflicts', changes: conflicts });
  }
  groups.push({ id: 'changes', label: 'Changes', changes: tracked });
  if (unversioned.length > 0) {
    groups.push({ id: 'unversioned', label: 'Unversioned Files', changes: unversioned });
  }
  return groups;
}

export function commitPaths(changes: readonly FileChange[]): {
  paths: string[];
  addPaths: string[];
} {
  return {
    paths: changes.flatMap((change) =>
      change.kind === 'renamed' && change.originalPath !== undefined
        ? [change.originalPath, change.path]
        : [change.path],
    ),
    addPaths: changes
      .filter((change) => change.kind === 'unversioned')
      .map((change) => change.path),
  };
}
