import type { ExtensionMessage, WebviewMessage } from '../../src/shared/protocol';

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/** Must be acquired exactly once per webview. */
const api = acquireVsCodeApi();

export function postMessage(message: WebviewMessage): void {
  api.postMessage(message);
}

/** Subscribes to messages from the extension; returns an unsubscribe function. */
export function onMessage(handler: (message: ExtensionMessage) => void): () => void {
  const listener = (event: MessageEvent<ExtensionMessage>) => handler(event.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
