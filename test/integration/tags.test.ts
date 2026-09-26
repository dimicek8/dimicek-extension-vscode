import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi } from './helpers';

describe('Tags', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;
  let answer: string | undefined;

  before(async () => {
    fixture = createHistoryRepo();
    fixture.repo.git('tag', 'v0.1', fixture.commits.app);
    fixture.repo.git('tag', 'v0.2', fixture.commits.typo);
    api = await activateWithRepository(fixture.repo);
    api.tags.actions.choose = async () => answer;
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  const remoteTags = () => fixture.repo.git('ls-remote', '--tags', 'origin');

  it('pushes a tag from the Git Log context menu', async () => {
    assert.ok(await vscode.commands.executeCommand('dimicek.tags.pushOne', { tag: 'v0.1' }));
    assert.match(remoteTags(), /refs\/tags\/v0\.1/);
  });

  it('deletes a tag only locally or also on the remote', async () => {
    answer = 'Delete Locally';
    assert.ok(await api.tags.actions.delete('v0.2'));
    assert.strictEqual(fixture.repo.git('tag', '--list', 'v0.2'), '');

    answer = 'Delete Locally and on Remote';
    assert.ok(await api.tags.actions.delete('v0.1'));
    assert.strictEqual(fixture.repo.git('tag', '--list', 'v0.1'), '');
    assert.doesNotMatch(remoteTags(), /refs\/tags\/v0\.1/);
  });

  it('does nothing when deleting is cancelled', async () => {
    answer = undefined;
    assert.strictEqual(await api.tags.actions.delete('v1.0'), false);
    assert.strictEqual(fixture.repo.git('tag', '--list', 'v1.0'), 'v1.0');
  });
});
