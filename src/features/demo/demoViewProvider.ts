import * as vscode from 'vscode';
import type { ExtensionMessage, WebviewMessage } from '../../shared/protocol';
import { buildWebviewHtml, webviewOptions } from '../../vscode/webviewHtml';

/** Temporary sample view proving the extension ⇄ React webview round trip. */
export class DemoViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'dimicek.demo';

  private readonly readyEmitter = new vscode.EventEmitter<void>();
  /** Fires when the webview script has loaded and sent its `ready` message. */
  readonly onDidBecomeReady = this.readyEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    const { webview } = view;
    webview.options = webviewOptions(this.context.extensionUri);
    webview.html = buildWebviewHtml(webview, this.context.extensionUri, 'demo', 'Dimicek');

    const post = (message: ExtensionMessage) => webview.postMessage(message);

    view.onDidDispose(
      webview.onDidReceiveMessage((message: WebviewMessage) => {
        switch (message.type) {
          case 'ready':
            void post({
              type: 'init',
              extensionVersion: String(this.context.extension.packageJSON.version),
            });
            this.readyEmitter.fire();
            break;
          case 'sayHello': {
            const text = `Hello, ${message.name || 'stranger'}!`;
            this.output.info(`Webview says hello as "${message.name}"`);
            void vscode.window.showInformationMessage(text);
            void post({ type: 'helloReply', text });
            break;
          }
        }
      }).dispose,
    );
  }

  dispose(): void {
    this.readyEmitter.dispose();
  }
}
