import { relative, sep } from 'node:path';
import * as vscode from 'vscode';
import type { RepoManager } from '../../vscode/repoManager';
import type { BranchOperations } from '../branches/branchOperations';
import type { ChangesModel } from '../commit/changesModel';
import { type CommitContext, LogActions } from './logActions';
import { LogModel } from './logModel';
import { LogViewProvider } from './logViewProvider';

export interface LogFeature {
  model: LogModel;
  view: LogViewProvider;
  actions: LogActions;
}

export function registerLogFeature(
  context: vscode.ExtensionContext,
  repoManager: RepoManager,
  changes: ChangesModel,
  branches: BranchOperations,
  output: vscode.LogOutputChannel,
): LogFeature {
  const model = new LogModel(repoManager, output);
  const view = new LogViewProvider(context.extensionUri, model);
  const actions = new LogActions(changes, model, branches, output);

  const commitCommand = (id: string, run: (hash: string) => unknown) =>
    vscode.commands.registerCommand(id, (target?: CommitContext) =>
      target?.hash ? run(target.hash) : undefined,
    );

  const showHistory = async (uri?: vscode.Uri) => {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    const repository = target ? repoManager.getRepository(target) : repoManager.activeRepository;
    if (!repository) {
      void vscode.window.showWarningMessage('The file is not in a Git repository.');
      return;
    }
    const path = target ? relative(repository.root, target.fsPath).split(sep).join('/') : '';
    await vscode.commands.executeCommand(`${LogViewProvider.viewId}.focus`);
    await model.showHistory(repository, path);
  };

  context.subscriptions.push(
    model,
    view,
    vscode.window.registerWebviewViewProvider(LogViewProvider.viewId, view, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('dimicek.log.show', () =>
      vscode.commands.executeCommand(`${LogViewProvider.viewId}.focus`),
    ),
    vscode.commands.registerCommand('dimicek.log.refresh', () => model.reload()),
    vscode.commands.registerCommand('dimicek.log.showHistory', showHistory),
    vscode.commands.registerCommand(
      'dimicek.log.revealCommit',
      async (target?: string | CommitContext) => {
        const hash = typeof target === 'string' ? target : target?.hash;
        if (hash) {
          await vscode.commands.executeCommand(`${LogViewProvider.viewId}.focus`);
          await view.revealCommit(hash);
        }
      },
    ),
    commitCommand('dimicek.log.copyRevision', (hash) => actions.copyRevision(hash)),
    commitCommand('dimicek.log.newBranch', (hash) => actions.newBranch(hash)),
    commitCommand('dimicek.log.newTag', (hash) => actions.promptNewTag(hash)),
    commitCommand('dimicek.log.checkoutRevision', (hash) => actions.checkoutRevision(hash)),
    commitCommand('dimicek.log.cherryPick', (hash) => actions.cherryPick(hash)),
    commitCommand('dimicek.log.revert', (hash) => actions.revert(hash)),
    commitCommand('dimicek.log.reset', (hash) => actions.promptReset(hash)),
    commitCommand('dimicek.log.compareWithLocal', (hash) => actions.compareWithLocal(hash)),
  );
  void model.reload();
  return { model, view, actions };
}
