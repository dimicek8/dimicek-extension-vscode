import VscodeButton from '@vscode-elements/react-elements/dist/components/VscodeButton.js';
import VscodeCheckbox from '@vscode-elements/react-elements/dist/components/VscodeCheckbox.js';
import VscodeOption from '@vscode-elements/react-elements/dist/components/VscodeOption.js';
import VscodeSingleSelect from '@vscode-elements/react-elements/dist/components/VscodeSingleSelect.js';
import VscodeTextfield from '@vscode-elements/react-elements/dist/components/VscodeTextfield.js';
import { useEffect, useRef, useState } from 'react';
import type {
  LogFileChange,
  PushCommit,
  PushFromWebview,
  PushState,
  PushToWebview,
} from '../../../src/shared/protocol';
import { formatCommitDate, shortHash } from '../log/format';
import { createMessenger } from '../vscodeApi';

const messenger = createMessenger<PushFromWebview, PushToWebview>();

const STATUS_LETTERS: Record<LogFileChange['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  typeChanged: 'T',
};

function valueOf(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

function checkedOf(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}

export function App() {
  const [state, setState] = useState<PushState>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<PushCommit>();
  const [files, setFiles] = useState<LogFileChange[]>([]);
  const [force, setForce] = useState(false);
  const [tags, setTags] = useState(false);
  const [remoteBranch, setRemoteBranch] = useState('');
  const sentBranch = useRef('');

  useEffect(() => {
    const unsubscribe = messenger.onMessage((message) => {
      switch (message.type) {
        case 'state':
          setState(message.state);
          setError(undefined);
          setSelected(undefined);
          setFiles([]);
          sentBranch.current = message.state.remoteBranch;
          setRemoteBranch(message.state.remoteBranch);
          break;
        case 'files':
          setFiles(message.files);
          break;
        case 'busy':
          setBusy(message.busy);
          break;
        case 'error':
          setError(message.message);
          break;
      }
    });
    messenger.post({ type: 'ready' });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!state || remoteBranch.trim() === '' || remoteBranch === sentBranch.current) {
      return;
    }
    const timer = setTimeout(() => {
      sentBranch.current = remoteBranch;
      messenger.post({ type: 'changeTarget', remote: state.remote, remoteBranch });
    }, 400);
    return () => clearTimeout(timer);
  }, [remoteBranch, state]);

  if (!state) {
    return <div className="push push--empty">{error ?? 'Loading…'}</div>;
  }

  const upToDate = state.remoteBranchExists && state.commits.length === 0;
  const canPush = !busy && remoteBranch.trim() !== '' && (!upToDate || force);

  const select = (commit: PushCommit) => {
    setSelected(commit);
    setFiles([]);
    messenger.post({ type: 'selectCommit', hash: commit.hash });
  };

  return (
    <main className="push">
      <header className="push__target">
        <span className="push__branch">{state.branch}</span>
        <span className="push__arrow">→</span>
        {state.remotes.length > 1 ? (
          <VscodeSingleSelect
            value={state.remote}
            onChange={(event) =>
              messenger.post({ type: 'changeTarget', remote: valueOf(event), remoteBranch })
            }
          >
            {state.remotes.map((remote) => (
              <VscodeOption key={remote} value={remote}>
                {remote}
              </VscodeOption>
            ))}
          </VscodeSingleSelect>
        ) : (
          <span className="push__remote">{state.remote}</span>
        )}
        <span>/</span>
        <VscodeTextfield
          className="push__remote-branch"
          value={remoteBranch}
          onInput={(event) => setRemoteBranch(valueOf(event))}
        />
        {!state.remoteBranchExists && <span className="push__badge">New branch</span>}
      </header>

      {state.behind > 0 && (
        <div className="push__notice push__notice--warning">
          {state.remote}/{state.remoteBranch} has {state.behind}{' '}
          {state.behind === 1 ? 'commit' : 'commits'} that you don’t have. The push will be rejected
          unless you update first or force push.
        </div>
      )}
      {error && <div className="push__notice push__notice--error">{error}</div>}

      <section className="push__body">
        <div className="push__commits" role="listbox" aria-label="Commits to push">
          {state.commits.length === 0 ? (
            <div className="push__placeholder">
              {upToDate
                ? 'Everything is up to date.'
                : 'No new commits; the branch will be created on the remote.'}
            </div>
          ) : (
            state.commits.map((commit) => (
              <div
                key={commit.hash}
                role="option"
                aria-selected={commit.hash === selected?.hash}
                className={`push__commit${commit.hash === selected?.hash ? ' push__commit--selected' : ''}`}
                onClick={() => select(commit)}
              >
                <span className="push__subject">{commit.subject}</span>
                <span className="push__meta">
                  {commit.author} · {formatCommitDate(commit.date)} · {shortHash(commit.hash)}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="push__files">
          {selected ? (
            files.map((file) => (
              <div
                key={file.path}
                className="push__file"
                title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}
                onClick={() =>
                  messenger.post({
                    type: 'openFileDiff',
                    hash: selected.hash,
                    parent: selected.parents[0],
                    file,
                  })
                }
              >
                <span className={`push__status push__status--${file.status}`}>
                  {STATUS_LETTERS[file.status]}
                </span>
                {file.path}
              </div>
            ))
          ) : (
            <div className="push__placeholder">Select a commit to see its files.</div>
          )}
        </div>
      </section>

      <footer className="push__footer">
        <div className="push__options">
          <VscodeCheckbox
            label="Force push (--force-with-lease)"
            checked={force}
            onChange={(event) => setForce(checkedOf(event))}
          />
          <VscodeCheckbox
            label="Push tags"
            checked={tags}
            onChange={(event) => setTags(checkedOf(event))}
          />
          {force && (
            <span className="push__force-warning">
              Force push rewrites the remote branch. Commits pushed by others since your last fetch
              are protected by --force-with-lease.
            </span>
          )}
        </div>
        <div className="push__actions">
          <VscodeButton secondary onClick={() => messenger.post({ type: 'cancel' })}>
            Cancel
          </VscodeButton>
          <VscodeButton
            disabled={!canPush}
            onClick={() => messenger.post({ type: 'push', force, tags })}
          >
            {force ? 'Force Push' : 'Push'}
          </VscodeButton>
        </div>
      </footer>
    </main>
  );
}
