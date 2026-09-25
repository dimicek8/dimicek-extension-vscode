import type { GraphRow } from '../git/graph/graphBuilder';

export type { GraphLine, GraphRow } from '../git/graph/graphBuilder';

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

export type LogToWebview =
  | { type: 'reset'; repository?: string; commits: LogCommit[]; hasMore: boolean }
  | { type: 'append'; commits: LogCommit[]; hasMore: boolean }
  | { type: 'loading'; loading: boolean }
  | { type: 'error'; message: string };

export type LogFromWebview = { type: 'ready' } | { type: 'loadMore' };
