import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { LogModel, type LogUpdate } from '../../src/features/log/logModel';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi, waitFor } from './helpers';

describe('Git Log refresh', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  before(async () => {
    fixture = createHistoryRepo();
    api = await activateWithRepository(fixture.repo);
    await api.log.model.setFilters({});
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  it('ignores working tree edits and reloads when history changes', async () => {
    fixture.repo.write('README.md', 'just an edit\n');
    assert.strictEqual(await api.log.model.refresh(), false);

    const hash = fixture.repo.commit('New work');
    assert.strictEqual(await api.log.model.refresh(), true);
    assert.strictEqual(api.log.model.loadedCommits[0]!.hash, hash);
  });

  it('refreshes automatically after a commit and keeps the position', async () => {
    const update = waitFor(
      api.log.model.onDidUpdate,
      (value: LogUpdate) => value.kind === 'reset' && value.commits[0]?.subject === 'Automatic',
      15_000,
    );
    fixture.repo.commit('Automatic');
    const reset = await update;
    assert.ok(reset.kind === 'reset' && reset.preserve);
  });

  it('reloads as many commits as were already loaded', async () => {
    const output = vscode.window.createOutputChannel('Dimicek refresh test', { log: true });
    const model = new LogModel(api.repoManager, output, 3);
    try {
      await model.reload();
      await model.loadMore();
      assert.strictEqual(model.loadedCommits.length, 6);

      fixture.repo.commit('One more');
      assert.strictEqual(await model.refresh(), true);
      assert.strictEqual(model.loadedCommits.length, 6);
      assert.strictEqual(model.loadedCommits[0]!.subject, 'One more');
      assert.strictEqual(model.hasMore, true);
    } finally {
      model.dispose();
      output.dispose();
    }
  });

  it('jumps to the top when filters change', async () => {
    const update = waitFor(api.log.model.onDidUpdate, (value: LogUpdate) => value.kind === 'reset');
    await api.log.model.setFilters({ author: 'Test' });
    const reset = await update;
    assert.ok(reset.kind === 'reset' && !reset.preserve);
    await api.log.model.setFilters({});
  });
});
