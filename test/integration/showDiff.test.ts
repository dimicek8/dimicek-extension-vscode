import * as assert from 'node:assert';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { CommitFeature } from '../../src/features/commit/commitFeature';
import type { ChangesNode } from '../../src/features/commit/changesTree';
import { GIT_SCHEME } from '../../src/vscode/gitContentProvider';
import { addWorkingTreeChanges, createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateExtension, waitUntil } from './helpers';

describe('Show diff', () => {
  let commit: CommitFeature;
  let fixture: HistoryRepo;

  before(async () => {
    const api = await activateExtension();
    assert.ok(api.repoManager && api.commit);
    commit = api.commit;
    fixture = createHistoryRepo();
    addWorkingTreeChanges(fixture.repo);
    fixture.repo.write('src/app.ts', 'export const app = 2;\n');

    const rootUri = vscode.Uri.file(fixture.repo.root);
    await api.repoManager.gitApi.openRepository(rootUri);
    await waitUntil(
      () => api.repoManager!.getRepository(rootUri),
      api.repoManager.onDidChangeRepositories,
    );
    await vscode.window.showTextDocument(vscode.Uri.file(join(fixture.repo.root, 'README.md')));
    await waitUntil(
      () =>
        commit.model.repository?.root === rootUri.fsPath &&
        commit.model.changes.some((change) => change.path === 'src/app.ts')
          ? true
          : undefined,
      commit.model.onDidChange,
    );
  });

  afterEach(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

  after(() => fixture?.repo.dispose());

  function fileNode(path: string): ChangesNode {
    const change = commit.model.changes.find((candidate) => candidate.path === path);
    assert.ok(change, `No change for ${path}`);
    return { type: 'file', change, root: fixture.repo.root, flat: true };
  }

  async function openDiff(path: string): Promise<vscode.TabInputTextDiff> {
    const node = fileNode(path);
    assert.strictEqual(commit.tree.getTreeItem(node).command?.command, 'dimicek.changes.showDiff');
    await vscode.commands.executeCommand('dimicek.changes.showDiff', node);
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputTextDiff, 'Active tab is not a diff');
    return input;
  }

  async function text(uri: vscode.Uri): Promise<string> {
    return (await vscode.workspace.openTextDocument(uri)).getText();
  }

  it('compares HEAD with the working tree for a modified file', async () => {
    const diff = await openDiff('src/app.ts');
    assert.strictEqual(diff.original.scheme, GIT_SCHEME);
    assert.strictEqual(await text(diff.original), 'export const app = 1;\n');
    assert.strictEqual(diff.modified.scheme, 'file');
    assert.strictEqual(diff.modified.fsPath, join(fixture.repo.root, 'src', 'app.ts'));
  });

  it('uses the original path of a renamed file', async () => {
    const diff = await openDiff('src/auth.ts');
    assert.strictEqual(await text(diff.original), 'export const login = true;\n');
  });

  it('shows an empty original for added files and an empty modified side for deleted files', async () => {
    const added = await openDiff('src/new file.ts');
    assert.strictEqual(await text(added.original), '');

    const deleted = await openDiff('src/logout.ts');
    assert.strictEqual(await text(deleted.original), 'export const logout = true;\n');
    assert.strictEqual(await text(deleted.modified), '');
  });
});
