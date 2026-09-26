import type { GraphRow } from '../git/graph/graphBuilder';
import type { RebaseEntry } from '../git/rebase/rebaseTodo';
import type { NameStatusEntry } from '../git/parsers/nameStatus';

export type { GraphLine, GraphRow } from '../git/graph/graphBuilder';
export type LogFileChange = NameStatusEntry;

export interface CommitViewState {
  hasRepository: boolean;
  branch?: string;
  includedCount: number;
  totalCount: number;
  busy: boolean;
}

export type CommitViewToWebview =
  | { type: 'state'; state: CommitViewState }
  | { type: 'setMessage'; message: string }
  | { type: 'lastCommitMessage'; message: string }
  | { type: 'committed' };

export type CommitViewFromWebview =
  | { type: 'ready' }
  | { type: 'commit'; message: string; amend: boolean; push: boolean }
  | { type: 'requestLastCommitMessage' }
  | { type: 'showHistory' };

export interface LogRef {
  name: string;
  kind: 'head' | 'branch' | 'remote' | 'tag';
  current: boolean;
}

export interface LogCommit {
  hash: string;
  parents: string[];
  subject: string;
  author: string;
  authorEmail: string;
  date: number;
  isHead: boolean;
  refs: LogRef[];
  graph: GraphRow;
}

export interface LogCommitDetails {
  hash: string;
  subject: string;
  body: string;
  author: string;
  authorEmail: string;
  date: number;
  committer: string;
  committerEmail: string;
  commitDate: number;
  parents: string[];
  refs: LogRef[];
  files: LogFileChange[];
}

export type LogPeriod = 'day' | 'week' | 'month' | 'year';

export interface LogFilters {
  text?: string;
  branch?: string;
  author?: string;
  since?: LogPeriod;
  path?: string;
}

export type LogToWebview =
  | {
      type: 'reset';
      repository?: string;
      commits: LogCommit[];
      hasMore: boolean;
      filters: LogFilters;
      branches: string[];
      preserve: boolean;
      filtersVersion: number;
    }
  | { type: 'append'; commits: LogCommit[]; hasMore: boolean }
  | { type: 'select'; hash: string }
  | { type: 'details'; details: LogCommitDetails }
  | { type: 'detailsError'; hash: string; message: string }
  | { type: 'loading'; loading: boolean }
  | { type: 'error'; message: string };

export type LogFromWebview =
  | { type: 'ready' }
  | { type: 'loadMore' }
  | { type: 'setFilters'; filters: LogFilters }
  | { type: 'selectCommit'; hash: string }
  | { type: 'openFileDiff'; hash: string; parent?: string; file: LogFileChange }
  | { type: 'copy'; text: string };

export interface PushCommit {
  hash: string;
  parents: string[];
  subject: string;
  author: string;
  date: number;
}

export interface PushState {
  repository: string;
  branch: string;
  remotes: string[];
  remote: string;
  remoteBranch: string;
  remoteBranchExists: boolean;
  setUpstream: boolean;
  behind: number;
  commits: PushCommit[];
}

export type PushToWebview =
  | { type: 'state'; state: PushState }
  | { type: 'files'; hash: string; files: LogFileChange[] }
  | { type: 'busy'; busy: boolean }
  | { type: 'error'; message: string };

export type PushFromWebview =
  | { type: 'ready' }
  | { type: 'changeTarget'; remote: string; remoteBranch: string }
  | { type: 'selectCommit'; hash: string }
  | { type: 'openFileDiff'; hash: string; parent?: string; file: LogFileChange }
  | { type: 'push'; force: boolean; tags: boolean }
  | { type: 'cancel' };

export type { RebaseAction, RebaseEntry } from '../git/rebase/rebaseTodo';

export interface RebaseCommit {
  hash: string;
  subject: string;
  message: string;
  author: string;
  date: number;
}

export interface RebaseState {
  branch: string;
  base?: string;
  commits: RebaseCommit[];
}

export type RebaseToWebview =
  | { type: 'state'; state: RebaseState }
  | { type: 'busy'; busy: boolean }
  | { type: 'error'; message: string };

export type RebaseFromWebview =
  { type: 'ready' } | { type: 'start'; entries: RebaseEntry[] } | { type: 'cancel' };
