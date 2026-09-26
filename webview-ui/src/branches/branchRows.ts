import { buildDirectoryTree, type DirectoryNode } from '../../../src/shared/directoryTree';
import type { BranchesViewBranch, BranchesViewState } from '../../../src/shared/protocol';

export type BranchRow =
  | { type: 'section'; key: string; label: string; depth: number; collapsed: boolean }
  | { type: 'folder'; key: string; label: string; depth: number; collapsed: boolean }
  | { type: 'branch'; key: string; label: string; depth: number; branch: BranchesViewBranch };

interface Item {
  path: string;
  branch: BranchesViewBranch;
}

function matches(branch: BranchesViewBranch, filter: string): boolean {
  return filter === '' || branch.name.toLowerCase().includes(filter);
}

function sortBranches(items: readonly Item[]): Item[] {
  return [...items].sort(
    (a, b) =>
      Number(b.branch.current) - Number(a.branch.current) ||
      Number(b.branch.favorite) - Number(a.branch.favorite) ||
      a.path.localeCompare(b.path),
  );
}

function treeRows(
  directory: DirectoryNode<Item>,
  prefix: string,
  depth: number,
  collapsed: ReadonlySet<string>,
  searching: boolean,
): BranchRow[] {
  const rows: BranchRow[] = [];
  for (const child of directory.directories) {
    const key = `${prefix}/${child.path}`;
    const isCollapsed = !searching && collapsed.has(key);
    rows.push({ type: 'folder', key, label: child.name, depth, collapsed: isCollapsed });
    if (!isCollapsed) {
      rows.push(...treeRows(child, prefix, depth + 1, collapsed, searching));
    }
  }
  for (const item of sortBranches(directory.files)) {
    rows.push({
      type: 'branch',
      key: `${prefix}:${item.branch.fullName}`,
      label: item.path.slice(item.path.lastIndexOf('/') + 1),
      depth,
      branch: item.branch,
    });
  }
  return rows;
}

function section(
  key: string,
  label: string,
  items: Item[],
  collapsed: ReadonlySet<string>,
  searching: boolean,
  depth = 0,
  flat = false,
): BranchRow[] {
  if (items.length === 0) {
    return [];
  }
  const isCollapsed = !searching && collapsed.has(key);
  const header: BranchRow = { type: 'section', key, label, depth, collapsed: isCollapsed };
  if (isCollapsed) {
    return [header];
  }
  if (flat) {
    return [
      header,
      ...items.map((item): BranchRow => ({
        type: 'branch',
        key: `${key}:${item.branch.fullName}`,
        label: item.path,
        depth: depth + 1,
        branch: item.branch,
      })),
    ];
  }
  return [header, ...treeRows(buildDirectoryTree(items), key, depth + 1, collapsed, searching)];
}

export function buildBranchRows(
  state: BranchesViewState,
  filterText: string,
  collapsed: ReadonlySet<string>,
): BranchRow[] {
  const filter = filterText.trim().toLowerCase();
  const searching = filter !== '';
  const visible = state.branches.filter((branch) => matches(branch, filter));
  const byName = new Map(visible.map((branch) => [branch.fullName, branch]));

  const recent = state.recent.flatMap((fullName) => {
    const branch = byName.get(fullName);
    return branch ? [{ path: branch.name, branch }] : [];
  });
  const locals = visible
    .filter((branch) => branch.kind === 'local')
    .map((branch) => ({ path: branch.name, branch }));
  const remotes = new Map<string, Item[]>();
  for (const branch of visible.filter((candidate) => candidate.kind === 'remote')) {
    const list = remotes.get(branch.remote ?? '') ?? [];
    list.push({ path: branch.shortName, branch });
    remotes.set(branch.remote ?? '', list);
  }

  const rows: BranchRow[] = [
    ...section('recent', 'Recent', recent, collapsed, searching, 0, true),
    ...section('local', 'Local', locals, collapsed, searching),
  ];
  if (remotes.size > 0) {
    const remoteCollapsed = !searching && collapsed.has('remote');
    rows.push({
      type: 'section',
      key: 'remote',
      label: 'Remote',
      depth: 0,
      collapsed: remoteCollapsed,
    });
    if (!remoteCollapsed) {
      for (const [remote, items] of [...remotes].sort(([a], [b]) => a.localeCompare(b))) {
        rows.push(...section(`remote/${remote}`, remote, items, collapsed, searching, 1));
      }
    }
  }
  return rows;
}
