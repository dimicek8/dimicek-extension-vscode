import { useState } from 'react';
import { buildDirectoryTree, type DirectoryNode } from '../../../src/shared/directoryTree';
import type { LogCommitDetails, LogFileChange } from '../../../src/shared/protocol';
import { formatCommitDate, shortHash } from './format';
import { RefLabels } from './RefLabels';

const STATUS_LETTERS: Record<LogFileChange['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  typeChanged: 'T',
};

interface CommitDetailsProps {
  details?: LogCommitDetails;
  error?: string;
  onSelectCommit: (hash: string) => void;
  onOpenFile: (file: LogFileChange) => void;
  onCopy: (text: string) => void;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function FileTree({
  directory,
  depth,
  collapsed,
  onToggle,
  onOpenFile,
}: {
  directory: DirectoryNode<LogFileChange>;
  depth: number;
  collapsed: ReadonlySet<string>;
  onToggle: (path: string) => void;
  onOpenFile: (file: LogFileChange) => void;
}) {
  const indent = { paddingLeft: `${depth * 12 + 4}px` };
  return (
    <>
      {directory.directories.map((child) => {
        const isCollapsed = collapsed.has(child.path);
        return (
          <div key={`dir:${child.path}`}>
            <div
              className="files__row files__dir"
              style={indent}
              onClick={() => onToggle(child.path)}
            >
              <span className="files__twisty">{isCollapsed ? '▸' : '▾'}</span>
              {child.name}
            </div>
            {!isCollapsed && (
              <FileTree
                directory={child}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
              />
            )}
          </div>
        );
      })}
      {directory.files.map((file) => (
        <div
          key={`file:${file.path}`}
          className="files__row files__file"
          style={indent}
          title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}
          onClick={() => onOpenFile(file)}
        >
          <span className={`files__status files__status--${file.status}`}>
            {STATUS_LETTERS[file.status]}
          </span>
          {fileName(file.path)}
        </div>
      ))}
    </>
  );
}

export function CommitDetails({
  details,
  error,
  onSelectCommit,
  onOpenFile,
  onCopy,
}: CommitDetailsProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  if (error) {
    return <div className="details details--empty">{error}</div>;
  }
  if (!details) {
    return <div className="details details--empty">Select a commit to see its details.</div>;
  }

  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });
  const committedSeparately =
    details.committer !== details.author || details.commitDate !== details.date;

  return (
    <div className="details">
      <div className="details__subject">{details.subject}</div>
      {details.body && <pre className="details__body">{details.body}</pre>}
      <RefLabels labels={details.refs} />
      <div className="details__meta">
        <button className="details__link" title="Copy hash" onClick={() => onCopy(details.hash)}>
          {shortHash(details.hash)}
        </button>{' '}
        by <span title={details.authorEmail}>{details.author}</span> ·{' '}
        {formatCommitDate(details.date)}
      </div>
      {committedSeparately && (
        <div className="details__meta">
          committed by <span title={details.committerEmail}>{details.committer}</span> ·{' '}
          {formatCommitDate(details.commitDate)}
        </div>
      )}
      {details.parents.length > 0 && (
        <div className="details__meta">
          {details.parents.length > 1 ? 'Parents' : 'Parent'}:{' '}
          {details.parents.map((parent) => (
            <button
              key={parent}
              className="details__link"
              title="Go to parent"
              onClick={() => onSelectCommit(parent)}
            >
              {shortHash(parent)}
            </button>
          ))}
        </div>
      )}
      <div className="details__files-title">
        {details.files.length === 1 ? '1 file changed' : `${details.files.length} files changed`}
        {details.parents.length > 1 && ' (compared with the first parent)'}
      </div>
      <div className="files">
        <FileTree
          directory={buildDirectoryTree(details.files)}
          depth={0}
          collapsed={collapsed}
          onToggle={toggle}
          onOpenFile={onOpenFile}
        />
      </div>
    </div>
  );
}
