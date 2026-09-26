import { stat } from 'node:fs/promises';
import { basename, relative, sep } from 'node:path';
import * as vscode from 'vscode';
import type { FileRevision } from '../../git/parsers/fileRevisions';
import type { Repository } from '../../git/repository';
import { toGitUri } from '../../vscode/gitContentProvider';
import type { RepoManager } from '../../vscode/repoManager';
import { showFileComparison, WORKING_TREE } from '../fileComparison';
import { errorMessage } from '../operations';

interface CompareTarget {
  repository: Repository;
  uri: vscode.Uri;
  path: string;
  directory: boolean;
}

function short(hash: string): string {
  return hash.slice(0, 8);
}

export class CompareActions {
  constructor(
    private readonly repoManager: RepoManager,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  private async target(uri?: vscode.Uri): Promise<CompareTarget | undefined> {
    const resolved = uri ?? vscode.window.activeTextEditor?.document.uri;
    const repository = resolved ? this.repoManager.getRepository(resolved) : undefined;
    if (!resolved || !repository) {
      void vscode.window.showWarningMessage('Select a file or folder inside a Git repository.');
      return undefined;
    }
    const path = relative(repository.root, resolved.fsPath).split(sep).join('/');
    const directory = await stat(resolved.fsPath).then(
      (stats) => stats.isDirectory(),
      () => false,
    );
    return { repository, uri: resolved, path, directory };
  }

  private async compareDirectory(
    target: CompareTarget,
    revision: string,
    label: string,
  ): Promise<void> {
    const files = await target.repository.diffWithWorkingTree(
      revision,
      target.path ? [target.path] : [],
    );
    const scope = target.path || basename(target.repository.root);
    if (files.length === 0) {
      void vscode.window.showInformationMessage(`'${scope}' has the same content as in ${label}.`);
      return;
    }
    showFileComparison({
      root: target.repository.root,
      title: `Compare '${scope}' with ${label} — ${files.length} files differ`,
      left: revision,
      right: WORKING_TREE,
      files,
    });
  }

  private async compareFile(
    target: CompareTarget,
    revision: string,
    pathAtRevision: string,
    label: string,
  ): Promise<boolean> {
    if (!(await target.repository.pathExistsAt(revision, pathAtRevision))) {
      void vscode.window.showInformationMessage(`'${pathAtRevision}' does not exist in ${label}.`);
      return false;
    }
    await vscode.commands.executeCommand(
      'vscode.diff',
      toGitUri(target.repository.root, pathAtRevision, revision),
      target.uri,
      `${basename(target.path)} (${label} ↔ Working Tree)`,
      { preview: true },
    );
    return true;
  }

  private async pickBranch(repository: Repository): Promise<string | undefined> {
    const refs = (await repository.getRefs()).filter(
      (ref) => ref.type === 'branch' || ref.type === 'remoteBranch',
    );
    const picked = await vscode.window.showQuickPick(
      refs.map((ref) => ({
        label: ref.name,
        description: ref.type === 'branch' && ref.isHead ? 'current' : undefined,
        iconPath: new vscode.ThemeIcon(ref.type === 'branch' ? 'git-branch' : 'cloud'),
      })),
      { title: 'Compare with Branch', placeHolder: 'Choose a branch' },
    );
    return picked?.label;
  }

  async withBranch(uri?: vscode.Uri, branch?: string): Promise<boolean> {
    const target = await this.target(uri);
    if (!target) {
      return false;
    }
    try {
      const chosen = branch ?? (await this.pickBranch(target.repository));
      if (!chosen) {
        return false;
      }
      if (target.directory) {
        await this.compareDirectory(target, chosen, `'${chosen}'`);
        return true;
      }
      return await this.compareFile(target, chosen, target.path, `'${chosen}'`);
    } catch (error) {
      this.output.error(`Compare with branch failed: ${errorMessage(error)}`);
      void vscode.window.showErrorMessage(`Compare with branch failed: ${errorMessage(error)}`);
      return false;
    }
  }

  private async pickRevision(
    items: ReadonlyArray<{ hash: string; subject: string; author: string; date: Date }>,
  ): Promise<string | undefined> {
    const picked = await vscode.window.showQuickPick(
      items.map((item) => ({
        label: item.subject,
        description: `${short(item.hash)} · ${item.author} · ${item.date.toLocaleString()}`,
        hash: item.hash,
      })),
      {
        title: 'Compare with Revision',
        placeHolder: 'Choose a revision',
        matchOnDescription: true,
      },
    );
    return picked?.hash;
  }

  async withRevision(uri?: vscode.Uri, revision?: string): Promise<boolean> {
    const target = await this.target(uri);
    if (!target) {
      return false;
    }
    try {
      if (target.directory) {
        const commits = await target.repository.getLog({
          revisions: ['HEAD'],
          paths: target.path ? [target.path] : [],
          maxCount: 500,
        });
        const chosen =
          revision ??
          (await this.pickRevision(
            commits.map((commit) => ({
              hash: commit.hash,
              subject: commit.subject,
              author: commit.author.name,
              date: commit.authorDate,
            })),
          ));
        if (!chosen) {
          return false;
        }
        await this.compareDirectory(target, chosen, short(chosen));
        return true;
      }
      const revisions: FileRevision[] = await target.repository.getFileRevisions(target.path);
      const chosen = revision ?? (await this.pickRevision(revisions));
      if (!chosen) {
        return false;
      }
      const pathAtRevision =
        revisions.find((candidate) => candidate.hash === chosen)?.path ?? target.path;
      return await this.compareFile(target, chosen, pathAtRevision, short(chosen));
    } catch (error) {
      this.output.error(`Compare with revision failed: ${errorMessage(error)}`);
      void vscode.window.showErrorMessage(`Compare with revision failed: ${errorMessage(error)}`);
      return false;
    }
  }
}
