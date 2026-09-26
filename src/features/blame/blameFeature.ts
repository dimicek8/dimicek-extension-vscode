import * as vscode from 'vscode';
import type { RepoManager } from '../../vscode/repoManager';
import { BlameAnnotator } from './blameAnnotator';

export interface BlameFeature {
  annotator: BlameAnnotator;
}

export function registerBlameFeature(
  context: vscode.ExtensionContext,
  repoManager: RepoManager,
  output: vscode.LogOutputChannel,
): BlameFeature {
  const annotator = new BlameAnnotator(repoManager, output);
  context.subscriptions.push(
    annotator,
    vscode.commands.registerCommand('dimicek.blame.toggle', () => annotator.toggle()),
    vscode.commands.registerCommand('dimicek.blame.close', () => annotator.toggle()),
    vscode.commands.registerCommand('dimicek.blame.copyHash', async (hash: string) => {
      await vscode.env.clipboard.writeText(hash);
      vscode.window.setStatusBarMessage(`$(copy) Copied ${hash}`, 3000);
    }),
    vscode.commands.registerCommand('dimicek.blame.showCommitOfLine', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      if (!annotator.isAnnotated(editor.document.uri)) {
        await annotator.annotate(editor.document);
      }
      const commit = annotator.commitAt(editor.document.uri, editor.selection.active.line);
      if (commit && !commit.uncommitted) {
        await vscode.commands.executeCommand('dimicek.log.revealCommit', commit.hash);
      } else if (commit) {
        void vscode.window.showInformationMessage('This line is not committed yet.');
      }
    }),
  );
  return { annotator };
}
