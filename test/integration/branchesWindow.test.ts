import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { POPUP_STYLE_SETTING } from '../../src/features/branches/branchesFeature';
import type { BranchesToWebview } from '../../src/shared/protocol';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi, waitFor } from './helpers';

describe('Branches window', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  before(async () => {
    fixture = createHistoryRepo();
    api = await activateWithRepository(fixture.repo);
  });

  after(async () => {
    api.branches.window.close();
    await vscode.workspace
      .getConfiguration()
      .update(POPUP_STYLE_SETTING, undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  it('opens from the status bar with all branches and commands', async () => {
    const ready = waitFor(api.branches.window.onDidBecomeReady);
    await vscode.commands.executeCommand('dimicek.branches.show');
    await ready;
    const state = api.branches.window.currentState!;
    assert.strictEqual(state.current, 'main');
    assert.deepStrictEqual(state.branches.map((branch) => branch.name).sort(), [
      'feature/login',
      'gone',
      'main',
      'origin/feature/login',
      'origin/main',
    ]);
    assert.deepStrictEqual(state.commands.map((command) => command.command).slice(0, 3), [
      'newBranch',
      'checkoutRevision',
      'fetch',
    ]);
  });

  it('lists the actions of a selected branch', async () => {
    const posted = waitFor(
      api.branches.window.onDidPost,
      (message: BranchesToWebview) => message.type === 'actions',
    );
    await api.branches.window.handleMessage({
      type: 'select',
      fullName: 'refs/heads/feature/login',
    });
    const message = await posted;
    assert.ok(message.type === 'actions');
    assert.deepStrictEqual(
      message.actions.map((action) => action.id),
      [
        'checkout',
        'newBranchFrom',
        'checkoutAndRebase',
        'compare',
        'rebaseOnto',
        'merge',
        'push',
        'update',
        'rename',
        'delete',
      ],
    );
    assert.deepStrictEqual([...new Set(message.actions.map((action) => action.group))], [0, 1, 2]);
  });

  it('runs branch actions and refreshes', async () => {
    const refreshed = waitFor(
      api.branches.window.onDidPost,
      (message: BranchesToWebview) =>
        message.type === 'state' && message.state.current === 'feature/login',
    );
    await api.branches.window.handleMessage({
      type: 'runAction',
      fullName: 'refs/heads/feature/login',
      action: 'checkout',
    });
    await refreshed;
    assert.strictEqual(api.commit.model.branch.head, 'feature/login');
  });

  it('toggles favorites', async () => {
    await api.branches.window.handleMessage({
      type: 'toggleFavorite',
      fullName: 'refs/heads/gone',
    });
    const gone = api.branches.window.currentState!.branches.find(
      (branch) => branch.name === 'gone',
    );
    assert.strictEqual(gone?.favorite, true);
  });

  it('can switch back to the quick pick', async () => {
    api.branches.window.close();
    await vscode.workspace
      .getConfiguration()
      .update(POPUP_STYLE_SETTING, 'quickPick', vscode.ConfigurationTarget.Global);
    void vscode.commands.executeCommand('dimicek.branches.show');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
    assert.strictEqual(api.branches.window.isOpen, false);
  });
});
