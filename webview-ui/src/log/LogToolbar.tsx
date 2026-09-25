import VscodeButton from '@vscode-elements/react-elements/dist/components/VscodeButton.js';
import VscodeOption from '@vscode-elements/react-elements/dist/components/VscodeOption.js';
import VscodeSingleSelect from '@vscode-elements/react-elements/dist/components/VscodeSingleSelect.js';
import VscodeTextfield from '@vscode-elements/react-elements/dist/components/VscodeTextfield.js';
import { useEffect, useRef, useState } from 'react';
import type { LogFilters, LogPeriod } from '../../../src/shared/protocol';

const DEBOUNCE_MS = 400;

const PERIODS: Array<[LogPeriod | '', string]> = [
  ['', 'Any time'],
  ['day', 'Last 24 hours'],
  ['week', 'Last 7 days'],
  ['month', 'Last 30 days'],
  ['year', 'Last year'],
];

interface LogToolbarProps {
  initial: LogFilters;
  branches: string[];
  onChange: (filters: LogFilters) => void;
}

function clean(filters: LogFilters): LogFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => typeof value === 'string' && value.trim() !== ''),
  );
}

function valueOf(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

export function LogToolbar({ initial, branches, onChange }: LogToolbarProps) {
  const [text, setText] = useState(initial.text ?? '');
  const [author, setAuthor] = useState(initial.author ?? '');
  const [path, setPath] = useState(initial.path ?? '');
  const [branch, setBranch] = useState(initial.branch ?? '');
  const [since, setSince] = useState<LogPeriod | ''>(initial.since ?? '');
  const lastSent = useRef(JSON.stringify(clean(initial)));
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const filters = clean({ text, author, path, branch, since: since || undefined });
    const serialized = JSON.stringify(filters);
    if (serialized === lastSent.current) {
      return;
    }
    const timer = setTimeout(() => {
      lastSent.current = serialized;
      onChangeRef.current(filters);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, author, path, branch, since]);

  const hasFilters = Boolean(text || author || path || branch || since);

  return (
    <div className="toolbar">
      <VscodeTextfield
        className="toolbar__text"
        placeholder="Text or hash"
        value={text}
        onInput={(event) => setText(valueOf(event))}
      />
      <VscodeSingleSelect
        className="toolbar__branch"
        combobox
        value={branch}
        onChange={(event) => setBranch(valueOf(event))}
      >
        <VscodeOption value="">All branches</VscodeOption>
        <VscodeOption value="HEAD">Current branch</VscodeOption>
        {branches.map((name) => (
          <VscodeOption key={name} value={name}>
            {name}
          </VscodeOption>
        ))}
      </VscodeSingleSelect>
      <VscodeTextfield
        className="toolbar__author"
        placeholder="Author"
        value={author}
        onInput={(event) => setAuthor(valueOf(event))}
      />
      <VscodeSingleSelect
        className="toolbar__since"
        value={since}
        onChange={(event) => setSince(valueOf(event) as LogPeriod | '')}
      >
        {PERIODS.map(([value, label]) => (
          <VscodeOption key={value} value={value}>
            {label}
          </VscodeOption>
        ))}
      </VscodeSingleSelect>
      <VscodeTextfield
        className="toolbar__path"
        placeholder="Path"
        value={path}
        onInput={(event) => setPath(valueOf(event))}
      />
      {hasFilters && (
        <VscodeButton
          secondary
          onClick={() => {
            setText('');
            setAuthor('');
            setPath('');
            setBranch('');
            setSince('');
          }}
        >
          Clear
        </VscodeButton>
      )}
    </div>
  );
}
