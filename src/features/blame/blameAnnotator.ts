import { relative, sep } from 'node:path';
import * as vscode from 'vscode';
import type { BlameCommit, BlameLine } from '../../git/parsers/blame';
import type { RepoManager } from '../../vscode/repoManager';
import { errorMessage } from '../operations';
import { type BlameLabel, blameLabels } from './blameLabels';

const REFRESH_DELAY_MS = 500;
const CONTEXT_KEY = 'dimicek.blameActive';

interface Annotation {
  lines: BlameLine[];
  labels: BlameLabel[];
}

function commandLink(command: string, hash: string): string {
  return `command:${command}?${encodeURIComponent(JSON.stringify([hash]))}`;
}

function hover(commit: BlameCommit): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.isTrusted = { enabledCommands: ['dimicek.log.revealCommit', 'dimicek.blame.copyHash'] };
  if (commit.uncommitted) {
    markdown.appendMarkdown('**Not committed yet**');
    return markdown;
  }
  markdown.appendMarkdown(`**${commit.summary.replace(/[\\`*_[\]]/g, '\\$&')}**\n\n`);
  markdown.appendText(
    `${commit.author} <${commit.authorEmail}>, ${commit.authorTime.toLocaleString()}`,
  );
  markdown.appendMarkdown(
    `\n\n$(git-commit) \`${commit.hash.slice(0, 8)}\` · [Show in Git Log](${commandLink('dimicek.log.revealCommit', commit.hash)}) · [Copy Hash](${commandLink('dimicek.blame.copyHash', commit.hash)})`,
  );
  return markdown;
}

export class BlameAnnotator implements vscode.Disposable {
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    before: {
      color: new vscode.ThemeColor('editorCodeLens.foreground'),
      margin: '0 1.5em 0 0',
    },
  });
  private readonly annotations = new Map<string, Annotation>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly disposables: vscode.Disposable[];

  constructor(
    private readonly repoManager: RepoManager,
    private readonly output: vscode.LogOutputChannel,
  ) {
    this.disposables = [
      this.decoration,
      vscode.window.onDidChangeVisibleTextEditors(() => this.applyToVisibleEditors()),
      vscode.window.onDidChangeActiveTextEditor(() => void this.updateContext()),
      vscode.workspace.onDidChangeTextDocument((event) => this.scheduleRefresh(event.document)),
      vscode.workspace.onDidSaveTextDocument((document) => this.scheduleRefresh(document, 0)),
      vscode.workspace.onDidCloseTextDocument((document) => this.forget(document.uri)),
    ];
  }

  isAnnotated(uri: vscode.Uri): boolean {
    return this.annotations.has(uri.toString());
  }

  labelsFor(uri: vscode.Uri): readonly BlameLabel[] | undefined {
    return this.annotations.get(uri.toString())?.labels;
  }

  commitAt(uri: vscode.Uri, line: number): BlameCommit | undefined {
    return this.annotations.get(uri.toString())?.lines.find((entry) => entry.line === line)?.commit;
  }

  async toggle(editor = vscode.window.activeTextEditor): Promise<boolean> {
    if (!editor) {
      return false;
    }
    if (this.isAnnotated(editor.document.uri)) {
      this.forget(editor.document.uri);
      return false;
    }
    return this.annotate(editor.document);
  }

  async annotate(document: vscode.TextDocument): Promise<boolean> {
    const repository = this.repoManager.getRepository(document.uri);
    if (!repository) {
      void vscode.window.showWarningMessage('The file is not in a Git repository.');
      return false;
    }
    const path = relative(repository.root, document.uri.fsPath).split(sep).join('/');
    try {
      const lines = await repository.blame(path, document.isDirty ? document.getText() : undefined);
      this.annotations.set(document.uri.toString(), { lines, labels: blameLabels(lines) });
    } catch (error) {
      this.output.warn(`Blame of ${path} failed: ${errorMessage(error)}`);
      void vscode.window.showWarningMessage(
        `Cannot annotate '${path}'. Only files committed to Git can be annotated.`,
      );
      return false;
    }
    this.applyToVisibleEditors();
    await this.updateContext();
    return true;
  }

  private scheduleRefresh(document: vscode.TextDocument, delay = REFRESH_DELAY_MS): void {
    const key = document.uri.toString();
    if (!this.annotations.has(key)) {
      return;
    }
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        if (this.annotations.has(key)) {
          void this.annotate(document);
        }
      }, delay),
    );
  }

  private applyToVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const annotation = this.annotations.get(editor.document.uri.toString());
      if (!annotation) {
        continue;
      }
      const commits = new Map(annotation.lines.map((entry) => [entry.line, entry.commit]));
      editor.setDecorations(
        this.decoration,
        annotation.labels
          .filter((label) => label.line < editor.document.lineCount)
          .map((label) => {
            const commit = commits.get(label.line)!;
            return {
              range: new vscode.Range(label.line, 0, label.line, 0),
              hoverMessage: label.first ? hover(commit) : undefined,
              renderOptions: { before: { contentText: label.text } },
            };
          }),
      );
    }
  }

  private forget(uri: vscode.Uri): void {
    const key = uri.toString();
    if (!this.annotations.delete(key)) {
      return;
    }
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() === key) {
        editor.setDecorations(this.decoration, []);
      }
    }
    void this.updateContext();
  }

  private updateContext(): Thenable<unknown> {
    const uri = vscode.window.activeTextEditor?.document.uri;
    return vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEY,
      uri !== undefined && this.isAnnotated(uri),
    );
  }

  dispose(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.disposables.forEach((disposable) => disposable.dispose());
  }
}
