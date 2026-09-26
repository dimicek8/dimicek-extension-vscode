import * as assert from 'node:assert';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { LogToWebview } from '../../src/shared/protocol';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, type ReadyApi, waitFor } from './helpers';

describe('Show History', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;

  before(async () => {
    fixture = createHistoryRepo();
    fixture.repo.git('mv', 'src/login.ts', 'src/auth.ts');
    fixture.repo.commit('Rename login');
    api = await activateWithRepository(fixture.repo);
  });

  after(async () => {
    await api.log.model.setFilters({});
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  const subjects = () => api.log.model.loadedCommits.map((commit) => commit.subject);

  it('shows the history of a file across renames on the current branch', async () => {
    const version = api.log.model.filtersVersion;
    const reset = waitFor(
      api.log.view.onDidPost,
      (message: LogToWebview) => message.type === 'reset' && message.filtersVersion > version,
    );
    await vscode.commands.executeCommand(
      'dimicek.log.showHistory',
      vscode.Uri.file(join(fixture.repo.root, 'src', 'auth.ts')),
    );
    const message = await reset;

    assert.ok(message.type === 'reset');
    assert.deepStrictEqual(message.filters, { path: 'src/auth.ts', branch: 'HEAD' });
    assert.deepStrictEqual(subjects(), ['Rename login', 'Add login']);
  });

  it('shows the history of a folder', async () => {
    await vscode.commands.executeCommand(
      'dimicek.log.showHistory',
      vscode.Uri.file(join(fixture.repo.root, 'src')),
    );
    assert.deepStrictEqual(subjects(), ['Rename login', 'Add logout', 'Add login', 'Add app']);
  });

  it('uses the active editor when no file is given', async () => {
    await vscode.window.showTextDocument(vscode.Uri.file(join(fixture.repo.root, 'README.md')));
    await vscode.commands.executeCommand('dimicek.log.showHistory');
    assert.deepStrictEqual(api.log.model.filters, { path: 'README.md', branch: 'HEAD' });
    assert.deepStrictEqual(subjects(), ['Fix typo in README', 'Initial commit']);
  });
});
