import type { Event, Uri } from 'vscode';

export type GitApiState = 'uninitialized' | 'initialized';

export interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): GitApi;
}

export interface GitApi {
  readonly state: GitApiState;
  readonly onDidChangeState: Event<GitApiState>;
  readonly git: { readonly path: string };
  readonly repositories: GitApiRepository[];
  readonly onDidOpenRepository: Event<GitApiRepository>;
  readonly onDidCloseRepository: Event<GitApiRepository>;
  openRepository(root: Uri): Promise<GitApiRepository | null>;
}

export interface GitApiRepository {
  readonly rootUri: Uri;
  readonly state: { readonly onDidChange: Event<void> };
}
