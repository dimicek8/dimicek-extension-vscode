import * as assert from 'node:assert';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { ChangeDecorationProvider } from '../../src/features/commit/changeDecorations';
import type { CommitFeature } from '../../src/features/commit/commitFeature';
import type { ChangesNode } from '../../src/features/commit/changesTree';
import { addWorkingTreeChanges, createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateExtension, waitUntil } from './helpers';

describe('Changes view', () => {
  let commit: CommitFeature;
  let fixture: HistoryRepo;

  before(async () => {
    const api = await activateExtension();
    assert.ok(api.repoManager && api.commit, 'Commit feature failed to initialize');
    commit = api.commit;
    fixture = createHistoryRepo();
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

  const labels = (nodes: ChangesNode[]) =>
    nodes.map((node) => (node.type === 'group' ? node.group.id : node.change.path));

  it('groups tracked changes and unversioned files', () => {
    const groups = commit.tree.getChildren();
    assert.deepStrictEqual(labels(groups), ['changes', 'unversioned']);
    assert.deepStrictEqual(labels(commit.tree.getChildren(groups[0])), [
      'README.md',
      'src/auth.ts',
      'src/logout.ts',
      'src/new file.ts',
    ]);
    assert.deepStrictEqual(labels(commit.tree.getChildren(groups[1])), ['notes/todo ž.txt']);
  });

  it('renders files with name, directory, kind and a decorated resource', () => {
    const [changes] = commit.tree.getChildren();
    const files = commit.tree.getChildren(changes);
    const renamed = commit.tree.getTreeItem(files[1]!);
    assert.strictEqual(renamed.label, 'auth.ts');
    assert.strictEqual(renamed.description, 'src');
    assert.strictEqual(renamed.contextValue, 'file:renamed');
    assert.strictEqual(renamed.tooltip, 'src/login.ts → src/auth.ts');

    const decoration = new ChangeDecorationProvider().provideFileDecoration(renamed.resourceUri!);
    assert.strictEqual(decoration?.badge, 'R');

    const group = commit.tree.getTreeItem(changes!);
    assert.strictEqual(group.label, 'Changes');
    assert.strictEqual(group.description, '4 files');
  });

  it('exposes the current branch with ahead and behind counts', () => {
    assert.deepStrictEqual(
      {
        head: commit.model.branch.head,
        ahead: commit.model.branch.ahead,
        behind: commit.model.branch.behind,
      },
      { head: 'main', ahead: 1, behind: 1 },
    );
  });
});
