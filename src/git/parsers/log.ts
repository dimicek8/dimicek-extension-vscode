export const LOG_FORMAT = ['%H', '%P', '%an', '%ae', '%at', '%cn', '%ce', '%ct', '%D', '%B'].join(
  '%x1f',
);

const FIELD_SEPARATOR = '\x1f';
const FIELD_COUNT = 10;

export interface Person {
  name: string;
  email: string;
}

export interface Commit {
  hash: string;
  parents: string[];
  author: Person;
  authorDate: Date;
  committer: Person;
  commitDate: Date;
  subject: string;
  body: string;
  refs: string[];
  isHead: boolean;
  headRef?: string;
}

function parseDecorations(decorations: string): {
  refs: string[];
  isHead: boolean;
  headRef?: string;
} {
  const refs: string[] = [];
  let isHead = false;
  let headRef: string | undefined;
  for (const decoration of decorations.split(', ')) {
    if (decoration === '') {
      continue;
    }
    if (decoration === 'HEAD') {
      isHead = true;
    } else if (decoration.startsWith('HEAD -> ')) {
      isHead = true;
      headRef = decoration.slice('HEAD -> '.length);
      refs.push(headRef);
    } else if (decoration.startsWith('tag: ')) {
      refs.push(decoration.slice('tag: '.length));
    } else {
      refs.push(decoration);
    }
  }
  return headRef === undefined ? { refs, isHead } : { refs, isHead, headRef };
}

function splitFields(record: string): string[] {
  const fields: string[] = [];
  let start = 0;
  for (let i = 0; i < FIELD_COUNT - 1; i++) {
    const end = record.indexOf(FIELD_SEPARATOR, start);
    if (end === -1) {
      throw new Error(`Malformed log record: ${record.slice(0, 80)}`);
    }
    fields.push(record.slice(start, end));
    start = end + 1;
  }
  fields.push(record.slice(start));
  return fields;
}

function parseCommit(record: string): Commit {
  const [
    hash,
    parents,
    authorName,
    authorEmail,
    authorTime,
    committerName,
    committerEmail,
    commitTime,
    decorations,
    message,
  ] = splitFields(record) as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const text = message.replace(/\s+$/, '');
  const newline = text.indexOf('\n');
  return {
    hash,
    parents: parents === '' ? [] : parents.split(' '),
    author: { name: authorName, email: authorEmail },
    authorDate: new Date(Number(authorTime) * 1000),
    committer: { name: committerName, email: committerEmail },
    commitDate: new Date(Number(commitTime) * 1000),
    subject: newline === -1 ? text : text.slice(0, newline),
    body: newline === -1 ? '' : text.slice(newline + 1).trim(),
    ...parseDecorations(decorations),
  };
}

export function parseLog(output: string): Commit[] {
  return output
    .split('\0')
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record !== '')
    .map(parseCommit);
}

export interface LogOptions {
  maxCount?: number;
  skip?: number;
  all?: boolean;
  revisions?: string[];
  paths?: string[];
  author?: string;
  grep?: string;
  since?: Date;
  until?: Date;
  order?: 'topo' | 'date';
}

export function buildLogArgs(options: LogOptions = {}): string[] {
  const args = ['log', `--format=${LOG_FORMAT}`, '-z', '--decorate=full'];
  args.push(options.order === 'date' ? '--date-order' : '--topo-order');
  if (options.maxCount !== undefined) {
    args.push(`--max-count=${options.maxCount}`);
  }
  if (options.skip) {
    args.push(`--skip=${options.skip}`);
  }
  if (options.author) {
    args.push(`--author=${options.author}`);
  }
  if (options.grep) {
    args.push(`--grep=${options.grep}`);
  }
  if (options.author || options.grep) {
    args.push('--regexp-ignore-case');
  }
  if (options.since) {
    args.push(`--since=${options.since.toISOString()}`);
  }
  if (options.until) {
    args.push(`--until=${options.until.toISOString()}`);
  }
  if (options.all) {
    args.push('--exclude=refs/stash', '--all');
  }
  args.push('--end-of-options', ...(options.revisions ?? (options.all ? [] : ['HEAD'])));
  args.push('--', ...(options.paths ?? []));
  return args;
}
