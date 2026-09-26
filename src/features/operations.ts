import * as vscode from 'vscode';
import { GitError, type GitErrorCode } from '../git/gitError';
import type { Repository } from '../git/repository';
import type { ChangesModel } from './commit/changesModel';

const RESOLVE_CONFLICTS = 'Resolve Conflicts…';

export type Choose = (
  message: string,
  detail: string,
  options: string[],
) => Thenable<string | undefined>;

export const modalChoose: Choose = (message, detail, options) =>
  vscode.window.showWarningMessage(message, { modal: true, detail }, ...options);

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const HINTS: Partial<Record<GitErrorCode, string>> = {
  AuthenticationFailed:
    'Authentication failed. For HTTPS remotes set up a Git credential helper (for example Git Credential Manager); for SSH remotes make sure your key is loaded in the SSH agent.',
  NetworkError:
    'Cannot reach the remote repository. Check your network connection and the remote URL.',
  PushRejected:
    'The remote contains commits that you do not have. Update the branch first, or use force push.',
  RepositoryLocked:
    'Another Git process is running in this repository (index.lock exists). Wait for it to finish, or delete the lock file if it was left behind.',
  LocalChangesOverwritten:
    'Your local changes would be overwritten. Commit, stash or roll them back first.',
  Timeout: 'The Git command took too long and was stopped.',
  GitNotFound: 'Git was not found. Install Git or set the "git.path" setting.',
};

export function describeGitError(error: unknown): string {
  if (error instanceof GitError) {
    const hint = HINTS[error.code];
    if (hint) {
      return hint;
    }
  }
  return errorMessage(error);
}

export type OperationProgress = vscode.Progress<{ message?: string }>;

export async function runOperation(
  model: ChangesModel,
  output: vscode.LogOutputChannel,
  title: string,
  operation: (repository: Repository, progress: OperationProgress) => Promise<boolean | void>,
  location: vscode.ProgressLocation = vscode.ProgressLocation.Window,
): Promise<boolean> {
  const repository = model.repository;
  if (!repository) {
    void vscode.window.showWarningMessage('No Git repository is open.');
    return false;
  }
  try {
    const result = await vscode.window.withProgress({ location, title }, (progress) =>
      operation(repository, progress),
    );
    return result !== false;
  } catch (error) {
    output.error(`${title} failed: ${errorMessage(error)}`);
    void vscode.window.showErrorMessage(`${title} failed: ${describeGitError(error)}`);
    return false;
  } finally {
    await model.refresh();
  }
}

export function showConflictWarning(message: string): void {
  void vscode.window
    .showWarningMessage(message, RESOLVE_CONFLICTS)
    .then((choice) =>
      choice === RESOLVE_CONFLICTS
        ? vscode.commands.executeCommand('dimicek.conflicts.resolve')
        : undefined,
    );
}

export async function continueOnConflict(
  operation: () => Promise<void>,
  conflictMessage: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof GitError && error.code === 'Conflict') {
      showConflictWarning(conflictMessage);
      return;
    }
    throw error;
  }
}
