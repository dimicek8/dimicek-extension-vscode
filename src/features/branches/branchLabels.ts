import type { BranchStatus } from '../../git/parsers/status';
import type { OperationKind, OperationState } from '../../git/repository';

const OPERATION_LABELS: Record<OperationKind, string> = {
  merge: 'Merging',
  rebase: 'Rebasing',
  cherryPick: 'Cherry-picking',
  revert: 'Reverting',
};

export function operationLabel(kind: OperationKind): string {
  return OPERATION_LABELS[kind];
}

function aheadBehind(branch: BranchStatus): string {
  const parts = [];
  if (branch.ahead) {
    parts.push(`↑${branch.ahead}`);
  }
  if (branch.behind) {
    parts.push(`↓${branch.behind}`);
  }
  return parts.join(' ');
}

export function statusBarText(branch: BranchStatus, operation?: OperationState): string {
  const name = operation?.branch ?? branch.head;
  const base = name
    ? `$(git-branch) ${name}`
    : branch.commit
      ? `$(git-commit) ${branch.commit.slice(0, 7)}`
      : '$(git-branch) (no branch)';
  if (operation) {
    return `${base} (${OPERATION_LABELS[operation.kind]})`;
  }
  const counts = aheadBehind(branch);
  return counts ? `${base} ${counts}` : base;
}

export function statusBarTooltip(
  repositoryName: string,
  branch: BranchStatus,
  operation?: OperationState,
): string {
  const lines = [`Repository: ${repositoryName}`];
  if (branch.head) {
    lines.push(`Branch: ${branch.head}`);
  } else if (operation?.branch) {
    lines.push(`Branch: ${operation.branch}`);
  } else if (branch.commit) {
    lines.push(`Detached HEAD at ${branch.commit.slice(0, 7)}`);
  }
  if (operation) {
    lines.push(`${OPERATION_LABELS[operation.kind]} in progress`);
  } else if (branch.upstream) {
    const counts = aheadBehind(branch);
    lines.push(`Upstream: ${branch.upstream}${counts ? ` (${counts})` : ''}`);
  } else if (branch.head) {
    lines.push('No upstream branch');
  }
  lines.push('', 'Click to show branches');
  return lines.join('\n');
}
