import { useVirtualizer } from '@tanstack/react-virtual';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { LogCommit } from '../../../src/shared/protocol';
import { formatCommitDate, shortHash } from './format';
import { GraphCell } from './GraphCell';

export const ROW_HEIGHT = 22;
const LOAD_MORE_THRESHOLD = 100;

interface CommitListProps {
  commits: LogCommit[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

export function CommitList({ commits, hasMore, loading, onLoadMore }: CommitListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string>();

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.length > 0 ? items[items.length - 1]!.index : 0;

  useEffect(() => {
    if (hasMore && !loading && lastIndex >= commits.length - LOAD_MORE_THRESHOLD) {
      onLoadMore();
    }
  }, [hasMore, loading, lastIndex, commits.length, onLoadMore]);

  const selectedIndex = commits.findIndex((commit) => commit.hash === selected);

  const onKeyDown = (event: KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 20, PageUp: -20 }[event.key];
    if (step === undefined || commits.length === 0) {
      return;
    }
    event.preventDefault();
    const next = Math.min(commits.length - 1, Math.max(0, selectedIndex + step));
    setSelected(commits[next]!.hash);
    virtualizer.scrollToIndex(next);
  };

  return (
    <div className="log">
      <div className="log__header log__row">
        <span className="log__subject">Subject</span>
        <span className="log__author">Author</span>
        <span className="log__date">Date</span>
        <span className="log__hash">Hash</span>
      </div>
      <div
        ref={scrollRef}
        className="log__scroll"
        tabIndex={0}
        role="listbox"
        aria-label="Commits"
        aria-activedescendant={selected ? `commit-${selected}` : undefined}
        onKeyDown={onKeyDown}
      >
        <div className="log__spacer" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((item) => {
            const commit = commits[item.index]!;
            const isSelected = commit.hash === selected;
            return (
              <div
                key={commit.hash}
                id={`commit-${commit.hash}`}
                role="option"
                aria-selected={isSelected}
                className={`log__row log__commit${isSelected ? ' log__commit--selected' : ''}${commit.isHead ? ' log__commit--head' : ''}`}
                style={{ transform: `translateY(${item.start}px)` }}
                onMouseDown={() => setSelected(commit.hash)}
              >
                <span className="log__subject">
                  <GraphCell
                    row={commit.graph}
                    height={ROW_HEIGHT}
                    isHead={commit.isHead}
                    isMerge={commit.parents.length > 1}
                  />
                  <span className="log__subject-text" title={commit.subject}>
                    {commit.subject}
                  </span>
                </span>
                <span className="log__author" title={commit.authorEmail}>
                  {commit.author}
                </span>
                <span className="log__date">{formatCommitDate(commit.date)}</span>
                <span className="log__hash">{shortHash(commit.hash)}</span>
              </div>
            );
          })}
        </div>
        {loading && <div className="log__loading">Loading…</div>}
      </div>
    </div>
  );
}
