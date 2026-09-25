export interface PathItem {
  path: string;
}

export interface DirectoryNode<T extends PathItem> {
  name: string;
  path: string;
  directories: DirectoryNode<T>[];
  files: T[];
}

function createDirectory<T extends PathItem>(name: string, path: string): DirectoryNode<T> {
  return { name, path, directories: [], files: [] };
}

function compact<T extends PathItem>(directory: DirectoryNode<T>): DirectoryNode<T> {
  let current = directory;
  while (current.files.length === 0 && current.directories.length === 1) {
    const child = current.directories[0]!;
    current = { ...child, name: `${current.name}/${child.name}` };
  }
  return { ...current, directories: current.directories.map(compact) };
}

function sort<T extends PathItem>(directory: DirectoryNode<T>): void {
  directory.directories.sort((a, b) => a.name.localeCompare(b.name));
  directory.files.sort((a, b) => a.path.localeCompare(b.path));
  directory.directories.forEach(sort);
}

export function buildDirectoryTree<T extends PathItem>(items: readonly T[]): DirectoryNode<T> {
  const root = createDirectory<T>('', '');
  for (const item of items) {
    const segments = item.path.split('/');
    segments.pop();
    let directory = root;
    for (const segment of segments) {
      const path = directory.path ? `${directory.path}/${segment}` : segment;
      let child = directory.directories.find((candidate) => candidate.name === segment);
      if (!child) {
        child = createDirectory<T>(segment, path);
        directory.directories.push(child);
      }
      directory = child;
    }
    directory.files.push(item);
  }
  sort(root);
  return { ...root, directories: root.directories.map(compact) };
}

export function filesUnder<T extends PathItem>(directory: DirectoryNode<T>): T[] {
  return [...directory.files, ...directory.directories.flatMap(filesUnder)];
}
