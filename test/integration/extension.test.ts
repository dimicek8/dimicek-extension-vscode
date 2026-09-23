import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { activateExtension, EXTENSION_ID, waitFor } from './helpers';

describe('Extension', () => {
  it('activates when the hello command runs', async () => {
    await vscode.commands.executeCommand('dimicek.hello');
    assert.strictEqual(vscode.extensions.getExtension(EXTENSION_ID)?.isActive, true);
  });

  it('registers its commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('dimicek.hello'));
  });

  it('loads the React webview in the demo view', async () => {
    const { demoView } = await activateExtension();
    const ready = waitFor(demoView.onDidBecomeReady);
    await vscode.commands.executeCommand('dimicek.demo.focus');
    await ready;
  });
});
