import type { FileChange } from './fileChanges';

export interface DirectoryNode {
  name: string;
  path: string;
  directories: DirectoryNode[];
  files: FileChange[];
}

function createDirectory(name: string, path: string): DirectoryNode {
  return { name, path, directories: [], files: [] };
}

function compact(directory: DirectoryNode): DirectoryNode {
  let current = directory;
  while (current.files.length === 0 && current.directories.length === 1) {
    const child = current.directories[0]!;
    current = { ...child, name: `${current.name}/${child.name}` };
  }
  return {
    ...current,
    directories: current.directories.map(compact),
  };
}

function sort(directory: DirectoryNode): void {
  directory.directories.sort((a, b) => a.name.localeCompare(b.name));
  directory.files.sort((a, b) => a.path.localeCompare(b.path));
  directory.directories.forEach(sort);
}

export function buildDirectoryTree(changes: readonly FileChange[]): DirectoryNode {
  const root = createDirectory('', '');
  for (const change of changes) {
    const segments = change.path.split('/');
    segments.pop();
    let directory = root;
    for (const segment of segments) {
      const path = directory.path ? `${directory.path}/${segment}` : segment;
      let child = directory.directories.find((candidate) => candidate.name === segment);
      if (!child) {
        child = createDirectory(segment, path);
        directory.directories.push(child);
      }
      directory = child;
    }
    directory.files.push(change);
  }
  sort(root);
  return { ...root, directories: root.directories.map(compact) };
}

export function filesUnder(directory: DirectoryNode): FileChange[] {
  return [...directory.files, ...directory.directories.flatMap(filesUnder)];
}
