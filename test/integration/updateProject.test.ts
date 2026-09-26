import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { UPDATE_METHOD_SETTING } from '../../src/features/update/updateProject';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi } from './helpers';

describe('Update Project', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  beforeEach(async () => {
    fixture = createHistoryRepo();
    api = await activateWithRepository(fixture.repo);
    await api.commit.model.refresh();
  });

  afterEach(async () => {
    await vscode.workspace
      .getConfiguration()
      .update(UPDATE_METHOD_SETTING, undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  const git = (...args: string[]) => fixture.repo.git(...args);
  const read = (path: string) => readFileSync(join(fixture.repo.root, path), 'utf8');

  it('merges the upstream branch and keeps local changes', async () => {
    fixture.repo.write('README.md', 'local edit\n');
    fixture.repo.write('scratch.txt', 'untracked\n');

    assert.ok(await api.update.update.run('merge'));

    assert.strictEqual(git('log', '-1', '--format=%P').split(' ').length, 2);
    assert.strictEqual(read('REMOTE.md'), 'remote\n');
    assert.strictEqual(read('README.md'), 'local edit\n');
    assert.strictEqual(read('scratch.txt'), 'untracked\n');
    assert.strictEqual(git('stash', 'list'), '');
    assert.deepStrictEqual(
      { ahead: api.commit.model.branch.ahead, behind: api.commit.model.branch.behind },
      { ahead: 2, behind: 0 },
    );
  });

  it('rebases onto the upstream branch using the configured method', async () => {
    await vscode.workspace
      .getConfiguration()
      .update(UPDATE_METHOD_SETTING, 'rebase', vscode.ConfigurationTarget.Global);
    fixture.repo.write('README.md', 'local edit\n');

    assert.ok(await vscode.commands.executeCommand('dimicek.update.project'));

    assert.strictEqual(git('rev-parse', 'HEAD~1'), fixture.commits.remote);
    assert.strictEqual(git('log', '-1', '--format=%s'), 'Local change');
    assert.strictEqual(read('README.md'), 'local edit\n');
    assert.deepStrictEqual(
      { ahead: api.commit.model.branch.ahead, behind: api.commit.model.branch.behind },
      { ahead: 1, behind: 0 },
    );
  });

  it('stops on conflicts and keeps local changes in the stash', async () => {
    fixture.repo.commit('Conflicting local change', { 'REMOTE.md': 'mine\n' });
    fixture.repo.write('README.md', 'local edit\n');
    await api.commit.model.refresh();

    assert.ok(await api.update.update.run('merge'));

    assert.deepStrictEqual(await api.commit.model.repository!.getOperationState(), {
      kind: 'merge',
    });
    assert.match(git('stash', 'list'), /Dimicek: update of main/);
    assert.ok(api.commit.model.changes.some((change) => change.kind === 'conflicted'));
  });

  it('refuses to update a branch without upstream', async () => {
    git('switch', '--quiet', '--create', 'local-only');
    await api.commit.model.refresh();
    assert.strictEqual(await api.update.update.run('merge'), false);
  });
});
