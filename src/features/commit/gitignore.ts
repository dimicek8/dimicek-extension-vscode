export type IgnoreScope = 'file' | 'directory' | 'extension';

function escape(text: string): string {
  return text.replace(/[\\*?[]/g, (character) => `\\${character}`).replace(/ $/, '\\ ');
}

function directoryOf(path: string): string | undefined {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? undefined : path.slice(0, slash);
}

function extensionOf(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : undefined;
}

export function ignoreScopes(path: string): IgnoreScope[] {
  const scopes: IgnoreScope[] = ['file'];
  if (directoryOf(path) !== undefined) {
    scopes.push('directory');
  }
  if (extensionOf(path) !== undefined) {
    scopes.push('extension');
  }
  return scopes;
}

export function ignoreDirectoryPattern(directory: string): string {
  return `/${escape(directory)}/`;
}

export function ignorePattern(path: string, scope: IgnoreScope): string {
  switch (scope) {
    case 'file':
      return `/${escape(path)}`;
    case 'directory':
      return ignoreDirectoryPattern(directoryOf(path) ?? path);
    case 'extension':
      return `*${escape(extensionOf(path) ?? '')}`;
  }
}

export function appendIgnorePatterns(existing: string, patterns: readonly string[]): string {
  const lines = existing.split(/\r?\n/);
  const missing = patterns.filter((pattern) => !lines.includes(pattern));
  if (missing.length === 0) {
    return existing;
  }
  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
  return `${existing}${separator}${missing.join('\n')}\n`;
}
