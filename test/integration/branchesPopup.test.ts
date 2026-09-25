import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { BranchEntry, BranchRef } from '../../src/features/branches/branchEntries';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi } from './helpers';

describe('Branches popup', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;
  let choices: string[];
  let answer: string | undefined;

  before(async () => {
    fixture = createHistoryRepo();
    fixture.repo.git('switch', '--quiet', '--create', 'lines-a');
    fixture.repo.commit('Add notes', { 'notes.txt': 'one\ntwo\nthree\nfour\nfive\n' });
    fixture.repo.git('switch', '--quiet', '--create', 'lines-b');
    fixture.repo.commit('Edit first line', { 'notes.txt': 'ONE\ntwo\nthree\nfour\nfive\n' });
    fixture.repo.git('switch', '--quiet', 'main');
    api = await activateWithRepository(fixture.repo);
    api.branches.operations.choose = async (message) => {
      choices.push(message);
      return answer;
    };
  });

  beforeEach(() => {
    choices = [];
    answer = undefined;
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  const outline = (entries: BranchEntry[]) =>
    entries.map((entry) =>
      entry.kind === 'separator'
        ? `--${entry.label}--`
        : entry.kind === 'command'
          ? `>${entry.command}`
          : entry.label,
    );
  const section = (entries: string[], name: string) => {
    const start = entries.indexOf(`--${name}--`);
    if (start === -1) {
      return [];
    }
    const end = entries.findIndex((entry, index) => index > start && entry.startsWith('--'));
    return entries.slice(start + 1, end === -1 ? undefined : end);
  };
  const entries = async () => outline(await api.branches.popup.loadEntries());
  const branchRef = async (name: string): Promise<BranchRef> => {
    const entry = (await api.branches.popup.loadEntries()).find(
      (candidate) => candidate.kind === 'branch' && candidate.label === name,
    );
    assert.ok(entry?.kind === 'branch', `No branch ${name}`);
    return entry.ref;
  };
  const head = () => api.commit.model.branch.head;
  const read = (path: string) => readFileSync(join(fixture.repo.root, path), 'utf8');

  it('lists commands, recent, local and remote branches with favorites first', async () => {
    const all = await entries();
    assert.deepStrictEqual(all.slice(0, 3), ['>newBranch', '>checkoutRevision', '>fetch']);
    assert.deepStrictEqual(section(all, 'Recent'), ['lines-b', 'lines-a', 'gone', 'feature/login']);
    assert.deepStrictEqual(section(all, 'Local'), [
      'main',
      'feature/login',
      'gone',
      'lines-a',
      'lines-b',
    ]);
    assert.deepStrictEqual(section(all, 'Remote'), ['origin/feature/login', 'origin/main']);
  });

  it('toggles favorites', async () => {
    await api.branches.favorites.toggle(fixture.repo.root, 'refs/heads/gone');
    assert.deepStrictEqual(section(await entries(), 'Local').slice(0, 2), ['gone', 'main']);
    await api.branches.favorites.toggle(fixture.repo.root, 'refs/heads/gone');
  });

  it('checks out a local branch and lists it first among recent branches', async () => {
    assert.ok(await api.branches.operations.checkout(await branchRef('feature/login')));
    assert.strictEqual(head(), 'feature/login');
    assert.ok(await api.branches.operations.checkout(await branchRef('main')));
    assert.strictEqual(section(await entries(), 'Recent')[0], 'feature/login');
  });

  it('restores local changes after a smart checkout', async () => {
    await api.branches.operations.checkout(await branchRef('lines-a'));
    fixture.repo.write('notes.txt', 'one\ntwo\nthree\nfour\nFIVE\n');
    answer = 'Smart Checkout';

    assert.ok(await api.branches.operations.checkout(await branchRef('lines-b')));

    assert.strictEqual(choices.length, 1);
    assert.strictEqual(head(), 'lines-b');
    assert.strictEqual(read('notes.txt'), 'ONE\ntwo\nthree\nfour\nFIVE\n');
    assert.strictEqual(fixture.repo.git('stash', 'list'), '');
  });

  it('keeps the stash when restoring local changes conflicts', async () => {
    answer = 'Smart Checkout';
    fixture.repo.write('notes.txt', 'uno\ntwo\nthree\nfour\nFIVE\n');

    assert.ok(await api.branches.operations.checkout(await branchRef('lines-a')));

    assert.strictEqual(head(), 'lines-a');
    assert.match(read('notes.txt'), /<<<<<<<[\s\S]*>>>>>>>/);
    assert.notStrictEqual(fixture.repo.git('stash', 'list'), '');
    fixture.repo.git('reset', '--hard', '--quiet');
    fixture.repo.git('stash', 'drop', '--quiet');
  });

  it('does nothing when the checkout dialog is cancelled', async () => {
    fixture.repo.write('notes.txt', 'changed\n');
    answer = undefined;
    assert.strictEqual(await api.branches.operations.checkout(await branchRef('lines-b')), false);
    assert.strictEqual(head(), 'lines-a');
  });

  it('can force a checkout and discard local changes', async () => {
    answer = 'Force Checkout';
    assert.ok(await api.branches.operations.checkout(await branchRef('lines-b')));
    assert.strictEqual(head(), 'lines-b');
    assert.strictEqual(read('notes.txt'), 'ONE\ntwo\nthree\nfour\nfive\n');
  });

  it('checks out a remote branch as a tracking branch', async () => {
    fixture.repo.git('branch', '--delete', '--force', 'feature/login');
    assert.ok(await api.branches.operations.checkout(await branchRef('origin/feature/login')));
    assert.strictEqual(head(), 'feature/login');
    assert.strictEqual(api.commit.model.branch.upstream, 'origin/feature/login');
  });

  it('creates branches and checks out revisions', async () => {
    assert.ok(await api.branches.operations.createBranch('topic', 'main'));
    assert.strictEqual(head(), 'topic');

    assert.ok(await api.branches.operations.checkoutRevision('v1.0'));
    assert.strictEqual(head(), undefined);
    assert.strictEqual(api.commit.model.branch.commit, fixture.commits.merge);
  });

  it('offers checkout only for branches other than the current one', async () => {
    await api.branches.operations.checkout(await branchRef('main'));
    const labels = async (name: string, current: boolean) =>
      api.branches.popup
        .branchActions(await branchRef(name), current)
        .map((action) => action.label);
    assert.deepStrictEqual(await labels('main', true), ["New Branch from 'main'…"]);
    assert.deepStrictEqual(await labels('topic', false), ['Checkout', "New Branch from 'topic'…"]);
  });
});
