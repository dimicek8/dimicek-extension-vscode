export const FILE_REVISIONS_FORMAT = ['%H', '%an', '%at', '%s'].join('%x1f');

export interface FileRevision {
  hash: string;
  author: string;
  date: Date;
  subject: string;
  path: string;
}

export function parseFileRevisions(output: string, currentPath: string): FileRevision[] {
  const revisions: FileRevision[] = [];
  let lastPath = currentPath;
  for (const raw of output.split('\0')) {
    const token = raw.replace(/^\n/, '');
    if (token === '') {
      continue;
    }
    if (token.includes('\x1f')) {
      const [hash = '', author = '', time = '0', subject = ''] = token.split('\x1f');
      revisions.push({
        hash,
        author,
        date: new Date(Number(time) * 1000),
        subject,
        path: lastPath,
      });
    } else if (revisions.length > 0) {
      revisions[revisions.length - 1]!.path = token;
      lastPath = token;
    }
  }
  return revisions;
}
