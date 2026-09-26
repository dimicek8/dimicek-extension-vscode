import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { BranchRef } from '../../src/features/branches/branchEntries';
import type { ChangesNode } from '../../src/features/commit/changesTree';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi } from './helpers';

describe('Branch actions', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;
  let answer: string | undefined;

  before(async () => {
    fixture = createHistoryRepo();
    fixture.repo.git('switch', '--quiet', '--create', 'conflict', fixture.commits.merge);
    fixture.repo.commit('Change readme on branch', { 'README.md': 'branch\n' });
    fixture.repo.git('switch', '--quiet', 'main');
    fixture.repo.commit('Change readme on main', { 'README.md': 'main\n' });
    api = await activateWithRepository(fixture.repo);
    api.branches.operations.choose = async () => answer;
  });

  beforeEach(() => {
    answer = undefined;
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  const git = (...args: string[]) => fixture.repo.git(...args);
  const ops = () => api.branches.operations;
  const ref = async (name: string): Promise<BranchRef> => {
    const entry = (await api.branches.popup.loadEntries()).find(
      (candidate) => candidate.kind === 'branch' && candidate.label === name,
    );
    assert.ok(entry?.kind === 'branch', `No branch ${name}`);
    return entry.ref;
  };
  const local = async (name: string) => {
    const branch = await ref(name);
    assert.ok(branch.type === 'branch');
    return branch;
  };
  const commands = async () =>
    (await api.branches.popup.loadEntries())
      .filter((entry) => entry.kind === 'command')
      .map((entry) => (entry.kind === 'command' ? entry.command : ''));
  const labels = async (name: string, current = false) =>
    api.branches.popup
      .branchActions(await ref(name), current)
      .filter((action) => action.kind !== vscode.QuickPickItemKind.Separator)
      .map((action) => action.label);

  it('offers actions depending on the kind of branch', async () => {
    assert.deepStrictEqual(await labels('feature/login'), [
      'Checkout',
      "New Branch from 'feature/login'…",
      "Checkout and Rebase onto 'main'",
      "Compare with 'main'",
      "Rebase 'main' onto 'feature/login'",
      "Merge 'feature/login' into 'main'",
      "Push 'feature/login'",
      "Update 'feature/login'",
      'Rename…',
      'Delete',
    ]);
    assert.deepStrictEqual(await labels('main', true), [
      "New Branch from 'main'…",
      'Push…',
      "Update 'main'",
      'Rename…',
    ]);
    assert.deepStrictEqual(await labels('origin/main'), [
      'Checkout',
      "New Branch from 'origin/main'…",
      "Compare with 'main'",
      "Rebase 'main' onto 'origin/main'",
      "Merge 'origin/main' into 'main'",
      'Delete',
    ]);
  });

  it('stops a conflicting merge, shows it everywhere and aborts it', async () => {
    assert.ok(await ops().merge(await ref('conflict'), 'main'));
    await api.branches.statusBar.update();
    assert.strictEqual(api.branches.statusBar.text, '$(git-branch) main (Merging)');
    assert.deepStrictEqual((await commands()).slice(0, 1), ['abortMerge']);
    assert.ok(api.commit.model.changes.some((change) => change.kind === 'conflicted'));

    assert.ok(await api.branches.popup.runCommand('abortMerge'));
    await api.branches.statusBar.update();
    assert.strictEqual(api.branches.statusBar.text, '$(git-branch) main ↑2 ↓1');
  });

  it('continues a rebase only after conflicts are marked as resolved', async () => {
    await ops().checkout(await ref('conflict'));
    assert.ok(await ops().rebaseCurrentOnto(await ref('main'), 'conflict'));
    assert.deepStrictEqual((await commands()).slice(0, 2), ['continueRebase', 'abortRebase']);

    assert.strictEqual(await ops().continueRebase(), false);

    fixture.repo.write('README.md', 'resolved\n');
    const change = api.commit.model.changes.find((candidate) => candidate.path === 'README.md');
    assert.ok(change?.kind === 'conflicted');
    const node: ChangesNode = { type: 'file', change, root: fixture.repo.root, flat: true };
    await vscode.commands.executeCommand('dimicek.changes.markResolved', node);

    assert.ok(await ops().continueRebase());
    assert.strictEqual(await api.commit.model.repository!.getOperationState(), undefined);
    assert.strictEqual(git('show', 'HEAD:README.md'), 'resolved');
    assert.strictEqual(api.commit.model.branch.head, 'conflict');
  });

  it('merges without conflicts', async () => {
    await ops().checkout(await ref('main'));
    git('branch', 'extra', 'main');
    git('switch', '--quiet', 'extra');
    fixture.repo.commit('Extra work', { 'extra.txt': 'extra\n' });
    git('switch', '--quiet', 'main');

    assert.ok(await ops().merge(await ref('extra'), 'main'));
    assert.strictEqual(git('rev-parse', 'HEAD'), git('rev-parse', 'extra'));
  });

  it('renames a branch and deletes an unmerged one after confirmation', async () => {
    assert.ok(await ops().rename(await local('extra'), 'extra-renamed'));
    assert.ok(await ref('extra-renamed'));

    answer = undefined;
    assert.strictEqual(await ops().delete(await ref('conflict')), false);
    answer = 'Delete';
    assert.ok(await ops().delete(await ref('conflict')));
    assert.strictEqual(git('branch', '--list', 'conflict'), '');
  });

  it('pushes and updates branches and deletes remote branches', async () => {
    git('switch', '--quiet', 'feature/login');
    fixture.repo.commit('More login work', { 'src/login.ts': 'export const login = 2;\n' });
    git('switch', '--quiet', 'main');
    await api.commit.model.refresh();

    assert.ok(await ops().push(await local('feature/login')));
    assert.strictEqual(git('rev-parse', 'origin/feature/login'), git('rev-parse', 'feature/login'));

    fixture.other.git('fetch', '--quiet');
    fixture.other.git('switch', '--quiet', '--track', 'origin/feature/login');
    fixture.other.commit('Remote login work', { 'remote.txt': 'x\n' });
    fixture.other.git('push', '--quiet', 'origin', 'feature/login');
    assert.ok(await ops().update(await local('feature/login')));
    assert.strictEqual(git('rev-parse', 'feature/login'), fixture.other.git('rev-parse', 'HEAD'));

    answer = 'Delete';
    assert.ok(await ops().delete(await ref('origin/feature/login')));
    assert.strictEqual(git('ls-remote', '--heads', 'origin', 'feature/login'), '');
  });
});
