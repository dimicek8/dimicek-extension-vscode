export const UNCOMMITTED_HASH = '0000000000000000000000000000000000000000';

export interface BlameCommit {
  hash: string;
  author: string;
  authorEmail: string;
  authorTime: Date;
  summary: string;
  filename: string;
  uncommitted: boolean;
}

export interface BlameLine {
  line: number;
  commit: BlameCommit;
}

const HEADER = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/;

export function parseBlame(output: string): BlameLine[] {
  const commits = new Map<string, BlameCommit>();
  const lines: BlameLine[] = [];
  let current: BlameCommit | undefined;
  let finalLine = 0;

  for (const line of output.split('\n')) {
    if (line.startsWith('\t')) {
      if (current) {
        lines.push({ line: finalLine - 1, commit: current });
      }
      continue;
    }
    const header = HEADER.exec(line);
    if (header) {
      const hash = header[1]!;
      finalLine = Number(header[2]);
      current = commits.get(hash);
      if (!current) {
        current = {
          hash,
          author: '',
          authorEmail: '',
          authorTime: new Date(0),
          summary: '',
          filename: '',
          uncommitted: hash === UNCOMMITTED_HASH,
        };
        commits.set(hash, current);
      }
      continue;
    }
    if (!current) {
      continue;
    }
    const space = line.indexOf(' ');
    const key = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? '' : line.slice(space + 1);
    switch (key) {
      case 'author':
        current.author = value;
        break;
      case 'author-mail':
        current.authorEmail = value.replace(/^<|>$/g, '');
        break;
      case 'author-time':
        current.authorTime = new Date(Number(value) * 1000);
        break;
      case 'summary':
        current.summary = value;
        break;
      case 'filename':
        current.filename = value;
        break;
    }
  }
  return lines;
}
