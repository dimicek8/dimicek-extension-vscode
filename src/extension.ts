import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Dimicek', { log: true });
  context.subscriptions.push(output);
  output.info('Dimicek activated');

  context.subscriptions.push(
    vscode.commands.registerCommand('dimicek.hello', () => {
      output.info('Hello command executed');
      void vscode.window.showInformationMessage('Hello from Dimicek!');
    }),
  );
}

export function deactivate(): void {}
