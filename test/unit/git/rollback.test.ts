import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rollbackPlan, toFileChanges } from '../../../src/features/commit/fileChanges';
import { findGit, Git } from '../../../src/git/gitExec';
import { Repository } from '../../../src/git/repository';
import {
  addWorkingTreeChanges,
  createHistoryRepo,
  type HistoryRepo,
} from '../../fixtures/testRepo';

describe('Repository rollback', () => {
  let fixture: HistoryRepo;
  let repository: Repository;

  beforeEach(async () => {
    fixture = createHistoryRepo();
    addWorkingTreeChanges(fixture.repo);
    repository = new Repository(fixture.repo.root, new Git(await findGit([])));
  });

  afterEach(() => fixture?.repo.dispose());

  const file = (path: string) => join(fixture.repo.root, path);
  const changes = async () => toFileChanges(await repository.getStatus());

  it('restores modified, deleted and renamed files and keeps added files as unversioned', async () => {
    await repository.rollback(rollbackPlan(await changes()));

    expect(readFileSync(file('README.md'), 'utf8')).toBe('# Test project\n');
    expect(readFileSync(file('src/logout.ts'), 'utf8')).toBe('export const logout = true;\n');
    expect(existsSync(file('src/login.ts'))).toBe(true);
    expect(existsSync(file('src/auth.ts'))).toBe(false);
    expect(await changes()).toEqual([
      { path: 'notes/todo ž.txt', kind: 'unversioned' },
      { path: 'src/new file.ts', kind: 'unversioned' },
    ]);
  });

  it('rolls back only the given files', async () => {
    await repository.rollback(rollbackPlan([{ path: 'README.md', kind: 'modified' }]));
    expect((await changes()).map((change) => change.path)).not.toContain('README.md');
    expect((await changes()).map((change) => change.path)).toContain('src/auth.ts');
  });

  it('treats paths literally instead of as glob patterns', async () => {
    fixture.repo.commit('Add tricky names', { 'star*.txt': 'a\n', 'starX.txt': 'b\n' });
    fixture.repo.write('star*.txt', 'changed a\n');
    fixture.repo.write('starX.txt', 'changed b\n');

    await repository.rollback(rollbackPlan([{ path: 'star*.txt', kind: 'modified' }]));

    expect(readFileSync(file('star*.txt'), 'utf8')).toBe('a\n');
    expect(readFileSync(file('starX.txt'), 'utf8')).toBe('changed b\n');
  });
});
