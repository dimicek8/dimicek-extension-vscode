import { describe, expect, it } from 'vitest';
import {
  appendIgnorePatterns,
  ignorePattern,
  ignoreScopes,
} from '../../../src/features/commit/gitignore';

describe('ignorePattern', () => {
  it('anchors files and directories to the repository root', () => {
    expect(ignorePattern('build/out.js', 'file')).toBe('/build/out.js');
    expect(ignorePattern('build/out.js', 'directory')).toBe('/build/');
    expect(ignorePattern('build/out.js', 'extension')).toBe('*.js');
  });

  it('escapes wildcard characters and trailing spaces', () => {
    expect(ignorePattern('notes/[draft] *?.md', 'file')).toBe('/notes/\\[draft] \\*\\?.md');
    expect(ignorePattern('#tmp', 'file')).toBe('/#tmp');
    expect(ignorePattern('trailing ', 'file')).toBe('/trailing\\ ');
  });
});

describe('ignoreScopes', () => {
  it('offers only the scopes that make sense for a path', () => {
    expect(ignoreScopes('src/app.ts')).toEqual(['file', 'directory', 'extension']);
    expect(ignoreScopes('Makefile')).toEqual(['file']);
    expect(ignoreScopes('.env')).toEqual(['file']);
  });
});

describe('appendIgnorePatterns', () => {
  it('appends missing patterns on new lines', () => {
    expect(appendIgnorePatterns('', ['/a'])).toBe('/a\n');
    expect(appendIgnorePatterns('node_modules/', ['/a', '/b'])).toBe('node_modules/\n/a\n/b\n');
    expect(appendIgnorePatterns('dist/\n', ['/a'])).toBe('dist/\n/a\n');
  });

  it('does not duplicate existing patterns', () => {
    expect(appendIgnorePatterns('/a\r\n/b\r\n', ['/a'])).toBe('/a\r\n/b\r\n');
  });
});
