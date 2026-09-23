import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { DimicekApi } from '../../src/extension';

const EXTENSION_ID = 'dimicek.dimicek';

async function activateExtension(): Promise<DimicekApi> {
  const extension = vscode.extensions.getExtension<DimicekApi>(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} is not installed`);
  return extension.activate();
}

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
    const ready = new Promise<void>((resolve) => {
      const subscription = demoView.onDidBecomeReady(() => {
        subscription.dispose();
        resolve();
      });
    });
    await vscode.commands.executeCommand('dimicek.demo.focus');
    await ready;
  });
});
