import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { AUTO_FETCH_SETTING } from '../../src/features/fetch/autoFetcher';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi } from './helpers';

describe('Fetch', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  before(async () => {
    fixture = createHistoryRepo();
    api = await activateWithRepository(fixture.repo);
  });

  after(async () => {
    await vscode.workspace
      .getConfiguration()
      .update(AUTO_FETCH_SETTING, undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  function pushFromOtherClone(message: string): void {
    fixture.other.commit(message);
    fixture.other.git('push', '--quiet', 'origin', 'main');
  }

  it('fetches on demand and updates ahead/behind', async () => {
    pushFromOtherClone('Other change');
    assert.ok(await vscode.commands.executeCommand('dimicek.branches.fetch'));
    assert.strictEqual(api.commit.model.branch.behind, 2);
  });

  it('follows the automatic fetch setting', async () => {
    assert.strictEqual(api.fetch.autoFetcher.intervalMinutes, 0);
    await vscode.workspace
      .getConfiguration()
      .update(AUTO_FETCH_SETTING, 5, vscode.ConfigurationTarget.Global);
    assert.strictEqual(api.fetch.autoFetcher.intervalMinutes, 5);
    await vscode.workspace
      .getConfiguration()
      .update(AUTO_FETCH_SETTING, 0, vscode.ConfigurationTarget.Global);
    assert.strictEqual(api.fetch.autoFetcher.intervalMinutes, 0);
  });

  it('fetches all repositories in the background without failing on errors', async () => {
    pushFromOtherClone('Background change');
    fixture.repo.git('remote', 'add', 'broken', 'https://invalid.invalid/none.git');
    try {
      await Promise.all([api.fetch.autoFetcher.fetchAll(), api.fetch.autoFetcher.fetchAll()]);
    } finally {
      fixture.repo.git('remote', 'remove', 'broken');
    }
    assert.strictEqual(
      fixture.repo.git('log', '-1', '--format=%s', 'origin/main'),
      'Background change',
    );
  });
});
