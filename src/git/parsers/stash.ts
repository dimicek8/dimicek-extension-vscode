export const STASH_FORMAT = ['%gd', '%H', '%P', '%at', '%gs'].join('%x1f');

export interface Stash {
  ref: string;
  index: number;
  hash: string;
  parents: string[];
  date: Date;
  branch?: string;
  message: string;
  hasUntracked: boolean;
}

const SUBJECT = /^(?:WIP on|On) ([^:]+): (.*)$/;

export function parseStashes(output: string): Stash[] {
  return output
    .split('\0')
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const [ref = '', hash = '', parents = '', time = '0', subject = ''] = record
        .replace(/^\n/, '')
        .split('\x1f');
      const match = SUBJECT.exec(subject);
      const parentList = parents.split(' ').filter(Boolean);
      return {
        ref,
        index: Number(/\{(\d+)\}/.exec(ref)?.[1] ?? 0),
        hash,
        parents: parentList,
        date: new Date(Number(time) * 1000),
        branch: match?.[1],
        message: match?.[2] ?? subject,
        hasUntracked: parentList.length > 2,
      };
    });
}
