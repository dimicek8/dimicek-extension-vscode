import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { OperationState } from '../../git/repository';
import type { ChangesModel } from '../commit/changesModel';
import { statusBarText, statusBarTooltip } from './branchLabels';

export class BranchStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    'dimicek.branch',
    vscode.StatusBarAlignment.Left,
    100,
  );
  private readonly subscription: vscode.Disposable;
  private version = 0;

  constructor(private readonly model: ChangesModel) {
    this.item.name = 'Dimicek: Current Branch';
    this.item.command = 'dimicek.branches.show';
    this.subscription = model.onDidChange(() => void this.update());
  }

  get text(): string {
    return this.item.text;
  }

  get visible(): boolean {
    return this.model.repository !== undefined;
  }

  async update(): Promise<void> {
    const version = ++this.version;
    const repository = this.model.repository;
    if (!repository) {
      this.item.hide();
      return;
    }
    const operation: OperationState | undefined = await repository
      .getOperationState()
      .catch(() => undefined);
    if (version !== this.version) {
      return;
    }
    const branch = this.model.branch;
    this.item.text = statusBarText(branch, operation);
    this.item.tooltip = statusBarTooltip(basename(repository.root), branch, operation);
    this.item.show();
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }
}
