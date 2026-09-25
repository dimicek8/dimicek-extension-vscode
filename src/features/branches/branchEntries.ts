import type { LocalBranch, Ref, RemoteBranch } from '../../git/parsers/refs';
import type { OperationKind } from '../../git/repository';

export type BranchCommand =
  'newBranch' | 'checkoutRevision' | 'fetch' | 'abortMerge' | 'continueRebase' | 'abortRebase';

export type BranchRef = LocalBranch | RemoteBranch;

export type BranchEntry =
  | { kind: 'command'; command: BranchCommand; label: string; icon: string }
  | { kind: 'separator'; label: string }
  | {
      kind: 'branch';
      ref: BranchRef;
      label: string;
      description?: string;
      icon: string;
      favorite: boolean;
      current: boolean;
    };

export interface BranchEntriesInput {
  refs: readonly Ref[];
  recent: readonly string[];
  favorites: ReadonlySet<string>;
  operation?: OperationKind;
}

const MAX_RECENT = 5;

const OPERATION_COMMANDS: Partial<Record<OperationKind, BranchEntry[]>> = {
  merge: [{ kind: 'command', command: 'abortMerge', label: 'Abort Merge', icon: 'close' }],
  rebase: [
    {
      kind: 'command',
      command: 'continueRebase',
      label: 'Continue Rebase',
      icon: 'debug-continue',
    },
    { kind: 'command', command: 'abortRebase', label: 'Abort Rebase', icon: 'close' },
  ],
};

const COMMANDS: BranchEntry[] = [
  { kind: 'command', command: 'newBranch', label: 'New Branch…', icon: 'add' },
  { kind: 'command', command: 'checkoutRevision', label: 'Checkout Tag or Revision…', icon: 'tag' },
  { kind: 'command', command: 'fetch', label: 'Fetch', icon: 'sync' },
];

export function describeLocalBranch(branch: LocalBranch): string | undefined {
  const upstream = branch.upstream;
  if (!upstream) {
    return undefined;
  }
  if (upstream.gone) {
    return `${upstream.name} (gone)`;
  }
  const counts = [
    upstream.ahead ? `↑${upstream.ahead}` : '',
    upstream.behind ? `↓${upstream.behind}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return counts ? `${counts}  ${upstream.name}` : upstream.name;
}

function branchEntry(ref: BranchRef, favorites: ReadonlySet<string>): BranchEntry {
  const current = ref.type === 'branch' && ref.isHead;
  const favorite = favorites.has(ref.fullName);
  return {
    kind: 'branch',
    ref,
    label: ref.name,
    description: ref.type === 'branch' ? describeLocalBranch(ref) : undefined,
    icon: current
      ? 'check'
      : favorite
        ? 'star-full'
        : ref.type === 'branch'
          ? 'git-branch'
          : 'cloud',
    favorite,
    current,
  };
}

function sortBranches<T extends BranchRef>(
  refs: readonly T[],
  favorites: ReadonlySet<string>,
): T[] {
  return [...refs].sort((a, b) => {
    const favoriteOrder = Number(favorites.has(b.fullName)) - Number(favorites.has(a.fullName));
    return favoriteOrder || a.name.localeCompare(b.name);
  });
}

export function buildBranchEntries({
  refs,
  recent,
  favorites,
  operation,
}: BranchEntriesInput): BranchEntry[] {
  const locals = refs.filter((ref): ref is LocalBranch => ref.type === 'branch');
  const remotes = refs.filter((ref): ref is RemoteBranch => ref.type === 'remoteBranch');
  const recentBranches = recent
    .map((name) => locals.find((branch) => branch.name === name))
    .filter((branch): branch is LocalBranch => branch !== undefined && !branch.isHead)
    .slice(0, MAX_RECENT);

  const entries: BranchEntry[] = [
    ...((operation && OPERATION_COMMANDS[operation]) ?? []),
    ...COMMANDS,
  ];
  if (recentBranches.length > 0) {
    entries.push({ kind: 'separator', label: 'Recent' });
    entries.push(...recentBranches.map((branch) => branchEntry(branch, favorites)));
  }
  if (locals.length > 0) {
    entries.push({ kind: 'separator', label: 'Local' });
    entries.push(
      ...sortBranches(locals, favorites).map((branch) => branchEntry(branch, favorites)),
    );
  }
  if (remotes.length > 0) {
    entries.push({ kind: 'separator', label: 'Remote' });
    entries.push(
      ...sortBranches(remotes, favorites).map((branch) => branchEntry(branch, favorites)),
    );
  }
  return entries;
}
