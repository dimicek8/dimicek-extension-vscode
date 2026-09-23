import * as vscode from 'vscode';
import { findGit, Git } from '../git/gitExec';

function configuredGitPaths(): string[] {
  const value = vscode.workspace.getConfiguration('git').get<string | string[] | null>('path');
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export async function createGit(
  output: vscode.LogOutputChannel,
  preferredPath?: string,
): Promise<Git> {
  const installation = await findGit([preferredPath, ...configuredGitPaths()]);
  output.info(`Using git ${installation.version} from ${installation.path}`);
  return new Git(installation, output);
}
