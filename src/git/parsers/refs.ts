export const REFS_FORMAT = [
  '%(refname)',
  '%(objectname)',
  '%(*objectname)',
  '%(HEAD)',
  '%(upstream)',
  '%(upstream:track,nobracket)',
  '%(creatordate:unix)',
  '%(symref)',
].join('%00');

export interface UpstreamInfo {
  name: string;
  remote: string;
  branch: string;
  ahead: number;
  behind: number;
  gone: boolean;
}

interface RefBase {
  fullName: string;
  name: string;
  commit: string;
  date: Date;
}

export interface LocalBranch extends RefBase {
  type: 'branch';
  isHead: boolean;
  upstream?: UpstreamInfo;
}

export interface RemoteBranch extends RefBase {
  type: 'remoteBranch';
  remote: string;
  branch: string;
}

export interface Tag extends RefBase {
  type: 'tag';
  annotated: boolean;
}

export type Ref = LocalBranch | RemoteBranch | Tag;

const HEADS = 'refs/heads/';
const REMOTES = 'refs/remotes/';
const TAGS = 'refs/tags/';

export function splitRemoteBranch(
  name: string,
  remotes: readonly string[],
): { remote: string; branch: string } {
  const remote = [...remotes]
    .sort((a, b) => b.length - a.length)
    .find((candidate) => name.startsWith(`${candidate}/`));
  if (remote) {
    return { remote, branch: name.slice(remote.length + 1) };
  }
  const slash = name.indexOf('/');
  return slash === -1
    ? { remote: name, branch: '' }
    : { remote: name.slice(0, slash), branch: name.slice(slash + 1) };
}

function parseTrack(track: string): { ahead: number; behind: number; gone: boolean } {
  const result = { ahead: 0, behind: 0, gone: false };
  for (const part of track.split(', ')) {
    const [word, count] = part.split(' ');
    if (word === 'ahead') {
      result.ahead = Number(count);
    } else if (word === 'behind') {
      result.behind = Number(count);
    } else if (word === 'gone') {
      result.gone = true;
    }
  }
  return result;
}

function parseUpstream(
  fullName: string,
  track: string,
  remotes: readonly string[],
): UpstreamInfo | undefined {
  if (fullName.startsWith(REMOTES)) {
    const name = fullName.slice(REMOTES.length);
    return { name, ...splitRemoteBranch(name, remotes), ...parseTrack(track) };
  }
  if (fullName.startsWith(HEADS)) {
    const name = fullName.slice(HEADS.length);
    return { name, remote: '.', branch: name, ...parseTrack(track) };
  }
  return undefined;
}

export function parseRefs(output: string, remotes: readonly string[] = []): Ref[] {
  const refs: Ref[] = [];
  for (const line of output.split('\n')) {
    if (line === '') {
      continue;
    }
    const [
      fullName = '',
      objectName = '',
      peeled = '',
      head,
      upstream = '',
      track = '',
      date,
      symref,
    ] = line.split('\0');
    if (symref) {
      continue;
    }
    const base = {
      fullName,
      commit: peeled || objectName,
      date: new Date(Number(date) * 1000),
    };

    if (fullName.startsWith(HEADS)) {
      refs.push({
        ...base,
        type: 'branch',
        name: fullName.slice(HEADS.length),
        isHead: head === '*',
        upstream: parseUpstream(upstream, track, remotes),
      });
    } else if (fullName.startsWith(REMOTES)) {
      const name = fullName.slice(REMOTES.length);
      refs.push({ ...base, type: 'remoteBranch', name, ...splitRemoteBranch(name, remotes) });
    } else if (fullName.startsWith(TAGS)) {
      refs.push({
        ...base,
        type: 'tag',
        name: fullName.slice(TAGS.length),
        annotated: peeled !== '',
      });
    }
  }
  return refs;
}
