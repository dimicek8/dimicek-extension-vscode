import * as assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { ChangesNode } from '../../src/features/commit/changesTree';
import type { CommitFeature } from '../../src/features/commit/commitFeature';
import { addWorkingTreeChanges, createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateExtension, waitUntil } from './helpers';

describe('Change actions', () => {
  let commit: CommitFeature;
  let fixture: HistoryRepo;
  let confirmations: string[];
  let answer: boolean;

  before(async () => {
    const api = await activateExtension();
    assert.ok(api.repoManager && api.commit);
    commit = api.commit;
    fixture = createHistoryRepo();
    addWorkingTreeChanges(fixture.repo);
    fixture.repo.write('build/out.js', 'compiled\n');
    fixture.repo.write('scratch.txt', 'scratch\n');

    commit.actions.useTrash = false;
    commit.actions.confirm = async (message) => {
      confirmations.push(message);
      return answer;
    };

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

  beforeEach(() => {
    confirmations = [];
    answer = true;
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  const file = (path: string) => join(fixture.repo.root, path);
  const node = (path: string): ChangesNode => {
    const change = commit.model.changes.find((candidate) => candidate.path === path);
    assert.ok(change, `No change for ${path}`);
    return { type: 'file', change, root: fixture.repo.root, flat: true };
  };
  const kindOf = (path: string) =>
    commit.model.changes.find((change) => change.path === path)?.kind;

  it('does nothing when the rollback is not confirmed', async () => {
    answer = false;
    await vscode.commands.executeCommand('dimicek.changes.rollback', node('README.md'));
    assert.deepStrictEqual(confirmations, ['Rollback changes in README.md?']);
    assert.strictEqual(kindOf('README.md'), 'modified');
  });

  it('rolls back several selected files', async () => {
    const selection = [node('README.md'), node('src/auth.ts')];
    await vscode.commands.executeCommand('dimicek.changes.rollback', selection[0], selection);

    assert.deepStrictEqual(confirmations, ['Rollback changes in 2 files?']);
    assert.strictEqual(readFileSync(file('README.md'), 'utf8'), '# Test project\n');
    assert.ok(existsSync(file('src/login.ts')));
    assert.strictEqual(kindOf('README.md'), undefined);
    assert.strictEqual(kindOf('src/auth.ts'), undefined);
  });

  it('adds unversioned files to git and includes them in the commit', async () => {
    await vscode.commands.executeCommand('dimicek.changes.addToVcs', node('notes/todo ž.txt'));
    assert.strictEqual(kindOf('notes/todo ž.txt'), 'added');
    assert.ok(commit.model.inclusion.isIncluded('notes/todo ž.txt'));
  });

  it('ignores a whole unversioned directory', async () => {
    const [, unversioned] = commit.tree.getChildren();
    assert.ok(unversioned?.type === 'group' && unversioned.group.id === 'unversioned');
    const directory: ChangesNode = {
      type: 'directory',
      directory: { name: 'build', path: 'build', directories: [], files: [] },
      groupId: 'unversioned',
      root: fixture.repo.root,
    };
    await vscode.commands.executeCommand('dimicek.changes.ignore', directory);

    assert.strictEqual(readFileSync(file('.gitignore'), 'utf8'), '/build/\n');
    assert.strictEqual(kindOf('build/out.js'), undefined);
    assert.strictEqual(kindOf('.gitignore'), 'unversioned');
  });

  it('deletes a file after confirmation', async () => {
    await vscode.commands.executeCommand('dimicek.changes.delete', node('scratch.txt'));
    assert.deepStrictEqual(confirmations, ['Delete scratch.txt?']);
    assert.ok(!existsSync(file('scratch.txt')));
    assert.strictEqual(kindOf('scratch.txt'), undefined);
  });

  it('opens the working copy of a file', async () => {
    await vscode.commands.executeCommand('dimicek.changes.openFile', node('src/new file.ts'));
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputText);
    assert.strictEqual(input.uri.fsPath, vscode.Uri.file(file('src/new file.ts')).fsPath);
  });
});
