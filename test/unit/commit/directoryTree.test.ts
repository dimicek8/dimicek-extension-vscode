import { describe, expect, it } from 'vitest';
import {
  buildDirectoryTree,
  type DirectoryNode,
  filesUnder,
} from '../../../src/features/commit/directoryTree';
import type { FileChange } from '../../../src/features/commit/fileChanges';

const change = (path: string): FileChange => ({ path, kind: 'modified' });

function shape(directory: DirectoryNode): unknown {
  return {
    [`${directory.name}@${directory.path}`]: [
      ...directory.directories.map(shape),
      ...directory.files.map((file) => file.path),
    ],
  };
}

describe('buildDirectoryTree', () => {
  it('nests files by directory, sorts entries and compacts single-child chains', () => {
    const tree = buildDirectoryTree([
      change('src/features/commit/tree.ts'),
      change('src/features/commit/model.ts'),
      change('README.md'),
      change('src/extension.ts'),
      change('docs/guide/intro/start.md'),
      change('.github/workflows/ci.yml'),
    ]);

    expect(shape(tree)).toEqual({
      '@': [
        { '.github/workflows@.github/workflows': ['.github/workflows/ci.yml'] },
        { 'docs/guide/intro@docs/guide/intro': ['docs/guide/intro/start.md'] },
        {
          'src@src': [
            {
              'features/commit@src/features/commit': [
                'src/features/commit/model.ts',
                'src/features/commit/tree.ts',
              ],
            },
            'src/extension.ts',
          ],
        },
        'README.md',
      ],
    });
  });

  it('lists all files below a directory', () => {
    const tree = buildDirectoryTree([change('a/b/c.txt'), change('a/d.txt'), change('e.txt')]);
    expect(
      filesUnder(tree)
        .map((file) => file.path)
        .sort(),
    ).toEqual(['a/b/c.txt', 'a/d.txt', 'e.txt']);
  });
});
