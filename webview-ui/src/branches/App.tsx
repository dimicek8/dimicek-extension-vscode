import VscodeButton from '@vscode-elements/react-elements/dist/components/VscodeButton.js';
import VscodeTextfield from '@vscode-elements/react-elements/dist/components/VscodeTextfield.js';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BranchesFromWebview,
  BranchesToWebview,
  BranchesViewAction,
  BranchesViewBranch,
  BranchesViewState,
} from '../../../src/shared/protocol';
import { createMessenger } from '../vscodeApi';
import { type BranchRow, buildBranchRows } from './branchRows';

const messenger = createMessenger<BranchesFromWebview, BranchesToWebview>();

function Icon({ name }: { name: string }) {
  return <span className={`codicon codicon-${name}`} aria-hidden="true" />;
}

function branchIcon(branch: BranchesViewBranch): string {
  if (branch.current) {
    return 'check';
  }
  return branch.kind === 'local' ? 'git-branch' : 'cloud';
}

export function App() {
  const [state, setState] = useState<BranchesViewState>();
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string>();
  const [actions, setActions] = useState<BranchesViewAction[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const unsubscribe = messenger.onMessage((message) => {
      switch (message.type) {
        case 'state':
          setState(message.state);
          {
            const current = selectedRef.current;
            const keep =
              current && message.state.branches.some((branch) => branch.fullName === current)
                ? current
                : message.state.branches.find((branch) => branch.current)?.fullName;
            setSelected(keep);
            if (keep) {
              messenger.post({ type: 'select', fullName: keep });
            }
          }
          break;
        case 'actions':
          setActions(message.actions);
          break;
      }
    });
    messenger.post({ type: 'ready' });
    return unsubscribe;
  }, []);

  const rows = useMemo(
    () => (state ? buildBranchRows(state, filter, collapsed) : []),
    [state, filter, collapsed],
  );
  const branchRows = rows.filter(
    (row): row is Extract<BranchRow, { type: 'branch' }> => row.type === 'branch',
  );

  if (!state) {
    return <div className="branches branches--empty">Loading…</div>;
  }

  const selectedBranch = state.branches.find((branch) => branch.fullName === selected);

  const select = (fullName: string) => {
    setSelected(fullName);
    setActions([]);
    messenger.post({ type: 'select', fullName });
  };
  const run = (action: string, fullName = selected) => {
    if (fullName) {
      messenger.post({ type: 'runAction', fullName, action });
    }
  };
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      messenger.post({ type: 'close' });
      return;
    }
    const inList = (event.target as HTMLElement).closest('.branches__list') !== null;
    if (event.key === 'Enter' && inList && selectedBranch && !selectedBranch.current) {
      event.preventDefault();
      run('checkout');
      return;
    }
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0 || branchRows.length === 0) {
      return;
    }
    event.preventDefault();
    const index = branchRows.findIndex((row) => row.branch.fullName === selected);
    const next = branchRows[Math.min(branchRows.length - 1, Math.max(0, index + step))]!;
    select(next.branch.fullName);
    listRef.current
      ?.querySelector(`[data-key="${CSS.escape(next.key)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const groups = [...new Set(actions.map((action) => action.group))];

  return (
    <main className="branches" onKeyDown={onKeyDown}>
      <header className="branches__toolbar">
        {state.commands.map((command) => (
          <VscodeButton
            key={command.command}
            secondary
            onClick={() => messenger.post({ type: 'runCommand', command: command.command })}
          >
            <Icon name={command.icon} /> {command.label}
          </VscodeButton>
        ))}
      </header>
      {state.operation && (
        <div className="branches__operation">
          <Icon name="warning" /> {state.operation}
        </div>
      )}
      <section className="branches__body">
        <div className="branches__left">
          <VscodeTextfield
            className="branches__search"
            placeholder="Search branches"
            value={filter}
            onInput={(event) => setFilter((event.target as HTMLInputElement).value)}
          />
          <div className="branches__list" ref={listRef} tabIndex={0} role="tree">
            {rows.length === 0 && <div className="branches__placeholder">No branches match.</div>}
            {rows.map((row) => {
              const indent = { paddingLeft: `${row.depth * 14 + 6}px` };
              if (row.type !== 'branch') {
                return (
                  <div
                    key={row.key}
                    className={`branches__row branches__row--${row.type}`}
                    style={indent}
                    onClick={() => toggle(row.key)}
                  >
                    <Icon name={row.collapsed ? 'chevron-right' : 'chevron-down'} />
                    {row.type === 'folder' && <Icon name="folder" />}
                    <span>{row.label}</span>
                  </div>
                );
              }
              const { branch } = row;
              return (
                <div
                  key={row.key}
                  data-key={row.key}
                  role="treeitem"
                  aria-selected={branch.fullName === selected}
                  className={`branches__row branches__row--branch${branch.fullName === selected ? ' branches__row--selected' : ''}${branch.current ? ' branches__row--current' : ''}`}
                  style={indent}
                  onClick={() => select(branch.fullName)}
                  onDoubleClick={() => !branch.current && run('checkout', branch.fullName)}
                >
                  <Icon name={branchIcon(branch)} />
                  <span className="branches__name">{row.label}</span>
                  {branch.description && (
                    <span className="branches__description">{branch.description}</span>
                  )}
                  <button
                    className={`branches__star${branch.favorite ? ' branches__star--on' : ''}`}
                    title={branch.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                    onClick={(event) => {
                      event.stopPropagation();
                      messenger.post({ type: 'toggleFavorite', fullName: branch.fullName });
                    }}
                  >
                    <Icon name={branch.favorite ? 'star-full' : 'star-empty'} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <aside className="branches__right">
          {selectedBranch ? (
            <>
              <h2 className="branches__title">
                <Icon name={branchIcon(selectedBranch)} /> {selectedBranch.name}
              </h2>
              <div className="branches__subtitle">
                {[
                  selectedBranch.current ? 'current branch' : undefined,
                  selectedBranch.kind === 'remote' ? `remote ${selectedBranch.remote}` : 'local',
                  selectedBranch.description,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {groups.map((group) => (
                <div key={group} className="branches__actions">
                  {actions
                    .filter((action) => action.group === group)
                    .map((action) => (
                      <button
                        key={action.id}
                        className={`branches__action${action.id === 'checkout' ? ' branches__action--primary' : ''}`}
                        onClick={() => run(action.id)}
                      >
                        <Icon name={action.icon} />
                        <span>{action.label}</span>
                      </button>
                    ))}
                </div>
              ))}
            </>
          ) : (
            <div className="branches__placeholder">
              Select a branch to see what you can do with it.
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
