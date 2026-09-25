export type NameStatusCode =
  'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'typeChanged';

export interface NameStatusEntry {
  status: NameStatusCode;
  path: string;
  originalPath?: string;
}

const CODES: Record<string, NameStatusCode> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'typeChanged',
};

export function parseNameStatus(output: string): NameStatusEntry[] {
  const fields = output.split('\0');
  const entries: NameStatusEntry[] = [];
  for (let i = 0; i < fields.length; i++) {
    const code = fields[i];
    if (!code) {
      continue;
    }
    const status = CODES[code[0]!];
    if (!status) {
      throw new Error(`Unknown name-status code "${code}"`);
    }
    if (status === 'renamed' || status === 'copied') {
      const originalPath = fields[++i]!;
      const path = fields[++i]!;
      entries.push({ status, path, originalPath });
    } else {
      entries.push({ status, path: fields[++i]! });
    }
  }
  return entries;
}
