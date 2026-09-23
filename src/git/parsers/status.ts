export type ChangeType =
  | 'unmodified'
  | 'modified'
  | 'typeChanged'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'unmerged';

export type ConflictType =
  | 'bothDeleted'
  | 'addedByUs'
  | 'deletedByThem'
  | 'addedByThem'
  | 'deletedByUs'
  | 'bothAdded'
  | 'bothModified';

export type StatusEntry =
  | {
      kind: 'changed';
      path: string;
      originalPath?: string;
      index: ChangeType;
      worktree: ChangeType;
    }
  | { kind: 'conflicted'; path: string; conflict: ConflictType }
  | { kind: 'untracked'; path: string }
  | { kind: 'ignored'; path: string };

export interface BranchStatus {
  commit?: string;
  head?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
}

export interface GitStatus {
  branch: BranchStatus;
  entries: StatusEntry[];
  stashCount: number;
}

const CHANGE_TYPES: Record<string, ChangeType> = {
  '.': 'unmodified',
  M: 'modified',
  T: 'typeChanged',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  U: 'unmerged',
};

const CONFLICT_TYPES: Record<string, ConflictType> = {
  DD: 'bothDeleted',
  AU: 'addedByUs',
  UD: 'deletedByThem',
  UA: 'addedByThem',
  DU: 'deletedByUs',
  AA: 'bothAdded',
  UU: 'bothModified',
};

function changeType(code: string | undefined): ChangeType {
  const type = code === undefined ? undefined : CHANGE_TYPES[code];
  if (!type) {
    throw new Error(`Unknown status code "${code}"`);
  }
  return type;
}

function fieldsAndPath(record: string, fieldCount: number): { fields: string[]; path: string } {
  const fields: string[] = [];
  let start = 0;
  for (let i = 0; i < fieldCount; i++) {
    const end = record.indexOf(' ', start);
    if (end === -1) {
      throw new Error(`Malformed status record: ${record}`);
    }
    fields.push(record.slice(start, end));
    start = end + 1;
  }
  return { fields, path: record.slice(start) };
}

function applyHeader(status: GitStatus, header: string): void {
  const space = header.indexOf(' ');
  const key = header.slice(0, space);
  const value = header.slice(space + 1);
  const { branch } = status;
  switch (key) {
    case 'branch.oid':
      branch.commit = value === '(initial)' ? undefined : value;
      break;
    case 'branch.head':
      branch.head = value === '(detached)' ? undefined : value;
      break;
    case 'branch.upstream':
      branch.upstream = value;
      break;
    case 'branch.ab': {
      const match = /^\+(\d+) -(\d+)$/.exec(value);
      if (match) {
        branch.ahead = Number(match[1]);
        branch.behind = Number(match[2]);
      }
      break;
    }
    case 'stash':
      status.stashCount = Number(value);
      break;
  }
}

export function parseStatus(output: string): GitStatus {
  const status: GitStatus = { branch: {}, entries: [], stashCount: 0 };
  const records = output.split('\0');

  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;
    if (record === '') {
      continue;
    }
    const type = record[0];
    const body = record.slice(2);

    switch (type) {
      case '#':
        applyHeader(status, body);
        break;
      case '1': {
        const { fields, path } = fieldsAndPath(body, 7);
        const xy = fields[0]!;
        status.entries.push({
          kind: 'changed',
          path,
          index: changeType(xy[0]),
          worktree: changeType(xy[1]),
        });
        break;
      }
      case '2': {
        const { fields, path } = fieldsAndPath(body, 8);
        const xy = fields[0]!;
        const originalPath = records[++i];
        status.entries.push({
          kind: 'changed',
          path,
          originalPath,
          index: changeType(xy[0]),
          worktree: changeType(xy[1]),
        });
        break;
      }
      case 'u': {
        const { fields, path } = fieldsAndPath(body, 9);
        const conflict = CONFLICT_TYPES[fields[0]!];
        if (!conflict) {
          throw new Error(`Unknown conflict code "${fields[0]}"`);
        }
        status.entries.push({ kind: 'conflicted', path, conflict });
        break;
      }
      case '?':
        status.entries.push({ kind: 'untracked', path: body });
        break;
      case '!':
        status.entries.push({ kind: 'ignored', path: body });
        break;
      default:
        throw new Error(`Unknown status record: ${record}`);
    }
  }

  return status;
}
