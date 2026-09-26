import * as vscode from 'vscode';
import type { ChangesModel } from '../commit/changesModel';
import { TagActions } from './tagActions';

export interface TagsFeature {
  actions: TagActions;
}

export function registerTagsFeature(
  context: vscode.ExtensionContext,
  model: ChangesModel,
  output: vscode.LogOutputChannel,
): TagsFeature {
  const actions = new TagActions(model, output);
  context.subscriptions.push(
    vscode.commands.registerCommand('dimicek.tags.push', () => actions.promptPush()),
    vscode.commands.registerCommand('dimicek.tags.delete', () => actions.promptDelete()),
    vscode.commands.registerCommand('dimicek.tags.pushOne', (target?: { tag?: string }) =>
      target?.tag ? actions.push([target.tag]) : undefined,
    ),
    vscode.commands.registerCommand('dimicek.tags.deleteOne', (target?: { tag?: string }) =>
      target?.tag ? actions.delete(target.tag) : undefined,
    ),
  );
  return { actions };
}
