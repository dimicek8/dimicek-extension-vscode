import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { PushState, PushToWebview } from '../../src/shared/protocol';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi, waitFor } from './helpers';

describe('Push dialog', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  before(async () => {
    fixture = createHistoryRepo();
    api = await activateWithRepository(fixture.repo);
  });

  afterEach(() => api.push.dialog.close());

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  const git = (...args: string[]) => fixture.repo.git(...args);

  async function open(): Promise<PushState> {
    const ready = waitFor(api.push.dialog.onDidBecomeReady);
    await vscode.commands.executeCommand('dimicek.push.show');
    await ready;
    return api.push.dialog.currentState!;
  }

  async function nextState(action: () => Promise<void>): Promise<PushState> {
    const posted = waitFor(
      api.push.dialog.onDidPost,
      (message: PushToWebview) => message.type === 'state',
    );
    await action();
    const message = await posted;
    assert.ok(message.type === 'state');
    return message.state;
  }

  it('shows the target branch, outgoing commits and a warning when the remote is ahead', async () => {
    const state = await open();
    assert.strictEqual(state.branch, 'main');
    assert.strictEqual(`${state.remote}/${state.remoteBranch}`, 'origin/main');
    assert.strictEqual(state.remoteBranchExists, true);
    assert.strictEqual(state.setUpstream, false);
    assert.strictEqual(state.behind, 1);
    assert.deepStrictEqual(
      state.commits.map((commit) => commit.subject),
      ['Local change'],
    );
  });

  it('lists the files of a selected commit', async () => {
    await open();
    const files = waitFor(
      api.push.dialog.onDidPost,
      (message: PushToWebview) => message.type === 'files',
    );
    await api.push.dialog.handleMessage({ type: 'selectCommit', hash: fixture.commits.local });
    const message = await files;
    assert.ok(message.type === 'files');
    assert.deepStrictEqual(message.files, [{ status: 'added', path: 'LOCAL.md' }]);
  });

  it('keeps the dialog open and explains a rejected push', async () => {
    await open();
    const error = waitFor(
      api.push.dialog.onDidPost,
      (message: PushToWebview) => message.type === 'error',
    );
    assert.strictEqual(await api.push.dialog.push(false, false), false);
    const message = await error;
    assert.ok(message.type === 'error');
    assert.match(message.message, /Update the branch first, or use force push/);
    assert.ok(api.push.dialog.isOpen);
  });

  it('pushes to another remote branch without changing the upstream', async () => {
    await open();
    const state = await nextState(() =>
      api.push.dialog.handleMessage({
        type: 'changeTarget',
        remote: 'origin',
        remoteBranch: 'review/main',
      }),
    );
    assert.strictEqual(state.remoteBranchExists, false);
    assert.strictEqual(state.setUpstream, false);

    assert.ok(await api.push.dialog.push(false, false));
    assert.strictEqual(api.push.dialog.isOpen, false);
    assert.strictEqual(git('rev-parse', 'origin/review/main'), fixture.commits.local);
    assert.strictEqual(git('rev-parse', '--abbrev-ref', 'main@{upstream}'), 'origin/main');
  });

  it('sets the upstream when pushing a branch for the first time', async () => {
    git('switch', '--quiet', '--create', 'topic');
    fixture.repo.commit('Topic work');
    await api.commit.model.refresh();

    const state = await open();
    assert.strictEqual(state.remoteBranch, 'topic');
    assert.strictEqual(state.setUpstream, true);
    assert.deepStrictEqual(
      state.commits.map((commit) => commit.subject),
      ['Topic work'],
    );

    assert.ok(await api.push.dialog.push(false, false));
    assert.strictEqual(git('rev-parse', '--abbrev-ref', 'topic@{upstream}'), 'origin/topic');
    git('switch', '--quiet', 'main');
    await api.commit.model.refresh();
  });

  it('force pushes with lease', async () => {
    await open();
    assert.ok(await api.push.dialog.push(true, false));
    assert.strictEqual(git('rev-parse', 'origin/main'), fixture.commits.local);
  });
});
