export type RebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop';

export interface RebaseEntry {
  hash: string;
  action: RebaseAction;
  message?: string;
}

export function quotePath(path: string): string {
  return `"${path.replace(/\\/g, '/').replace(/"/g, '\\"')}"`;
}

export function validateRebaseEntries(entries: readonly RebaseEntry[]): string | undefined {
  const first = entries.find((entry) => entry.action !== 'drop');
  if (first && (first.action === 'squash' || first.action === 'fixup')) {
    return 'The first commit that is kept cannot be squashed or fixed up — there is no earlier commit to combine it with.';
  }
  const emptyReword = entries.find(
    (entry) => entry.action === 'reword' && !(entry.message ?? '').trim(),
  );
  if (emptyReword) {
    return `Enter a message for the reworded commit ${emptyReword.hash.slice(0, 8)}.`;
  }
  return undefined;
}

export function buildRebaseTodo(
  entries: readonly RebaseEntry[],
  messageFile: (hash: string) => string,
): string {
  const lines: string[] = [];
  for (const entry of entries) {
    switch (entry.action) {
      case 'reword':
        lines.push(`pick ${entry.hash}`);
        lines.push(
          `exec git commit --amend --quiet --allow-empty --no-verify --file ${quotePath(messageFile(entry.hash))}`,
        );
        break;
      default:
        lines.push(`${entry.action} ${entry.hash}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
