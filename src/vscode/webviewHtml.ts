import * as vscode from 'vscode';
import { getNonce } from '../shared/nonce';

/** Folder with the Vite build output, relative to the extension root. */
const WEBVIEW_DIST = ['dist', 'webview'];

export function webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, ...WEBVIEW_DIST)],
  };
}

/**
 * HTML shell for a React webview built by Vite. `entry` is the Vite entry name,
 * which produces `dist/webview/<entry>.js` and `dist/webview/<entry>.css`.
 */
export function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  entry: string,
  title: string,
): string {
  const asset = (file: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...WEBVIEW_DIST, file));
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${asset(`${entry}.css`)}">
  <title>${title}</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${asset(`${entry}.js`)}"></script>
</body>
</html>`;
}
