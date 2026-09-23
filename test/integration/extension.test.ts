import * as assert from 'node:assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'dimicek.dimicek';

describe('Extension', () => {
  it('is present', () => {
    assert.ok(vscode.extensions.getExtension(EXTENSION_ID));
  });

  it('activates when the hello command runs', async () => {
    await vscode.commands.executeCommand('dimicek.hello');
    assert.strictEqual(vscode.extensions.getExtension(EXTENSION_ID)?.isActive, true);
  });

  it('registers its commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('dimicek.hello'));
  });
});
