import { randomBytes } from 'node:crypto';

/** Random value for the Content-Security-Policy `nonce-…` source of a webview. */
export function getNonce(): string {
  return randomBytes(16).toString('base64url');
}
