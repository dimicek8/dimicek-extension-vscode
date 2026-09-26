import * as assert from 'node:assert';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { LogToWebview } from '../../src/shared/protocol';
import { createHistoryRepo, type HistoryRepo } from '../fixtures/testRepo';
import { activateWithRepository, eventually, type ReadyApi, waitFor } from './helpers';

describe('Git Blame annotations', () => {
  let api: ReadyApi;
  let fixture: HistoryRepo;
  let editor: vscode.TextEditor;

  before(async () => {
    fixture = createHistoryRepo();
    fixture.repo.commit('Extend readme', { 'README.md': '# Test project\n\nMore details.\n' });
    api = await activateWithRepository(fixture.repo);
    editor = await vscode.window.showTextDocument(
      vscode.Uri.file(join(fixture.repo.root, 'README.md')),
    );
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fixture?.repo.dispose();
  });

  const texts = () =>
    api.blame.annotator.labelsFor(editor.document.uri)!.map((label) => label.text.trimEnd());

  it('annotates each block of lines with date and author', async () => {
    assert.ok(await vscode.commands.executeCommand('dimicek.blame.toggle'));
    const labels = api.blame.annotator.labelsFor(editor.document.uri)!;
    assert.deepStrictEqual(
      labels.map((label) => label.hash === fixture.commits.typo),
      [true, false, false],
    );
    assert.match(texts()[0]!, /^\d{4}-\d{2}-\d{2} Test User$/);
    assert.match(texts()[1]!, /^\d{4}-\d{2}-\d{2} Test User$/);
    assert.strictEqual(texts()[2], '');
  });

  it('marks unsaved new lines as not committed yet', async () => {
    await editor.edit((edit) => edit.insert(new vscode.Position(3, 0), 'Unsaved line\n'));
    await eventually(() => texts()[3] === 'Not committed yet');
  });

  it('reveals the commit of the current line in the Git Log', async () => {
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    const selected = waitFor(
      api.log.view.onDidPost,
      (message: LogToWebview) => message.type === 'select' && message.hash === fixture.commits.typo,
    );
    await vscode.commands.executeCommand('dimicek.blame.showCommitOfLine');
    await selected;
  });

  it('closes the annotations', async () => {
    await vscode.window.showTextDocument(editor.document);
    assert.strictEqual(await vscode.commands.executeCommand('dimicek.blame.close'), false);
    assert.strictEqual(api.blame.annotator.isAnnotated(editor.document.uri), false);
  });
});
