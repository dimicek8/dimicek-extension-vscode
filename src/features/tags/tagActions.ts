import * as vscode from 'vscode';
import type { Repository } from '../../git/repository';
import type { ChangesModel } from '../commit/changesModel';
import { type Choose, modalChoose, runOperation } from '../operations';

const DELETE_LOCAL = 'Delete Locally';
const DELETE_EVERYWHERE = 'Delete Locally and on Remote';

export class TagActions {
  choose: Choose = modalChoose;
  pickRemote: (remotes: string[]) => Thenable<string | undefined> = (remotes) =>
    vscode.window.showQuickPick(remotes, { title: 'Choose a remote' });

  constructor(
    private readonly model: ChangesModel,
    private readonly output: vscode.LogOutputChannel,
  ) {}

  private async remote(repository: Repository): Promise<string | undefined> {
    const remotes = await repository.getRemotes();
    if (remotes.length === 0) {
      void vscode.window.showWarningMessage('This repository has no remote.');
      return undefined;
    }
    return remotes.length === 1 ? remotes[0] : this.pickRemote(remotes);
  }

  private async localTags(repository: Repository): Promise<string[]> {
    return (await repository.getRefs())
      .filter((ref) => ref.type === 'tag')
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((ref) => ref.name);
  }

  async push(names: readonly string[]): Promise<boolean> {
    const repository = this.model.repository;
    if (!repository || names.length === 0) {
      return false;
    }
    const remote = await this.remote(repository);
    if (!remote) {
      return false;
    }
    const label = names.length === 1 ? `tag ${names[0]}` : `${names.length} tags`;
    return runOperation(
      this.model,
      this.output,
      `Pushing ${label} to ${remote}…`,
      async (current) => {
        await current.pushTags(remote, names);
        vscode.window.setStatusBarMessage(`$(check) Pushed ${label} to ${remote}`, 5000);
      },
      vscode.ProgressLocation.Notification,
    );
  }

  async promptPush(): Promise<boolean> {
    const repository = this.model.repository;
    if (!repository) {
      return false;
    }
    const tags = await this.localTags(repository);
    if (tags.length === 0) {
      void vscode.window.showInformationMessage('There are no tags to push.');
      return false;
    }
    const picked = await vscode.window.showQuickPick(
      tags.map((name) => ({ label: name, iconPath: new vscode.ThemeIcon('tag') })),
      { title: 'Push Tags', placeHolder: 'Choose tags to push', canPickMany: true },
    );
    return picked && picked.length > 0 ? this.push(picked.map((item) => item.label)) : false;
  }

  async delete(name: string): Promise<boolean> {
    const repository = this.model.repository;
    if (!repository) {
      return false;
    }
    const choice = await this.choose(
      `Delete tag '${name}'?`,
      'The tag can be deleted only here or also on the remote, where others may already use it.',
      [DELETE_LOCAL, DELETE_EVERYWHERE],
    );
    if (choice !== DELETE_LOCAL && choice !== DELETE_EVERYWHERE) {
      return false;
    }
    const remote = choice === DELETE_EVERYWHERE ? await this.remote(repository) : undefined;
    if (choice === DELETE_EVERYWHERE && !remote) {
      return false;
    }
    return runOperation(this.model, this.output, `Deleting tag ${name}…`, async (current) => {
      if (remote) {
        await current.deleteRemoteTag(remote, name);
      }
      await current.deleteTag(name);
      vscode.window.setStatusBarMessage(`$(check) Deleted tag ${name}`, 5000);
    });
  }

  async promptDelete(): Promise<boolean> {
    const repository = this.model.repository;
    if (!repository) {
      return false;
    }
    const tags = await this.localTags(repository);
    const picked = await vscode.window.showQuickPick(
      tags.map((name) => ({ label: name, iconPath: new vscode.ThemeIcon('tag') })),
      { title: 'Delete Tag', placeHolder: 'Choose a tag to delete' },
    );
    return picked ? this.delete(picked.label) : false;
  }
}
