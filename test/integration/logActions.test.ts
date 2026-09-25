import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi } from './helpers';

describe('Git Log commit actions', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  before(async () => {
    fixture = createHistoryRepo();
    api = await activateWithRepository(fixture.repo);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  const git = (...args: string[]) => fixture.repo.git(...args);
  const commands = async () =>
    (await api.branches.popup.loadEntries())
      .filter((entry) => entry.kind === 'command')
      .map((entry) => (entry.kind === 'command' ? entry.command : ''));

  it('copies the revision number', async () => {
    await vscode.commands.executeCommand('dimicek.log.copyRevision', { hash: fixture.commits.app });
    assert.strictEqual(await vscode.env.clipboard.readText(), fixture.commits.app);
  });

  it('creates tags on a commit', async () => {
    assert.ok(await api.log.actions.createTag(fixture.commits.app, 'v0.1'));
    assert.ok(await api.log.actions.createTag(fixture.commits.typo, 'v0.2', 'Second'));
    assert.strictEqual(git('rev-parse', 'v0.1'), fixture.commits.app);
    assert.strictEqual(git('cat-file', '-t', 'v0.2'), 'tag');
    const labels = api.log.model.loadedCommits.find(
      (commit) => commit.hash === fixture.commits.app,
    )!.refs;
    assert.ok(labels.includes('refs/tags/v0.1'));
  });

  it('cherry-picks and reverts commits', async () => {
    git('switch', '--quiet', '--create', 'pick', fixture.commits.app);
    await api.commit.model.refresh();

    await vscode.commands.executeCommand('dimicek.log.cherryPick', { hash: fixture.commits.typo });
    assert.strictEqual(git('log', '-1', '--format=%s'), 'Fix typo in README');

    await vscode.commands.executeCommand('dimicek.log.revert', { hash: git('rev-parse', 'HEAD') });
    assert.strictEqual(git('log', '-1', '--format=%s'), 'Revert "Fix typo in README"');
  });

  it('offers to continue or abort a conflicting cherry-pick', async () => {
    fixture.repo.commit('Other readme', { 'README.md': 'other\n' });
    await api.commit.model.refresh();

    assert.ok(await api.log.actions.cherryPick(fixture.commits.typo));
    assert.deepStrictEqual((await commands()).slice(0, 2), [
      'continueCherryPick',
      'abortCherryPick',
    ]);

    assert.ok(await api.branches.popup.runCommand('abortCherryPick'));
    assert.strictEqual(await api.commit.model.repository!.getOperationState(), undefined);
  });

  it('checks out a revision and resets the current branch', async () => {
    await vscode.commands.executeCommand('dimicek.log.checkoutRevision', {
      hash: fixture.commits.app,
    });
    assert.strictEqual(api.commit.model.branch.head, undefined);

    git('switch', '--quiet', 'main');
    await api.commit.model.refresh();
    assert.ok(await api.log.actions.reset(fixture.commits.merge, 'mixed'));
    assert.strictEqual(git('rev-parse', 'HEAD'), fixture.commits.merge);
    assert.ok(api.commit.model.changes.some((change) => change.path === 'LOCAL.md'));

    fixture.repo.write('README.md', 'local edit\n');
    await api.commit.model.refresh();
    assert.ok(await api.log.actions.reset(fixture.commits.merge, 'hard'));
    assert.deepStrictEqual(
      api.commit.model.changes.map((change) => `${change.kind}:${change.path}`),
      ['unversioned:LOCAL.md'],
    );
  });
});
