import VscodeButton from '@vscode-elements/react-elements/dist/components/VscodeButton.js';
import VscodeCheckbox from '@vscode-elements/react-elements/dist/components/VscodeCheckbox.js';
import VscodeTextarea from '@vscode-elements/react-elements/dist/components/VscodeTextarea.js';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import type {
  CommitViewFromWebview,
  CommitViewState,
  CommitViewToWebview,
} from '../../../src/shared/protocol';
import { createMessenger, loadState, saveState } from '../vscodeApi';

const messenger = createMessenger<CommitViewFromWebview, CommitViewToWebview>();

interface Draft {
  message: string;
  amend: boolean;
}

const INITIAL_STATE: CommitViewState = {
  hasRepository: false,
  includedCount: 0,
  totalCount: 0,
  busy: false,
};

function summarize(state: CommitViewState): string {
  if (!state.hasRepository) {
    return 'No repository';
  }
  const files =
    state.includedCount === 0
      ? 'No files selected'
      : `${state.includedCount} of ${state.totalCount} files selected`;
  return state.branch ? `${files} · ${state.branch}` : files;
}

export function App() {
  const [draft] = useState(() => loadState<Draft>());
  const [message, setMessage] = useState(draft?.message ?? '');
  const [amend, setAmend] = useState(draft?.amend ?? false);
  const [state, setState] = useState(INITIAL_STATE);
  const messageRef = useRef(message);
  const amendMessageRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    messageRef.current = message;
    saveState<Draft>({ message, amend });
  }, [message, amend]);

  useEffect(() => {
    const unsubscribe = messenger.onMessage((event) => {
      switch (event.type) {
        case 'state':
          setState(event.state);
          break;
        case 'setMessage':
          setMessage(event.message);
          break;
        case 'lastCommitMessage':
          if (messageRef.current.trim() === '') {
            amendMessageRef.current = event.message;
            setMessage(event.message);
          }
          break;
        case 'committed':
          amendMessageRef.current = undefined;
          setMessage('');
          setAmend(false);
          break;
      }
    });
    messenger.post({ type: 'ready' });
    return unsubscribe;
  }, []);

  const toggleAmend = (checked: boolean) => {
    setAmend(checked);
    if (checked) {
      messenger.post({ type: 'requestLastCommitMessage' });
    } else if (amendMessageRef.current !== undefined && message === amendMessageRef.current) {
      amendMessageRef.current = undefined;
      setMessage('');
    }
  };

  const canCommit =
    state.hasRepository &&
    !state.busy &&
    message.trim() !== '' &&
    (state.includedCount > 0 || amend);

  const commit = (push: boolean) => {
    if (canCommit) {
      messenger.post({ type: 'commit', message, amend, push });
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commit(false);
    }
  };

  return (
    <main className="commit">
      <div className="commit__toolbar">
        <VscodeCheckbox
          label="Amend"
          checked={amend}
          disabled={!state.hasRepository}
          onChange={(event) => toggleAmend((event.target as HTMLInputElement).checked)}
        />
        <VscodeButton
          secondary
          className="commit__history"
          title="Choose a recent commit message"
          disabled={!state.hasRepository}
          onClick={() => messenger.post({ type: 'showHistory' })}
        >
          History
        </VscodeButton>
      </div>
      <VscodeTextarea
        className="commit__message"
        placeholder="Commit message"
        rows={6}
        resize="vertical"
        value={message}
        disabled={!state.hasRepository || state.busy}
        onInput={(event) => setMessage((event.target as HTMLTextAreaElement).value)}
        onKeyDown={onKeyDown}
      />
      <div className="commit__summary">{summarize(state)}</div>
      <div className="commit__actions">
        <VscodeButton disabled={!canCommit} onClick={() => commit(false)}>
          {amend ? 'Amend Commit' : 'Commit'}
        </VscodeButton>
        <VscodeButton secondary disabled={!canCommit} onClick={() => commit(true)}>
          {amend ? 'Amend and Push' : 'Commit and Push'}
        </VscodeButton>
      </div>
    </main>
  );
}
