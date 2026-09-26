import * as assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { StashNode } from '../../src/features/stash/stashTree';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi } from './helpers';

describe('Stashes view', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;
  let answer: string | undefined;

  before(async () => {
    fixture = createHistoryRepo();
    api = await activateWithRepository(fixture.repo);
    api.stash.actions.choose = async () => answer;
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  const file = (path: string) => join(fixture.repo.root, path);
  const messages = () => api.stash.tree.entries.map((stash) => stash.message);
  const stashNode = (index: number): StashNode => ({
    type: 'stash',
    stash: api.stash.tree.entries[index]!,
  });

  it('stashes tracked changes and optionally untracked files', async () => {
    fixture.repo.write('README.md', 'first\n');
    fixture.repo.write('notes.txt', 'untracked\n');
    assert.ok(await api.stash.actions.stash('Only tracked', false));
    assert.ok(existsSync(file('notes.txt')));

    fixture.repo.write('README.md', 'second\n');
    assert.ok(await api.stash.actions.stash('With untracked', true));
    assert.ok(!existsSync(file('notes.txt')));

    assert.deepStrictEqual(messages(), ['With untracked', 'Only tracked']);
    assert.strictEqual(await api.stash.actions.stash('Nothing', false), false);
  });

  it('shows the files of a stash and their diff', async () => {
    const files = await api.stash.tree.getChildren(stashNode(0));
    assert.deepStrictEqual(
      files.map((node) => (node.type === 'file' ? `${node.file.status}:${node.file.path}` : '')),
      ['modified:README.md', 'added:notes.txt'],
    );

    await vscode.commands.executeCommand('dimicek.stash.showDiff', files[1]);
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputTextDiff);
    assert.strictEqual(
      (await vscode.workspace.openTextDocument(input.modified)).getText(),
      'untracked\n',
    );
  });

  it('applies and pops stashes', async () => {
    await vscode.commands.executeCommand('dimicek.stash.apply', stashNode(1));
    assert.strictEqual(readFileSync(file('README.md'), 'utf8'), 'first\n');
    assert.strictEqual(api.stash.tree.entries.length, 2);

    fixture.repo.git('checkout', '--', 'README.md');
    await vscode.commands.executeCommand('dimicek.stash.pop', stashNode(0));
    assert.strictEqual(readFileSync(file('README.md'), 'utf8'), 'second\n');
    assert.ok(existsSync(file('notes.txt')));
    assert.deepStrictEqual(messages(), ['Only tracked']);
  });

  it('drops and clears stashes only after confirmation', async () => {
    answer = undefined;
    assert.strictEqual(await api.stash.actions.drop(api.stash.tree.entries[0]!), false);
    answer = 'Drop';
    assert.ok(await api.stash.actions.drop(api.stash.tree.entries[0]!));
    assert.deepStrictEqual(messages(), []);

    assert.ok(await api.stash.actions.stash('Again', true));
    answer = 'Clear';
    assert.ok(await api.stash.actions.clear());
    assert.deepStrictEqual(messages(), []);
  });

  it('unstashes into a new branch', async () => {
    fixture.repo.write('README.md', 'branch work\n');
    await api.stash.actions.stash('Branch work', false);
    assert.ok(await api.stash.actions.branch(api.stash.tree.entries[0]!, 'from-stash'));
    assert.strictEqual(api.commit.model.branch.head, 'from-stash');
    assert.strictEqual(readFileSync(file('README.md'), 'utf8'), 'branch work\n');
  });
});
