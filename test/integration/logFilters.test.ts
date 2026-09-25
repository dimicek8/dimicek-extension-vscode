import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { LogFilters } from '../../src/shared/protocol';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi } from './helpers';

describe('Git Log filters', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  before(async () => {
    fixture = createHistoryRepo();
    api = await activateWithRepository(fixture.repo);
  });

  after(async () => {
    await api.log.model.setFilters({});
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  async function subjects(filters: LogFilters): Promise<string[]> {
    await api.log.model.setFilters(filters);
    return api.log.model.loadedCommits.map((commit) => commit.subject);
  }

  const hasGraph = () =>
    api.log.model.graphRows.some((row) => row.lines.length > 0 || row.width > 1);

  it('lists branches for the branch filter', async () => {
    await api.log.model.setFilters({});
    assert.deepStrictEqual(api.log.model.branches, [
      'feature/login',
      'gone',
      'main',
      'origin/feature/login',
      'origin/main',
    ]);
  });

  it('filters by message text case-insensitively and hides the graph', async () => {
    assert.deepStrictEqual(await subjects({ text: 'LOGIN' }), [
      "Merge branch 'feature/login'",
      'Add login',
    ]);
    assert.strictEqual(hasGraph(), false);
  });

  it('finds a commit by its hash', async () => {
    assert.deepStrictEqual(await subjects({ text: fixture.commits.app.slice(0, 7) }), ['Add app']);
  });

  it('filters by author', async () => {
    assert.deepStrictEqual(await subjects({ author: 'other user' }), ['Remote change']);
  });

  it('filters by branch and keeps the graph', async () => {
    assert.deepStrictEqual(await subjects({ branch: 'feature/login' }), [
      'Add logout',
      'Add login',
      'Add app',
      'Initial commit',
    ]);
    assert.strictEqual(api.log.model.graphRows.length, 4);
    assert.ok(api.log.model.graphRows.every((row) => row.column === 0));
    assert.ok(api.log.model.graphRows[0]!.lines.some((line) => line.kind === 'bottom'));
  });

  it('filters by path', async () => {
    assert.deepStrictEqual(await subjects({ path: 'README.md' }), [
      'Fix typo in README',
      'Initial commit',
    ]);
  });

  it('filters by date', async () => {
    assert.deepStrictEqual(await subjects({ since: 'day' }), []);
    assert.strictEqual((await subjects({})).length, 8);
    assert.strictEqual(hasGraph(), true);
  });
});
