/**
 * Typed messages exchanged between the extension host and webviews.
 * Shared by both sides — keep this file free of runtime dependencies.
 */

/** Messages sent from the extension to a webview. */
export type ExtensionMessage =
  { type: 'init'; extensionVersion: string } | { type: 'helloReply'; text: string };

/** Messages sent from a webview to the extension. */
export type WebviewMessage = { type: 'ready' } | { type: 'sayHello'; name: string };
