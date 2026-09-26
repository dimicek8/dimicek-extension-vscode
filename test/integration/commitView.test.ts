import * as assert from 'node:assert';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { CommitFeature } from '../../src/features/commit/commitFeature';
import { addWorkingTreeChanges, createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateExtension, waitFor, waitUntil } from './helpers';

describe('Commit view', () => {
  let commit: CommitFeature;
  let fixture: HistoryRepo;

  before(async () => {
    const api = await activateExtension();
    assert.ok(api.repoManager && api.commit);
    commit = api.commit;
    fixture = createHistoryRepo();
    fixture.repo.git('switch', '--quiet', '--create', 'topic');
    addWorkingTreeChanges(fixture.repo);

    const rootUri = vscode.Uri.file(fixture.repo.root);
    await api.repoManager.gitApi.openRepository(rootUri);
    await waitUntil(
      () => api.repoManager!.getRepository(rootUri),
      api.repoManager.onDidChangeRepositories,
    );
    await vscode.window.showTextDocument(vscode.Uri.file(join(fixture.repo.root, 'README.md')));
    await waitUntil(
      () =>
        commit.model.repository?.root === rootUri.fsPath && commit.model.changes.length > 0
          ? true
          : undefined,
      commit.model.onDidChange,
    );
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  const changedPaths = () => commit.model.changes.map((change) => change.path);

  it('loads the React webview', async () => {
    const ready = waitFor(commit.commitView.onDidBecomeReady);
    await vscode.commands.executeCommand('dimicek.commit.focus');
    await ready;
  });

  it('commits only the selected files', async () => {
    commit.model.setIncluded(changedPaths(), false);
    commit.model.setIncluded(['README.md'], true);

    const committed = await commit.commitView.commit({
      message: 'Update readme',
      amend: false,
      push: false,
    });

    assert.strictEqual(committed, true);
    assert.strictEqual(fixture.repo.git('log', '-1', '--format=%s'), 'Update readme');
    assert.ok(!changedPaths().includes('README.md'));
    assert.ok(changedPaths().includes('src/auth.ts'));
  });

  it('refuses to commit without a message or without files', async () => {
    commit.model.setIncluded(changedPaths(), false);
    assert.strictEqual(
      await commit.commitView.commit({ message: 'x', amend: false, push: false }),
      false,
    );
    commit.model.setIncluded(changedPaths(), true);
    assert.strictEqual(
      await commit.commitView.commit({ message: '   ', amend: false, push: false }),
      false,
    );
  });

  it('amends the last commit message', async () => {
    commit.model.setIncluded(changedPaths(), false);
    await commit.commitView.commit({ message: 'Update README', amend: true, push: false });
    assert.strictEqual(fixture.repo.git('log', '-1', '--format=%s'), 'Update README');
    assert.strictEqual(fixture.repo.git('rev-list', '--count', 'main..topic'), '1');
  });

  it('commits and opens the push dialog', async () => {
    const api = await activateExtension();
    const ready = waitFor(api.push!.dialog.onDidBecomeReady);
    commit.model.setIncluded(changedPaths(), true);
    await commit.commitView.commit({ message: 'Restructure sources', amend: false, push: true });

    assert.deepStrictEqual(changedPaths(), []);
    assert.ok(api.push!.dialog.isOpen);
    await ready;
    assert.ok(await api.push!.dialog.push(false, false));
    assert.strictEqual(
      fixture.repo.git('rev-parse', '--abbrev-ref', 'topic@{upstream}'),
      'origin/topic',
    );
    assert.strictEqual(
      fixture.repo.git('rev-parse', 'origin/topic'),
      fixture.repo.git('rev-parse', 'HEAD'),
    );
  });
});
