import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { activateExtension, EXTENSION_ID } from './helpers';

describe('Extension', () => {
  it('activates and initializes its features', async () => {
    const api = await activateExtension();
    assert.strictEqual(vscode.extensions.getExtension(EXTENSION_ID)?.isActive, true);
    assert.ok(api.repoManager);
    assert.ok(api.commit);
  });

  it('registers its commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'dimicek.changes.refresh',
      'dimicek.changes.showDiff',
      'dimicek.changes.groupByDirectory',
      'dimicek.changes.showFlat',
    ]) {
      assert.ok(commands.includes(command), `${command} is not registered`);
    }
  });
});
