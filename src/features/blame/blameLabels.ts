import type { BlameLine } from '../../git/parsers/blame';

export const LABEL_WIDTH = 30;

function pad(text: string): string {
  const trimmed = text.length > LABEL_WIDTH ? `${text.slice(0, LABEL_WIDTH - 1)}…` : text;
  return trimmed.padEnd(LABEL_WIDTH, ' ');
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export interface BlameLabel {
  line: number;
  text: string;
  hash: string;
  first: boolean;
}

export function blameLabels(lines: readonly BlameLine[]): BlameLabel[] {
  return lines.map((line, index) => {
    const first = index === 0 || lines[index - 1]!.commit.hash !== line.commit.hash;
    const { commit } = line;
    const text = !first
      ? pad('')
      : commit.uncommitted
        ? pad('Not committed yet')
        : pad(`${isoDate(commit.authorTime)} ${commit.author}`);
    return { line: line.line, text, hash: commit.hash, first };
  });
}
