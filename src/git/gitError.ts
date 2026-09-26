export type GitErrorCode =
  | 'GitNotFound'
  | 'NotARepository'
  | 'Cancelled'
  | 'Timeout'
  | 'Conflict'
  | 'LocalChangesOverwritten'
  | 'PushRejected'
  | 'AuthenticationFailed'
  | 'RepositoryLocked'
  | 'BranchNotFullyMerged'
  | 'NetworkError'
  | 'Unknown';

export interface GitErrorInit {
  code: GitErrorCode;
  message: string;
  args: readonly string[];
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
}

export class GitError extends Error {
  readonly code: GitErrorCode;
  readonly args: readonly string[];
  readonly exitCode: number | null | undefined;
  readonly stdout: string;
  readonly stderr: string;

  constructor(init: GitErrorInit) {
    super(init.message);
    this.name = 'GitError';
    this.code = init.code;
    this.args = init.args;
    this.exitCode = init.exitCode;
    this.stdout = init.stdout ?? '';
    this.stderr = init.stderr ?? '';
  }
}

const STDERR_PATTERNS: ReadonlyArray<[RegExp, GitErrorCode]> = [
  [/not a git repository/i, 'NotARepository'],
  [/is not fully merged/i, 'BranchNotFullyMerged'],
  [/index\.lock': File exists|Unable to create '.*\.lock'/i, 'RepositoryLocked'],
  [
    /would be overwritten by (merge|checkout)|Please commit your changes or stash them/i,
    'LocalChangesOverwritten',
  ],
  [/CONFLICT|Automatic merge failed|could not apply|fix conflicts/i, 'Conflict'],
  [/\[rejected\]|failed to push some refs|non-fast-forward/i, 'PushRejected'],
  [
    /Authentication failed|could not read Username|Permission denied \(publickey|terminal prompts disabled|returned error: 40[13]/i,
    'AuthenticationFailed',
  ],
  [
    /Could not resolve host|unable to access|Connection (timed out|refused)|Network is unreachable|Could not read from remote repository/i,
    'NetworkError',
  ],
];

export function classifyGitError(stderr: string): GitErrorCode {
  return STDERR_PATTERNS.find(([pattern]) => pattern.test(stderr))?.[1] ?? 'Unknown';
}
