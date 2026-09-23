import * as assert from 'node:assert';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { RepoManager } from '../../src/vscode/repoManager';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateExtension, waitFor, waitUntil } from './helpers';

describe('RepoManager', () => {
  let manager: RepoManager;
  let fixture: HistoryRepo;
  let rootUri: vscode.Uri;

  before(async () => {
    const api = await activateExtension();
    assert.ok(api.repoManager, 'RepoManager failed to initialize');
    manager = api.repoManager;
    fixture = createHistoryRepo();
    rootUri = vscode.Uri.file(fixture.repo.root);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  it('picks up a repository opened by the built-in Git extension', async () => {
    await manager.gitApi.openRepository(rootUri);
    const repository = await waitUntil(
      () => manager.getRepository(rootUri),
      manager.onDidChangeRepositories,
    );
    assert.strictEqual(repository.root, rootUri.fsPath);

    const status = await repository.getStatus();
    assert.strictEqual(status.branch.head, 'main');
    assert.strictEqual(status.branch.ahead, 1);
  });

  it('resolves the repository of a nested file', () => {
    const nested = vscode.Uri.file(join(fixture.repo.root, 'src', 'app.ts'));
    assert.strictEqual(manager.getRepository(nested)?.root, rootUri.fsPath);
    assert.strictEqual(manager.getRepository(vscode.Uri.parse('untitled:Untitled-1')), undefined);
  });

  it('follows the active editor', async () => {
    const file = vscode.Uri.file(join(fixture.repo.root, 'README.md'));
    const activeChanged = waitUntil(
      () =>
        manager.activeRepository?.root === rootUri.fsPath ? manager.activeRepository : undefined,
      manager.onDidChangeActiveRepository,
    );
    await vscode.window.showTextDocument(file);
    const active = await activeChanged;
    assert.strictEqual(active.root, rootUri.fsPath);
  });

  it('fires a debounced change event when the working tree changes', async () => {
    const changed = waitFor(
      manager.onDidChangeRepository,
      (repository) => repository.root === rootUri.fsPath,
      15_000,
    );
    appendFileSync(join(fixture.repo.root, 'README.md'), '\nchanged\n');
    await changed;

    const status = await manager.getRepository(rootUri)!.getStatus();
    assert.deepStrictEqual(
      status.entries.map((entry) => entry.path),
      ['README.md'],
    );
  });
});
