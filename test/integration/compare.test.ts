import * as assert from 'node:assert';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi } from './helpers';

describe('Compare with branch and revision', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  before(async () => {
    fixture = createHistoryRepo();
    fixture.repo.git('mv', 'src/login.ts', 'src/auth.ts');
    fixture.repo.commit('Rename login');
    api = await activateWithRepository(fixture.repo);
  });

  afterEach(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

  after(() => fixture?.repo.dispose());

  const file = (...segments: string[]) => vscode.Uri.file(join(fixture.repo.root, ...segments));

  async function activeDiff(): Promise<{ original: string; modified: vscode.Uri }> {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputTextDiff, 'Active tab is not a diff');
    return {
      original: (await vscode.workspace.openTextDocument(input.original)).getText(),
      modified: input.modified,
    };
  }

  it('compares a file with its version on another branch', async () => {
    assert.ok(await api.compare.actions.withBranch(file('README.md'), 'feature/login'));
    const diff = await activeDiff();
    assert.strictEqual(diff.original, '# Test\n');
    assert.strictEqual(diff.modified.fsPath, file('README.md').fsPath);
  });

  it('reports files that do not exist on the branch', async () => {
    assert.strictEqual(
      await api.compare.actions.withBranch(file('LOCAL.md'), 'feature/login'),
      false,
    );
  });

  it('compares a renamed file with an old revision using its old path', async () => {
    assert.ok(
      await api.compare.actions.withRevision(file('src', 'auth.ts'), fixture.commits.login),
    );
    const diff = await activeDiff();
    assert.strictEqual(diff.original, 'export const login = true;\n');
  });

  it('compares folders without opening a diff directly', async () => {
    assert.ok(await api.compare.actions.withBranch(file('src'), 'feature/login'));
    assert.ok(await api.compare.actions.withRevision(file('src'), fixture.commits.app));
    assert.ok(
      !(vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputTextDiff),
    );
  });
});
