import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { LogModel, type LogUpdate } from '../../src/features/log/logModel';
import type { LogToWebview } from '../../src/shared/protocol';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi, waitFor } from './helpers';

describe('Git Log', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  before(async () => {
    fixture = createHistoryRepo();
    api = await activateWithRepository(fixture.repo);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  it('loads commits of all branches into the webview', async () => {
    const reset = waitFor(
      api.log.view.onDidPost,
      (message: LogToWebview) => message.type === 'reset' && message.commits.length > 0,
    );
    const ready = waitFor(api.log.view.onDidBecomeReady);
    await vscode.commands.executeCommand('dimicek.log.show');
    await ready;
    await api.log.model.reload();
    const message = await reset;

    assert.ok(message.type === 'reset');
    const hashes = message.commits.map((commit) => commit.hash);
    assert.strictEqual(hashes.length, 8);
    assert.ok(hashes.includes(fixture.commits.remote));
    assert.ok(hashes.includes(fixture.commits.local));
    assert.strictEqual(
      message.commits.find((commit) => commit.isHead)?.hash,
      fixture.commits.local,
    );
    assert.strictEqual(message.hasMore, false);
  });

  it('loads further pages on demand', async () => {
    const output = vscode.window.createOutputChannel('Dimicek test', { log: true });
    const model = new LogModel(api.repoManager, output, 3);
    const updates: LogUpdate[] = [];
    model.onDidUpdate((update) => updates.push(update));
    try {
      await model.reload();
      assert.strictEqual(model.loadedCommits.length, 3);
      assert.strictEqual(model.hasMore, true);

      await Promise.all([model.loadMore(), model.loadMore()]);
      assert.strictEqual(model.loadedCommits.length, 6);

      await model.loadMore();
      assert.strictEqual(model.loadedCommits.length, 8);
      assert.strictEqual(model.hasMore, false);
      assert.deepStrictEqual(
        updates.map((update) => update.kind),
        ['reset', 'append', 'append'],
      );
      assert.strictEqual(new Set(model.loadedCommits.map((commit) => commit.hash)).size, 8);
    } finally {
      model.dispose();
      output.dispose();
    }
  });
});
