interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

export interface Messenger<Outgoing, Incoming> {
  post(message: Outgoing): void;
  onMessage(handler: (message: Incoming) => void): () => void;
}

export function createMessenger<Outgoing, Incoming>(): Messenger<Outgoing, Incoming> {
  return {
    post: (message) => api.postMessage(message),
    onMessage: (handler) => {
      const listener = (event: MessageEvent<Incoming>) => handler(event.data);
      window.addEventListener('message', listener);
      return () => window.removeEventListener('message', listener);
    },
  };
}

export function loadState<T>(): T | undefined {
  return api.getState() as T | undefined;
}

export function saveState<T>(state: T): void {
  api.setState(state);
}
