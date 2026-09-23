import * as assert from 'node:assert';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { ChangeDecorationProvider } from '../../src/features/commit/changeDecorations';
import {
  type ChangesNode,
  GROUP_BY_DIRECTORY_SETTING,
} from '../../src/features/commit/changesTree';
import type { CommitFeature } from '../../src/features/commit/commitFeature';
import { addWorkingTreeChanges, createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateExtension, waitUntil } from './helpers';

const checked = vscode.TreeItemCheckboxState.Checked;
const unchecked = vscode.TreeItemCheckboxState.Unchecked;

function setGrouping(grouped: boolean): Thenable<void> {
  return vscode.workspace
    .getConfiguration()
    .update(GROUP_BY_DIRECTORY_SETTING, grouped, vscode.ConfigurationTarget.Global);
}

describe('Changes view', () => {
  let commit: CommitFeature;
  let fixture: HistoryRepo;

  const label = (node: ChangesNode): string => {
    switch (node.type) {
      case 'group':
        return node.group.id;
      case 'directory':
        return `${node.directory.name}/`;
      case 'file':
        return node.change.path;
    }
  };
  const children = (node?: ChangesNode) => commit.tree.getChildren(node);
  const state = (node: ChangesNode) => commit.tree.getTreeItem(node).checkboxState;

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
    await setGrouping(true);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  describe('as a flat list', () => {
    before(() => setGrouping(false));

    it('groups tracked changes and unversioned files', () => {
      const groups = children();
      assert.deepStrictEqual(groups.map(label), ['changes', 'unversioned']);
      assert.deepStrictEqual(children(groups[0]).map(label), [
        'README.md',
        'src/auth.ts',
        'src/logout.ts',
        'src/new file.ts',
      ]);
      assert.deepStrictEqual(children(groups[1]).map(label), ['notes/todo ž.txt']);
    });

    it('renders files with name, directory, kind and a decorated resource', () => {
      const [changes] = children();
      const renamed = commit.tree.getTreeItem(children(changes)[1]!);
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

    it('includes tracked changes by default and lets checkboxes change the selection', () => {
      const [changes, unversioned] = children();
      assert.strictEqual(state(changes!), checked);
      assert.strictEqual(state(unversioned!), unchecked);
      assert.deepStrictEqual(
        commit.model.includedChanges.map((change) => change.path),
        ['README.md', 'src/auth.ts', 'src/logout.ts', 'src/new file.ts'],
      );

      const readme = children(changes)[0]!;
      commit.tree.applyCheckboxChanges([[readme, unchecked]]);
      assert.strictEqual(state(readme), unchecked);
      assert.strictEqual(state(changes!), unchecked);

      commit.tree.applyCheckboxChanges([[unversioned!, checked]]);
      assert.strictEqual(state(unversioned!), checked);
      assert.deepStrictEqual(
        commit.model.includedChanges.map((change) => change.path),
        ['notes/todo ž.txt', 'src/auth.ts', 'src/logout.ts', 'src/new file.ts'],
      );

      commit.tree.applyCheckboxChanges([[changes!, checked]]);
      assert.strictEqual(state(readme), checked);
      commit.tree.applyCheckboxChanges([[unversioned!, unchecked]]);
    });
  });

  describe('grouped by directory', () => {
    before(() => setGrouping(true));

    it('nests files under their directories', () => {
      const [changes] = children();
      const top = children(changes);
      assert.deepStrictEqual(top.map(label), ['src/', 'README.md']);
      assert.deepStrictEqual(children(top[0]).map(label), [
        'src/auth.ts',
        'src/logout.ts',
        'src/new file.ts',
      ]);
      const directory = commit.tree.getTreeItem(top[0]!);
      assert.strictEqual(directory.label, 'src');
      assert.strictEqual(directory.description, '3 files');
      assert.strictEqual(commit.tree.getTreeItem(children(top[0])[0]!).description, undefined);
    });

    it('toggles all files of a directory with its checkbox', () => {
      const [changes] = children();
      const src = children(changes)[0]!;
      commit.tree.applyCheckboxChanges([[src, unchecked]]);
      assert.deepStrictEqual(
        commit.model.includedChanges.map((change) => change.path),
        ['README.md'],
      );
      commit.tree.applyCheckboxChanges([[src, checked]]);
      assert.strictEqual(state(src), checked);
    });
  });

  it('exposes the current branch with ahead and behind counts', () => {
    const { head, ahead, behind } = commit.model.branch;
    assert.deepStrictEqual({ head, ahead, behind }, { head: 'main', ahead: 1, behind: 1 });
  });
});
