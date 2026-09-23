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
