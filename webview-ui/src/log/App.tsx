import { useEffect, useState } from 'react';
import type { LogCommit, LogFromWebview, LogToWebview } from '../../../src/shared/protocol';
import { createMessenger } from '../vscodeApi';
import { CommitList } from './CommitList';

const messenger = createMessenger<LogFromWebview, LogToWebview>();

export function App() {
  const [commits, setCommits] = useState<LogCommit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [repository, setRepository] = useState<string>();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const unsubscribe = messenger.onMessage((message) => {
      switch (message.type) {
        case 'reset':
          setRepository(message.repository);
          setCommits(message.commits);
          setHasMore(message.hasMore);
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

  if (error) {
    return <div className="log__message log__message--error">{error}</div>;
  }
  if (initialized && !repository) {
    return <div className="log__message">No Git repository is open.</div>;
  }

  return (
    <CommitList
      commits={commits}
      hasMore={hasMore}
      loading={loading}
      onLoadMore={() => messenger.post({ type: 'loadMore' })}
    />
  );
}
