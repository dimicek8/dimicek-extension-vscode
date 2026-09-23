import type { Memento } from 'vscode';

const STORAGE_KEY = 'dimicek.commitMessageHistory';
const MAX_MESSAGES = 20;

export class CommitMessageHistory {
  constructor(private readonly storage: Memento) {}

  list(): string[] {
    return this.storage.get<string[]>(STORAGE_KEY, []);
  }

  async add(message: string): Promise<void> {
    const messages = [message, ...this.list().filter((existing) => existing !== message)];
    await this.storage.update(STORAGE_KEY, messages.slice(0, MAX_MESSAGES));
  }
}
