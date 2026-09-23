import { describe, expect, it } from 'vitest';
import { getNonce } from '../../src/shared/nonce';

describe('getNonce', () => {
  it('returns a URL-safe base64 string of 128 bits', () => {
    expect(getNonce()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('returns a different value each time', () => {
    const values = new Set(Array.from({ length: 100 }, getNonce));
    expect(values.size).toBe(100);
  });
});
