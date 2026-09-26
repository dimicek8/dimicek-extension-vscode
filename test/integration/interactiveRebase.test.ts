import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi, waitFor } from './helpers';

describe('Interactive rebase dialog', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;
  let hashes: string[];

  beforeEach(async () => {
    fixture = createHistoryRepo();
    fixture.repo.git('switch', '--quiet', '--create', 'work');
    hashes = [
      fixture.repo.commit('One', { 'one.txt': '1\n' }),
      fixture.repo.commit('Two', { 'two.txt': '2\n' }),
      fixture.repo.commit('Three', { 'three.txt': '3\n' }),
    ];
    api = await activateWithRepository(fixture.repo);
    await api.commit.model.refresh();
  });

  afterEach(async () => {
    api.rebase.dialog.close();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  const subjects = () =>
    fixture.repo.git('log', '--format=%s', `${fixture.commits.local}..HEAD`).split('\n');

  it('opens from the log with the commits oldest first', async () => {
    const ready = waitFor(api.rebase.dialog.onDidBecomeReady);
    assert.ok(
      await vscode.commands.executeCommand('dimicek.log.interactiveRebase', { hash: hashes[0] }),
    );
    await ready;
    const state = api.rebase.dialog.currentState!;
    assert.strictEqual(state.branch, 'work');
    assert.strictEqual(state.base, fixture.commits.local);
    assert.deepStrictEqual(
      state.commits.map((commit) => commit.subject),
      ['One', 'Two', 'Three'],
    );
  });

  it('rebases with the chosen actions and closes', async () => {
    await api.rebase.dialog.show(hashes[0]!);
    assert.ok(
      await api.rebase.dialog.start([
        { hash: hashes[0]!, action: 'pick' },
        { hash: hashes[1]!, action: 'squash' },
        { hash: hashes[2]!, action: 'reword', message: 'Third done' },
      ]),
    );
    assert.strictEqual(api.rebase.dialog.isOpen, false);
    assert.deepStrictEqual(subjects(), ['Third done', 'One']);
  });

  it('keeps the dialog open and shows invalid choices', async () => {
    await api.rebase.dialog.show(hashes[0]!);
    const error = waitFor(api.rebase.dialog.onDidPost, (message) => message.type === 'error');
    assert.strictEqual(
      await api.rebase.dialog.start([{ hash: hashes[0]!, action: 'fixup' }]),
      false,
    );
    await error;
    assert.ok(api.rebase.dialog.isOpen);
  });

  it('refuses to open for ranges with merge commits', async () => {
    assert.strictEqual(await api.rebase.dialog.show(fixture.commits.logout), false);
    assert.strictEqual(api.rebase.dialog.isOpen, false);
  });
});
