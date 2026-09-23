import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { DimicekApi } from '../../src/extension';

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
