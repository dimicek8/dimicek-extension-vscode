import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi } from './helpers';

describe('Branch status bar', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  before(async () => {
    fixture = createHistoryRepo();
    api = await activateWithRepository(fixture.repo);
    await api.branches.statusBar.update();
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  it('shows the current branch with ahead and behind counts', () => {
    assert.strictEqual(api.branches.statusBar.text, '$(git-branch) main ↑1 ↓1');
  });

  it('shows a merge in progress', async () => {
    fixture.repo.git('switch', '--quiet', '--create', 'conflict', fixture.commits.merge);
    fixture.repo.commit('Change readme on branch', { 'README.md': 'branch\n' });
    fixture.repo.git('switch', '--quiet', 'main');
    fixture.repo.commit('Change readme on main', { 'README.md': 'main\n' });
    assert.throws(() => fixture.repo.git('merge', 'conflict'));

    await api.commit.model.refresh();
    await api.branches.statusBar.update();
    assert.strictEqual(api.branches.statusBar.text, '$(git-branch) main (Merging)');
  });
});
