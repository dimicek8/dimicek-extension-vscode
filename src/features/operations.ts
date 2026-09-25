import * as vscode from 'vscode';
import { GitError } from '../git/gitError';
import type { Repository } from '../git/repository';
import type { ChangesModel } from './commit/changesModel';

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

export async function runOperation(
  model: ChangesModel,
  output: vscode.LogOutputChannel,
  title: string,
  operation: (repository: Repository) => Promise<boolean | void>,
): Promise<boolean> {
  const repository = model.repository;
  if (!repository) {
    void vscode.window.showWarningMessage('No Git repository is open.');
    return false;
  }
  try {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title },
      () => operation(repository),
    );
    return result !== false;
  } catch (error) {
    output.error(`${title} failed: ${errorMessage(error)}`);
    void vscode.window.showErrorMessage(`${title} failed: ${errorMessage(error)}`);
    return false;
  } finally {
    await model.refresh();
  }
}

export async function continueOnConflict(
  operation: () => Promise<void>,
  conflictMessage: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof GitError && error.code === 'Conflict') {
      void vscode.window.showWarningMessage(conflictMessage);
      return;
    }
    throw error;
  }
}
