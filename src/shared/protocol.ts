export type ExtensionMessage =
  { type: 'init'; extensionVersion: string } | { type: 'helloReply'; text: string };

export type WebviewMessage = { type: 'ready' } | { type: 'sayHello'; name: string };
