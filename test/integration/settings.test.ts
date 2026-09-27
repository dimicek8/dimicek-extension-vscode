import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { INTELLIJ_KEYMAP_SETTING } from '../../src/features/branches/branchesPopup';
import { QUIET_SCM_SETTING } from '../../src/features/settings/builtInSourceControl';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, eventually, type ReadyApi } from './helpers';

const configuration = () => vscode.workspace.getConfiguration();
const set = (key: string, value: unknown) =>
  configuration().update(key, value, vscode.ConfigurationTarget.Global);

describe('Settings', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  before(async () => {
    fixture = createHistoryRepo();
    api = await activateWithRepository(fixture.repo);
  });

  after(async () => {
    await set(QUIET_SCM_SETTING, undefined);
    await set(INTELLIJ_KEYMAP_SETTING, undefined);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  it('quiets the built-in Source Control and restores it', async () => {
    await set(QUIET_SCM_SETTING, true);
    await eventually(() => configuration().inspect('scm.countBadge')?.globalValue === 'off');
    assert.strictEqual(configuration().inspect('git.enableStatusBarSync')?.globalValue, false);

    await set(QUIET_SCM_SETTING, false);
    await eventually(() => configuration().inspect('scm.countBadge')?.globalValue === undefined);
    assert.strictEqual(configuration().inspect('git.enableStatusBarSync')?.globalValue, undefined);
  });

  it('shows IntelliJ shortcuts in the branches popup when the keymap is on', async () => {
    const shortcuts = async () =>
      (await api.branches.popup.loadEntries()).flatMap((entry) =>
        entry.kind === 'command' && entry.description ? [entry.description] : [],
      );
    assert.deepStrictEqual(await shortcuts(), []);
    await set(INTELLIJ_KEYMAP_SETTING, true);
    assert.strictEqual((await shortcuts()).length, 4);
  });
});
