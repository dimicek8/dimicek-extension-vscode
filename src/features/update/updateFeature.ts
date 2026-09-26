import * as vscode from 'vscode';
import type { ChangesModel } from '../commit/changesModel';
import { UpdateProject } from './updateProject';

export interface UpdateFeature {
  update: UpdateProject;
}

export function registerUpdateFeature(
  context: vscode.ExtensionContext,
  model: ChangesModel,
  output: vscode.LogOutputChannel,
): UpdateFeature {
  const update = new UpdateProject(model, output);
  context.subscriptions.push(
    vscode.commands.registerCommand('dimicek.update.project', () => update.run()),
  );
  return { update };
}
