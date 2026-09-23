import { join } from 'node:path';
import * as vscode from 'vscode';
import type { RepoManager } from './repoManager';

export const GIT_SCHEME = 'dimicek-git';

interface GitUriParams {
  root: string;
  path: string;
  ref: string;
}

export function toGitUri(root: string, path: string, ref: string): vscode.Uri {
  const params: GitUriParams = { root, path, ref };
  return vscode.Uri.file(join(root, path)).with({
    scheme: GIT_SCHEME,
    query: JSON.stringify(params),
  });
}

export function toEmptyUri(root: string, path: string): vscode.Uri {
  return toGitUri(root, path, '');
}

function parseGitUri(uri: vscode.Uri): GitUriParams {
  return JSON.parse(uri.query) as GitUriParams;
}

export class GitContentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changeEmitter.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly repoManager: RepoManager) {
    this.subscription = repoManager.onDidChangeRepository((repository) => {
      for (const document of vscode.workspace.textDocuments) {
        if (
          document.uri.scheme === GIT_SCHEME &&
          parseGitUri(document.uri).root === repository.root
        ) {
          this.changeEmitter.fire(document.uri);
        }
      }
    });
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const { root, path, ref } = parseGitUri(uri);
    if (ref === '') {
      return '';
    }
    const repository = this.repoManager.getRepository(vscode.Uri.file(root));
    if (!repository) {
      throw new Error(`No repository found at ${root}`);
    }
    return repository.getFileContent(ref, path);
  }

  dispose(): void {
    this.subscription.dispose();
    this.changeEmitter.dispose();
  }
}
