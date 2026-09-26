import * as assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { ChangesNode } from '../../src/features/commit/changesTree';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi } from './helpers';

describe('Conflict resolution', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  beforeEach(async () => {
    fixture = createHistoryRepo();
    fixture.repo.git('switch', '--quiet', '--create', 'theirs', fixture.commits.merge);
    fixture.repo.commit('Their changes', { 'README.md': 'theirs\n', 'src/app.ts': 'their app\n' });
    fixture.repo.git('rm', '--quiet', 'src/logout.ts');
    fixture.repo.commit('Their deletion');
    fixture.repo.git('switch', '--quiet', 'main');
    fixture.repo.commit('Our changes', {
      'README.md': 'ours\n',
      'src/app.ts': 'our app\n',
      'src/logout.ts': 'our logout\n',
    });
    api = await activateWithRepository(fixture.repo);
  });

  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  const read = (path: string) => readFileSync(join(fixture.repo.root, path), 'utf8');
  const conflicts = async () =>
    (await api.conflicts.resolver.conflicts()).map((file) => `${file.conflict}:${file.path}`);

  async function mergeTheirs(): Promise<void> {
    assert.throws(() => fixture.repo.git('merge', 'theirs'));
    await api.commit.model.refresh();
  }

  it('lists conflicts with their kind', async () => {
    await mergeTheirs();
    assert.deepStrictEqual(await conflicts(), [
      'bothModified:README.md',
      'bothModified:src/app.ts',
      'deletedByThem:src/logout.ts',
    ]);
  });

  it('accepts yours or theirs for single files', async () => {
    await mergeTheirs();
    assert.ok(await api.conflicts.resolver.accept(['README.md'], 'yours'));
    assert.ok(await api.conflicts.resolver.accept(['src/app.ts'], 'theirs'));
    assert.strictEqual(read('README.md'), 'ours\n');
    assert.strictEqual(read('src/app.ts'), 'their app\n');
    assert.deepStrictEqual(await conflicts(), ['deletedByThem:src/logout.ts']);
  });

  it('removes a file deleted by them when accepting theirs', async () => {
    await mergeTheirs();
    assert.ok(await api.conflicts.resolver.accept(['src/logout.ts'], 'theirs'));
    assert.ok(!existsSync(join(fixture.repo.root, 'src', 'logout.ts')));
    assert.ok(!(await conflicts()).includes('deletedByThem:src/logout.ts'));
  });

  it('accepts a side from the Changes view context menu', async () => {
    await mergeTheirs();
    const [group] = api.commit.tree.getChildren();
    assert.ok(group?.type === 'group' && group.group.id === 'conflicts');
    await vscode.commands.executeCommand('dimicek.conflicts.acceptYours', group as ChangesNode);
    assert.deepStrictEqual(await conflicts(), []);
    assert.strictEqual(read('src/logout.ts'), 'our logout\n');
  });

  it('treats your commit as yours while rebasing', async () => {
    fixture.repo.git('switch', '--quiet', 'theirs');
    assert.throws(() => fixture.repo.git('rebase', 'main'));
    await api.commit.model.refresh();

    assert.ok(await api.conflicts.resolver.accept(['README.md'], 'yours'));
    assert.strictEqual(read('README.md'), 'theirs\n');
  });
});
