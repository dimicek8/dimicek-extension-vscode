import * as assert from 'node:assert';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { DimicekApi } from '../../src/extension';
import type { TestRepo } from '../fixtures/testRepo';

export const EXTENSION_ID = 'dimicek.dimicek';

export async function activateExtension(): Promise<DimicekApi> {
  const extension = vscode.extensions.getExtension<DimicekApi>(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} is not installed`);
  return extension.activate();
}

export function waitFor<T>(
  event: vscode.Event<T>,
  predicate: (value: T) => boolean = () => true,
  timeoutMs = 10_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`Event not fired within ${timeoutMs}ms`));
    }, timeoutMs);
    const subscription = event((value) => {
      if (predicate(value)) {
        clearTimeout(timer);
        subscription.dispose();
        resolve(value);
      }
    });
  });
}

export async function waitUntil<T>(
  check: () => T | undefined,
  event: vscode.Event<unknown>,
  timeoutMs = 10_000,
): Promise<T> {
  const current = check();
  if (current !== undefined) {
    return current;
  }
  await waitFor(event, () => check() !== undefined, timeoutMs);
  return check()!;
}

export type ReadyApi = { [K in keyof DimicekApi]-?: NonNullable<DimicekApi[K]> };

export async function activateWithRepository(repo: TestRepo): Promise<ReadyApi> {
  const api = await activateExtension();
  assert.ok(api.repoManager && api.commit && api.branches, 'Extension failed to initialize');
  const { repoManager, commit } = api;
  const rootUri = vscode.Uri.file(repo.root);
  await repoManager.gitApi.openRepository(rootUri);
  await waitUntil(() => repoManager.getRepository(rootUri), repoManager.onDidChangeRepositories);
  await vscode.window.showTextDocument(vscode.Uri.file(join(repo.root, 'README.md')));
  await waitUntil(
    () => (commit.model.repository?.root === rootUri.fsPath ? true : undefined),
    commit.model.onDidChange,
  );
  return api as ReadyApi;
}
