import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { LogCommitDetails, LogToWebview } from '../../src/shared/protocol';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi, waitFor } from './helpers';

describe('Git Log details', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  before(async () => {
    fixture = createHistoryRepo();
    api = await activateWithRepository(fixture.repo);
    await api.log.model.setFilters({});
  });

  afterEach(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

  after(() => fixture?.repo.dispose());

  async function select(hash: string): Promise<LogCommitDetails> {
    const posted = waitFor(
      api.log.view.onDidPost,
      (message: LogToWebview) => message.type === 'details' && message.details.hash === hash,
    );
    await api.log.view.handleMessage({ type: 'selectCommit', hash });
    const message = await posted;
    assert.ok(message.type === 'details');
    return message.details;
  }

  it('shows the message, author, parents, labels and changed files of a commit', async () => {
    const details = await select(fixture.commits.merge);
    assert.strictEqual(details.subject, "Merge branch 'feature/login'");
    assert.strictEqual(details.author, 'Test User');
    assert.deepStrictEqual(details.parents, [fixture.commits.typo, fixture.commits.logout]);
    assert.deepStrictEqual(
      details.refs.map((ref) => ref.name),
      ['gone', 'v1.0'],
    );
    assert.deepStrictEqual(
      details.files.map((file) => `${file.status}:${file.path}`),
      ['added:src/login.ts', 'added:src/logout.ts'],
    );
  });

  it('loads commits that are not in the loaded page', async () => {
    await api.log.model.setFilters({ branch: 'feature/login' });
    const details = await select(fixture.commits.remote);
    assert.strictEqual(details.subject, 'Remote change');
    await api.log.model.setFilters({});
  });

  it('opens the diff of a changed file against the parent', async () => {
    const details = await select(fixture.commits.typo);
    await api.log.view.openFileDiff(details.hash, details.files[0]!, details.parents[0]);

    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputTextDiff);
    const text = async (uri: vscode.Uri) =>
      (await vscode.workspace.openTextDocument(uri)).getText();
    assert.strictEqual(await text(input.original), '# Test\n');
    assert.strictEqual(await text(input.modified), '# Test project\n');
  });

  it('shows an empty original for files of the root commit', async () => {
    const details = await select(fixture.commits.initial);
    await api.log.view.openFileDiff(details.hash, details.files[0]!, undefined);
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputTextDiff);
    assert.strictEqual((await vscode.workspace.openTextDocument(input.original)).getText(), '');
  });

  it('copies the commit hash', async () => {
    await api.log.view.handleMessage({ type: 'copy', text: fixture.commits.app });
    assert.strictEqual(await vscode.env.clipboard.readText(), fixture.commits.app);
  });
});
