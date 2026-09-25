import { useCallback, useEffect, useState } from 'react';
import type {
  LogCommit,
  LogFilters,
  LogFromWebview,
  LogToWebview,
} from '../../../src/shared/protocol';
import { createMessenger } from '../vscodeApi';
import { CommitList } from './CommitList';
import { LogToolbar } from './LogToolbar';

const messenger = createMessenger<LogFromWebview, LogToWebview>();

export function App() {
  const [commits, setCommits] = useState<LogCommit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [repository, setRepository] = useState<string>();
  const [initialized, setInitialized] = useState(false);
  const [filters, setFilters] = useState<LogFilters>({});
  const [branches, setBranches] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = messenger.onMessage((message) => {
      switch (message.type) {
        case 'reset':
          setRepository(message.repository);
          setCommits(message.commits);
          setHasMore(message.hasMore);
          setFilters(message.filters);
          setBranches(message.branches);
          setError(undefined);
          setInitialized(true);
          break;
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

  if (initialized && !repository) {
    return <div className="log__message">No Git repository is open.</div>;
  }

  return (
    <div className="log-app">
      {initialized && (
        <LogToolbar
          key={repository}
          initial={filters}
          branches={branches}
          onChange={changeFilters}
        />
      )}
      {error ? (
        <div className="log__message log__message--error">{error}</div>
      ) : initialized && commits.length === 0 ? (
        <div className="log__message">No commits match the filters.</div>
      ) : (
        <CommitList commits={commits} hasMore={hasMore} loading={loading} onLoadMore={loadMore} />
      )}
    </div>
  );
}
