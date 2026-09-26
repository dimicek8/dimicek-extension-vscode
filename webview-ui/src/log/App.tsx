import { type PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import type {
  LogCommit,
  LogCommitDetails,
  LogFileChange,
  LogFilters,
  LogFromWebview,
  LogToWebview,
} from '../../../src/shared/protocol';
import { createMessenger, loadState, saveState } from '../vscodeApi';
import { CommitDetails } from './CommitDetails';
import { CommitList } from './CommitList';
import { LogToolbar } from './LogToolbar';

const messenger = createMessenger<LogFromWebview, LogToWebview>();

const DEFAULT_DETAILS_WIDTH = 360;
const MIN_DETAILS_WIDTH = 200;

interface LogViewState {
  detailsWidth: number;
}

export function App() {
  const [commits, setCommits] = useState<LogCommit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [repository, setRepository] = useState<string>();
  const [initialized, setInitialized] = useState(false);
  const [filters, setFilters] = useState<LogFilters>({});
  const [branches, setBranches] = useState<string[]>([]);
  const [filtersVersion, setFiltersVersion] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [details, setDetails] = useState<LogCommitDetails>();
  const [detailsError, setDetailsError] = useState<string>();
  const [listKey, setListKey] = useState(0);
  const selectedRef = useRef<string | undefined>(undefined);
  const [detailsWidth, setDetailsWidth] = useState(
    () => loadState<LogViewState>()?.detailsWidth ?? DEFAULT_DETAILS_WIDTH,
  );
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveState<LogViewState>({ detailsWidth });
  }, [detailsWidth]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const unsubscribe = messenger.onMessage((message) => {
      switch (message.type) {
        case 'reset': {
          const current = selectedRef.current;
          const keepSelection =
            message.preserve &&
            current !== undefined &&
            message.commits.some((commit) => commit.hash === current);
          if (keepSelection) {
            messenger.post({ type: 'selectCommit', hash: current });
          } else {
            setSelected(undefined);
            setDetails(undefined);
            setDetailsError(undefined);
          }
          if (!message.preserve) {
            setListKey((key) => key + 1);
          }
          setRepository(message.repository);
          setCommits(message.commits);
          setHasMore(message.hasMore);
          setFilters(message.filters);
          setBranches(message.branches);
          setFiltersVersion(message.filtersVersion);
          setError(undefined);
          setInitialized(true);
          break;
        }
        case 'append':
          setCommits((current) => [...current, ...message.commits]);
          setHasMore(message.hasMore);
          break;
        case 'loading':
          setLoading(message.loading);
          break;
        case 'error':
          setError(message.message);
          break;
        case 'details':
          setDetails(message.details);
          setDetailsError(undefined);
          break;
        case 'detailsError':
          setDetails(undefined);
          setDetailsError(message.message);
          break;
      }
    });
    messenger.post({ type: 'ready' });
    return unsubscribe;
  }, []);

  const loadMore = useCallback(() => messenger.post({ type: 'loadMore' }), []);
  const changeFilters = useCallback(
    (next: LogFilters) => messenger.post({ type: 'setFilters', filters: next }),
    [],
  );
  const select = useCallback((hash: string) => {
    setSelected(hash);
    messenger.post({ type: 'selectCommit', hash });
  }, []);
  const openFile = (file: LogFileChange) => {
    if (details) {
      messenger.post({
        type: 'openFileDiff',
        hash: details.hash,
        parent: details.parents[0],
        file,
      });
    }
  };
  const copy = (text: string) => messenger.post({ type: 'copy', text });

  const resize = (event: PointerEvent<HTMLDivElement>) => {
    const body = bodyRef.current;
    if (!body || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const rect = body.getBoundingClientRect();
    const width = rect.right - event.clientX;
    setDetailsWidth(Math.round(Math.min(rect.width * 0.7, Math.max(MIN_DETAILS_WIDTH, width))));
  };

  if (initialized && !repository) {
    return <div className="log__message">No Git repository is open.</div>;
  }

  return (
    <div className="log-app">
      {initialized && (
        <LogToolbar
          key={`${repository}:${filtersVersion}`}
          initial={filters}
          branches={branches}
          onChange={changeFilters}
        />
      )}
      <div className="log-body" ref={bodyRef}>
        <div className="log-body__list">
          {error ? (
            <div className="log__message log__message--error">{error}</div>
          ) : initialized && commits.length === 0 ? (
            <div className="log__message">No commits match the filters.</div>
          ) : (
            <CommitList
              key={listKey}
              commits={commits}
              hasMore={hasMore}
              loading={loading}
              selected={selected}
              onSelect={select}
              onLoadMore={loadMore}
            />
          )}
        </div>
        <div
          className="log-body__divider"
          role="separator"
          aria-orientation="vertical"
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={resize}
          onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        />
        <div className="log-body__details" style={{ width: detailsWidth }}>
          <CommitDetails
            key={details?.hash}
            details={details}
            error={detailsError}
            onSelectCommit={select}
            onOpenFile={openFile}
            onCopy={copy}
          />
        </div>
      </div>
    </div>
  );
}
