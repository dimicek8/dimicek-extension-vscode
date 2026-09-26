import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitError } from './gitError';
import { type GitRunner, isVersionAtLeast } from './gitExec';
import { type BlameLine, parseBlame } from './parsers/blame';
import {
  FILE_REVISIONS_FORMAT,
  type FileRevision,
  parseFileRevisions,
} from './parsers/fileRevisions';
import { buildLogArgs, type Commit, type LogOptions, parseLog } from './parsers/log';
import { parseRecentCheckouts } from './parsers/reflog';
import { type NameStatusEntry, parseNameStatus } from './parsers/nameStatus';
import { parseStashes, type Stash, STASH_FORMAT } from './parsers/stash';
import { type LocalBranch, parseRefs, type Ref, REFS_FORMAT } from './parsers/refs';
import { type GitStatus, parseStatus } from './parsers/status';
import {
  buildRebaseTodo,
  quotePath,
  type RebaseEntry,
  validateRebaseEntries,
} from './rebase/rebaseTodo';

export interface CommitRequest {
  message: string;
  paths: readonly string[];
  addPaths?: readonly string[];
  amend?: boolean;
}

export interface PushRequest {
  branch: string;
  remote: string;
  remoteBranch: string;
  force?: boolean;
  tags?: boolean;
  setUpstream?: boolean;
}

const NETWORK_TIMEOUT_MS = 5 * 60_000;

export type OperationKind = 'merge' | 'rebase' | 'cherryPick' | 'revert';

export type ResetMode = 'soft' | 'mixed' | 'hard' | 'keep';

const OPERATION_COMMANDS: Record<OperationKind, string> = {
  merge: 'merge',
  rebase: 'rebase',
  cherryPick: 'cherry-pick',
  revert: 'revert',
};

export interface OperationState {
  kind: OperationKind;
  branch?: string;
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

export class Repository {
  private writeQueue: Promise<unknown> = Promise.resolve();
  private gitDir: Promise<string> | undefined;

  constructor(
    readonly root: string,
    private readonly git: GitRunner,
  ) {}

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  private async run(
    args: string[],
    signal?: AbortSignal,
    options: { input?: string; timeoutMs?: number; env?: Record<string, string> } = {},
  ): Promise<string> {
    const { stdout } = await this.git.exec(args, { cwd: this.root, signal, ...options });
    return stdout;
  }

  async getStatus(signal?: AbortSignal): Promise<GitStatus> {
    const args = ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'];
    if (isVersionAtLeast(this.git.version, '2.35')) {
      args.push('--show-stash');
    }
    return parseStatus(await this.run(args, signal));
  }

  async getRemotes(signal?: AbortSignal): Promise<string[]> {
    return (await this.run(['remote'], signal)).split('\n').filter(Boolean);
  }

  async getRefs(signal?: AbortSignal): Promise<Ref[]> {
    const [remotes, output] = await Promise.all([
      this.getRemotes(signal),
      this.run(
        ['for-each-ref', `--format=${REFS_FORMAT}`, 'refs/heads', 'refs/remotes', 'refs/tags'],
        signal,
      ),
    ]);
    return parseRefs(output, remotes);
  }

  async getHistoryFingerprint(signal?: AbortSignal): Promise<string> {
    const [refs, head] = await Promise.all([
      this.run(['for-each-ref', '--format=%(refname) %(objectname)'], signal),
      this.run(['rev-parse', 'HEAD', '--symbolic-full-name', 'HEAD'], signal).catch(() => ''),
    ]);
    return `${head}\n${refs}`;
  }

  async hasCommits(signal?: AbortSignal): Promise<boolean> {
    try {
      await this.run(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], signal);
      return true;
    } catch (error) {
      if (error instanceof GitError && error.exitCode === 1) {
        return false;
      }
      throw error;
    }
  }

  async getLog(options: LogOptions = {}, signal?: AbortSignal): Promise<Commit[]> {
    try {
      return parseLog(await this.run(buildLogArgs(options), signal));
    } catch (error) {
      if (error instanceof GitError && !(await this.hasCommits(signal))) {
        return [];
      }
      throw error;
    }
  }

  async blame(path: string, contents?: string, signal?: AbortSignal): Promise<BlameLine[]> {
    const args = [
      'blame',
      '--porcelain',
      ...(contents === undefined ? [] : ['--contents', '-']),
      '--',
      path,
    ];
    return parseBlame(await this.run(args, signal, { input: contents }));
  }

  getFileContent(ref: string, path: string, signal?: AbortSignal): Promise<string> {
    return this.run(['cat-file', '--filters', `${ref}:${path}`], signal);
  }

  rollback(plan: { restore: readonly string[]; unstage: readonly string[] }): Promise<void> {
    return this.exclusive(async () => {
      if (plan.restore.length > 0) {
        await this.run([
          'restore',
          '--source=HEAD',
          '--staged',
          '--worktree',
          '--',
          ...plan.restore,
        ]);
      }
      if (plan.unstage.length > 0) {
        await this.run(['rm', '--cached', '--quiet', '-r', '--force', '--', ...plan.unstage]);
      }
    });
  }

  add(paths: readonly string[]): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['add', '--', ...paths]);
    });
  }

  getGitDir(): Promise<string> {
    this.gitDir ??= this.run(['rev-parse', '--absolute-git-dir']).then(
      (output) => output.trim(),
      (error: unknown) => {
        this.gitDir = undefined;
        throw error;
      },
    );
    return this.gitDir;
  }

  async getOperationState(): Promise<OperationState | undefined> {
    const gitDir = await this.getGitDir();
    for (const directory of ['rebase-merge', 'rebase-apply']) {
      if (await exists(join(gitDir, directory))) {
        const headName = await readFile(join(gitDir, directory, 'head-name'), 'utf8').catch(
          () => '',
        );
        const branch = headName.trim().replace(/^refs\/heads\//, '');
        return {
          kind: 'rebase',
          branch: branch && branch !== 'detached HEAD' ? branch : undefined,
        };
      }
    }
    const markers: Array<[string, OperationKind]> = [
      ['MERGE_HEAD', 'merge'],
      ['CHERRY_PICK_HEAD', 'cherryPick'],
      ['REVERT_HEAD', 'revert'],
    ];
    for (const [file, kind] of markers) {
      if (await exists(join(gitDir, file))) {
        return { kind };
      }
    }
    return undefined;
  }

  async isMerging(signal?: AbortSignal): Promise<boolean> {
    try {
      await this.run(['rev-parse', '--quiet', '--verify', 'MERGE_HEAD'], signal);
      return true;
    } catch (error) {
      if (error instanceof GitError && error.exitCode === 1) {
        return false;
      }
      throw error;
    }
  }

  async getLastCommitMessage(signal?: AbortSignal): Promise<string> {
    if (!(await this.hasCommits(signal))) {
      return '';
    }
    return (await this.run(['log', '-1', '--format=%B'], signal)).trim();
  }

  commit(request: CommitRequest): Promise<void> {
    return this.exclusive(async () => {
      const { message, paths, addPaths = [], amend = false } = request;
      if (paths.length === 0 && !amend) {
        throw new Error('No files selected for commit.');
      }
      if (addPaths.length > 0) {
        await this.run(['add', '--', ...addPaths]);
      }
      const args = ['commit', '--quiet', '--file=-'];
      if (amend) {
        args.push('--amend');
      }
      if (await this.isMerging()) {
        if (paths.length > 0) {
          await this.run(['add', '--all', '--', ...paths]);
        }
      } else {
        args.push('--only');
        if (paths.length > 0) {
          args.push('--', ...paths);
        }
      }
      await this.run(args, undefined, { input: message });
    });
  }

  private async localBranch(name: string, signal?: AbortSignal): Promise<LocalBranch> {
    const branch = (await this.getRefs(signal)).find(
      (ref): ref is LocalBranch => ref.type === 'branch' && ref.name === name,
    );
    if (!branch) {
      throw new Error(`Branch '${name}' does not exist.`);
    }
    return branch;
  }

  private async currentBranchName(signal?: AbortSignal): Promise<string> {
    const { branch } = await this.getStatus(signal);
    if (!branch.head) {
      throw new Error('HEAD is detached.');
    }
    return branch.head;
  }

  push(branchName?: string, signal?: AbortSignal): Promise<void> {
    return this.exclusive(async () => {
      const name = branchName ?? (await this.currentBranchName(signal));
      const { upstream } = await this.localBranch(name, signal);
      const options = { timeoutMs: NETWORK_TIMEOUT_MS };
      if (upstream && !upstream.gone && upstream.remote !== '.') {
        await this.run(['push', upstream.remote, `${name}:${upstream.branch}`], signal, options);
        return;
      }
      const remotes = await this.getRemotes(signal);
      if (remotes.length !== 1) {
        throw new Error(
          remotes.length === 0
            ? 'Cannot push: the repository has no remote.'
            : `Cannot push: branch '${name}' has no upstream and there are several remotes.`,
        );
      }
      await this.run(['push', '--set-upstream', remotes[0]!, name], signal, options);
    });
  }

  update(branchName?: string, signal?: AbortSignal): Promise<void> {
    return this.exclusive(async () => {
      const current = (await this.getStatus(signal)).branch.head;
      const name = branchName ?? current;
      if (!name) {
        throw new Error('HEAD is detached.');
      }
      const { upstream } = await this.localBranch(name, signal);
      if (!upstream || upstream.gone) {
        throw new Error(`Branch '${name}' has no upstream branch to update from.`);
      }
      const options = { timeoutMs: NETWORK_TIMEOUT_MS };
      if (name === current) {
        await this.run(['pull', '--no-rebase', '--no-edit'], signal, options);
      } else if (upstream.remote === '.') {
        await this.run(['fetch', '.', `${upstream.branch}:${name}`], signal, options);
      } else {
        await this.run(['fetch', upstream.remote, `${upstream.branch}:${name}`], signal, options);
      }
    });
  }

  merge(revision: string): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['merge', '--no-edit', '--end-of-options', revision]);
    });
  }

  rebase(onto: string, branch?: string): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['rebase', '--end-of-options', onto, ...(branch ? [branch] : [])], undefined, {
        env: { GIT_EDITOR: 'true' },
      });
    });
  }

  continueOperation(kind: Exclude<OperationKind, 'merge'>): Promise<void> {
    return this.exclusive(async () => {
      await this.run([OPERATION_COMMANDS[kind], '--continue'], undefined, {
        env: { GIT_EDITOR: 'true' },
      });
    });
  }

  abortOperation(kind: OperationKind): Promise<void> {
    return this.exclusive(async () => {
      await this.run([OPERATION_COMMANDS[kind], '--abort']);
    });
  }

  continueRebase(): Promise<void> {
    return this.continueOperation('rebase');
  }

  abortRebase(): Promise<void> {
    return this.abortOperation('rebase');
  }

  abortMerge(): Promise<void> {
    return this.abortOperation('merge');
  }

  cherryPick(hash: string): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['cherry-pick', '--end-of-options', hash]);
    });
  }

  revert(hash: string): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['revert', '--no-edit', '--end-of-options', hash]);
    });
  }

  reset(revision: string, mode: ResetMode): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['reset', `--${mode}`, '--end-of-options', revision]);
    });
  }

  pushTags(remote: string, names: readonly string[], signal?: AbortSignal): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['push', remote, ...names.map((name) => `refs/tags/${name}`)], signal, {
        timeoutMs: NETWORK_TIMEOUT_MS,
      });
    });
  }

  deleteTag(name: string): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['tag', '--delete', name]);
    });
  }

  deleteRemoteTag(remote: string, name: string, signal?: AbortSignal): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['push', remote, '--delete', `refs/tags/${name}`], signal, {
        timeoutMs: NETWORK_TIMEOUT_MS,
      });
    });
  }

  async isValidTagName(name: string): Promise<boolean> {
    try {
      await this.run(['check-ref-format', `refs/tags/${name}`]);
      return true;
    } catch {
      return false;
    }
  }

  createTag(name: string, revision: string, message?: string): Promise<void> {
    return this.exclusive(async () => {
      await this.run(
        message
          ? ['tag', '--annotate', '--message', message, name, revision]
          : ['tag', name, revision],
      );
    });
  }

  async diffWithWorkingTree(
    revision: string,
    paths: readonly string[] = [],
    signal?: AbortSignal,
  ): Promise<NameStatusEntry[]> {
    return parseNameStatus(
      await this.run(
        ['diff', '--name-status', '-z', '-M', '--end-of-options', revision, '--', ...paths],
        signal,
      ),
    );
  }

  async pathExistsAt(revision: string, path: string, signal?: AbortSignal): Promise<boolean> {
    try {
      await this.run(['cat-file', '-e', `${revision}:${path}`], signal);
      return true;
    } catch {
      return false;
    }
  }

  async getFileRevisions(
    path: string,
    maxCount = 500,
    signal?: AbortSignal,
  ): Promise<FileRevision[]> {
    const output = await this.run(
      [
        'log',
        '--follow',
        `--format=${FILE_REVISIONS_FORMAT}`,
        '--name-only',
        '-z',
        `--max-count=${maxCount}`,
        '--',
        path,
      ],
      signal,
    );
    return parseFileRevisions(output, path);
  }

  renameBranch(oldName: string, newName: string): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['branch', '--move', oldName, newName]);
    });
  }

  deleteBranch(name: string, options: { force?: boolean } = {}): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['branch', options.force ? '-D' : '-d', name]);
    });
  }

  deleteRemoteBranch(remote: string, branch: string, signal?: AbortSignal): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['push', remote, '--delete', branch], signal, {
        timeoutMs: NETWORK_TIMEOUT_MS,
      });
    });
  }

  async diffNameStatus(from: string, to: string, signal?: AbortSignal): Promise<NameStatusEntry[]> {
    return parseNameStatus(
      await this.run(
        ['diff', '--name-status', '-z', '-M', '--end-of-options', from, to, '--'],
        signal,
      ),
    );
  }

  async getCommitFiles(
    hash: string,
    parents: readonly string[],
    signal?: AbortSignal,
  ): Promise<NameStatusEntry[]> {
    if (parents.length === 0) {
      return parseNameStatus(
        await this.run(
          ['diff-tree', '--root', '-r', '-z', '-M', '--name-status', '--no-commit-id', hash],
          signal,
        ),
      );
    }
    return this.diffNameStatus(parents[0]!, hash, signal);
  }

  async resolveRevision(revision: string, signal?: AbortSignal): Promise<string> {
    return (
      await this.run(['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`], signal)
    ).trim();
  }

  async countCommits(from: string, to: string, signal?: AbortSignal): Promise<number> {
    const output = await this.run(
      ['rev-list', '--count', '--end-of-options', `${from}..${to}`],
      signal,
    );
    return Number(output.trim());
  }

  async countAheadBehind(
    base: string,
    other: string,
    signal?: AbortSignal,
  ): Promise<{ ahead: number; behind: number }> {
    const output = await this.run(
      ['rev-list', '--left-right', '--count', '--end-of-options', `${base}...${other}`],
      signal,
    );
    const [behind = '0', ahead = '0'] = output.trim().split(/\s+/);
    return { ahead: Number(ahead), behind: Number(behind) };
  }

  async getRecentCheckouts(signal?: AbortSignal): Promise<string[]> {
    try {
      return parseRecentCheckouts(
        await this.run(['reflog', 'show', '--format=%gs', '-n', '500', 'HEAD', '--'], signal),
      );
    } catch {
      return [];
    }
  }

  async isValidBranchName(name: string): Promise<boolean> {
    try {
      await this.run(['check-ref-format', '--branch', name]);
      return true;
    } catch {
      return false;
    }
  }

  async revisionExists(revision: string): Promise<boolean> {
    try {
      await this.run([
        'rev-parse',
        '--verify',
        '--quiet',
        '--end-of-options',
        `${revision}^{commit}`,
      ]);
      return true;
    } catch {
      return false;
    }
  }

  fetch(signal?: AbortSignal): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['fetch', '--all', '--prune'], signal, { timeoutMs: NETWORK_TIMEOUT_MS });
    });
  }

  switchBranch(name: string, options: { force?: boolean } = {}): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['switch', ...(options.force ? ['--discard-changes'] : []), '--', name]);
    });
  }

  switchToRemoteBranch(
    remoteBranch: string,
    localName: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    return this.exclusive(async () => {
      await this.run([
        'switch',
        ...(options.force ? ['--discard-changes'] : []),
        '--create',
        localName,
        '--track',
        remoteBranch,
      ]);
    });
  }

  switchDetached(revision: string, options: { force?: boolean } = {}): Promise<void> {
    return this.exclusive(async () => {
      await this.run([
        'switch',
        '--detach',
        ...(options.force ? ['--discard-changes'] : []),
        '--end-of-options',
        revision,
      ]);
    });
  }

  createBranch(
    name: string,
    startPoint: string,
    options: { checkout: boolean; force?: boolean },
  ): Promise<void> {
    return this.exclusive(async () => {
      const args = options.checkout
        ? ['switch', ...(options.force ? ['--discard-changes'] : []), '--create', name, startPoint]
        : ['branch', '--', name, startPoint];
      await this.run(args);
    });
  }

  stash(message: string, options: { includeUntracked?: boolean } = {}): Promise<void> {
    return this.exclusive(async () => {
      const untracked = options.includeUntracked === false ? [] : ['--include-untracked'];
      await this.run(['stash', 'push', ...untracked, '--message', message], undefined, {
        env: { GIT_LITERAL_PATHSPECS: '0' },
      });
    });
  }

  async getOutgoingCommits(
    branch: string,
    remote: string,
    remoteBranch: string,
    signal?: AbortSignal,
  ): Promise<Commit[]> {
    const remoteRefs = (await this.getRefs(signal)).filter((ref) => ref.type === 'remoteBranch');
    const target = `refs/remotes/${remote}/${remoteBranch}`;
    const excluded = remoteRefs.some((ref) => ref.fullName === target)
      ? [target]
      : remoteRefs.map((ref) => ref.fullName);
    return this.getLog(
      { revisions: [`refs/heads/${branch}`, ...excluded.map((ref) => `^${ref}`)] },
      signal,
    );
  }

  pushBranch(request: PushRequest, signal?: AbortSignal): Promise<void> {
    return this.exclusive(async () => {
      const args = ['push'];
      if (request.force) {
        args.push('--force-with-lease');
      }
      if (request.tags) {
        args.push('--follow-tags');
      }
      if (request.setUpstream) {
        args.push('--set-upstream');
      }
      args.push(request.remote, `refs/heads/${request.branch}:refs/heads/${request.remoteBranch}`);
      await this.run(args, signal, { timeoutMs: NETWORK_TIMEOUT_MS });
    });
  }

  stashPop(ref?: string): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['stash', 'pop', ...(ref ? [ref] : [])]);
    });
  }

  async getStashes(signal?: AbortSignal): Promise<Stash[]> {
    return parseStashes(
      await this.run(['stash', 'list', '-z', `--format=${STASH_FORMAT}`], signal),
    );
  }

  async getStashFiles(stash: Stash, signal?: AbortSignal): Promise<NameStatusEntry[]> {
    const untracked =
      stash.hasUntracked && isVersionAtLeast(this.git.version, '2.32')
        ? ['--include-untracked']
        : [];
    return parseNameStatus(
      await this.run(['stash', 'show', ...untracked, '--name-status', '-z', stash.ref], signal),
    );
  }

  resolveConflict(path: string, action: 'ours' | 'theirs' | 'remove'): Promise<void> {
    return this.exclusive(async () => {
      if (action === 'remove') {
        await this.run(['rm', '--quiet', '--', path]);
        return;
      }
      await this.run(['checkout', `--${action}`, '--', path]);
      await this.run(['add', '--', path]);
    });
  }

  async isAncestor(ancestor: string, descendant: string, signal?: AbortSignal): Promise<boolean> {
    try {
      await this.run(['merge-base', '--is-ancestor', ancestor, descendant], signal);
      return true;
    } catch (error) {
      if (error instanceof GitError && error.exitCode === 1) {
        return false;
      }
      throw error;
    }
  }

  async getRebaseCommits(
    hash: string,
    signal?: AbortSignal,
  ): Promise<{ base: string | undefined; commits: Commit[] }> {
    const [commit] = await this.getLog({ revisions: [hash], maxCount: 1 }, signal);
    if (!commit) {
      throw new Error(`Commit ${hash} does not exist.`);
    }
    if (!(await this.isAncestor(commit.hash, 'HEAD', signal))) {
      throw new Error('The commit is not part of the current branch.');
    }
    const base = commit.parents[0];
    const commits = await this.getLog(
      { revisions: base ? [`^${base}`, 'HEAD'] : ['HEAD'] },
      signal,
    );
    if (commits.some((candidate) => candidate.parents.length > 1)) {
      throw new Error('The commits contain a merge commit, which cannot be rebased interactively.');
    }
    return { base, commits: commits.reverse() };
  }

  interactiveRebase(base: string | undefined, entries: readonly RebaseEntry[]): Promise<void> {
    return this.exclusive(async () => {
      const problem = validateRebaseEntries(entries);
      if (problem) {
        throw new Error(problem);
      }
      const directory = await mkdtemp(join(tmpdir(), 'dimicek-rebase-'));
      const messageFile = (hash: string) => join(directory, `message-${hash}.txt`);
      for (const entry of entries) {
        if (entry.action === 'reword') {
          await writeFile(messageFile(entry.hash), `${entry.message!.trim()}\n`);
        }
      }
      const todo = join(directory, 'todo.txt');
      await writeFile(todo, buildRebaseTodo(entries, messageFile));
      try {
        await this.run(
          ['rebase', '--interactive', ...(base ? ['--end-of-options', base] : ['--root'])],
          undefined,
          { env: { GIT_SEQUENCE_EDITOR: `cp ${quotePath(todo)}`, GIT_EDITOR: 'true' } },
        );
      } finally {
        if (!(await this.getOperationState())) {
          await rm(directory, { recursive: true, force: true });
        }
      }
    });
  }

  stashApply(ref: string): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['stash', 'apply', ref]);
    });
  }

  stashDrop(ref: string): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['stash', 'drop', ref]);
    });
  }

  stashClear(): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['stash', 'clear']);
    });
  }

  stashBranch(name: string, ref: string): Promise<void> {
    return this.exclusive(async () => {
      await this.run(['stash', 'branch', name, ref]);
    });
  }
}
