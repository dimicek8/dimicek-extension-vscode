import VscodeButton from '@vscode-elements/react-elements/dist/components/VscodeButton.js';
import VscodeOption from '@vscode-elements/react-elements/dist/components/VscodeOption.js';
import VscodeSingleSelect from '@vscode-elements/react-elements/dist/components/VscodeSingleSelect.js';
import VscodeTextarea from '@vscode-elements/react-elements/dist/components/VscodeTextarea.js';
import { useEffect, useState } from 'react';
import type {
  RebaseAction,
  RebaseCommit,
  RebaseFromWebview,
  RebaseState,
  RebaseToWebview,
} from '../../../src/shared/protocol';
import { formatCommitDate, shortHash } from '../log/format';
import { createMessenger } from '../vscodeApi';

const messenger = createMessenger<RebaseFromWebview, RebaseToWebview>();

const ACTIONS: Array<[RebaseAction, string]> = [
  ['pick', 'Pick'],
  ['reword', 'Reword'],
  ['squash', 'Squash'],
  ['fixup', 'Fixup'],
  ['drop', 'Drop'],
];

interface Row {
  commit: RebaseCommit;
  action: RebaseAction;
  message: string;
}

function initialRows(state: RebaseState): Row[] {
  return state.commits.map((commit) => ({ commit, action: 'pick', message: commit.message }));
}

export function App() {
  const [state, setState] = useState<RebaseState>();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = messenger.onMessage((message) => {
      switch (message.type) {
        case 'state':
          setState(message.state);
          setRows(initialRows(message.state));
          setError(undefined);
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

  if (!state) {
    return <div className="rebase rebase--empty">Loading…</div>;
  }

  const update = (index: number, change: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...change } : row)));
  const move = (index: number, offset: number) =>
    setRows((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  const unchanged = rows.every(
    (row, index) => row.action === 'pick' && row.commit.hash === state.commits[index]?.hash,
  );

  const start = () =>
    messenger.post({
      type: 'start',
      entries: rows.map((row) => ({
        hash: row.commit.hash,
        action: row.action,
        message: row.action === 'reword' ? row.message : undefined,
      })),
    });

  return (
    <main className="rebase">
      <header className="rebase__header">
        <h2>
          Rebase <span className="rebase__branch">{state.branch}</span> interactively
        </h2>
        <p className="rebase__hint">
          Commits are applied from top to bottom
          {state.base ? ` on top of ${shortHash(state.base)}` : ' from the first commit'}. Squash
          and Fixup combine a commit with the one above it.
        </p>
      </header>
      {error && <div className="rebase__error">{error}</div>}
      <section className="rebase__rows">
        {rows.map((row, index) => (
          <div key={row.commit.hash} className={`rebase__row rebase__row--${row.action}`}>
            <div className="rebase__move">
              <button
                title="Move up"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label="Move up"
              >
                ▲
              </button>
              <button
                title="Move down"
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
                aria-label="Move down"
              >
                ▼
              </button>
            </div>
            <VscodeSingleSelect
              className="rebase__action"
              value={row.action}
              onChange={(event) =>
                update(index, { action: (event.target as HTMLInputElement).value as RebaseAction })
              }
            >
              {ACTIONS.map(([value, label]) => (
                <VscodeOption key={value} value={value}>
                  {label}
                </VscodeOption>
              ))}
            </VscodeSingleSelect>
            <div className="rebase__commit">
              {row.action === 'reword' ? (
                <VscodeTextarea
                  className="rebase__message"
                  rows={3}
                  resize="vertical"
                  value={row.message}
                  onInput={(event) =>
                    update(index, { message: (event.target as HTMLTextAreaElement).value })
                  }
                />
              ) : (
                <span className="rebase__subject">
                  {(row.action === 'squash' || row.action === 'fixup') && '↳ '}
                  {row.commit.subject}
                </span>
              )}
              <span className="rebase__meta">
                {shortHash(row.commit.hash)} · {row.commit.author} ·{' '}
                {formatCommitDate(row.commit.date)}
              </span>
            </div>
          </div>
        ))}
      </section>
      <footer className="rebase__footer">
        <VscodeButton secondary disabled={busy} onClick={() => setRows(initialRows(state))}>
          Reset
        </VscodeButton>
        <div className="rebase__actions">
          <VscodeButton secondary onClick={() => messenger.post({ type: 'cancel' })}>
            Cancel
          </VscodeButton>
          <VscodeButton disabled={busy || unchanged} onClick={start}>
            Start Rebasing
          </VscodeButton>
        </div>
      </footer>
    </main>
  );
}
