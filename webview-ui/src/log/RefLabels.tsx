import type { LogRef } from '../../../src/shared/protocol';

const MAX_LABELS = 3;

export function RefLabels({ labels }: { labels: LogRef[] }) {
  if (labels.length === 0) {
    return null;
  }
  const visible = labels.slice(0, MAX_LABELS);
  const hidden = labels.slice(MAX_LABELS);
  return (
    <span className="refs">
      {visible.map((label) => (
        <span
          key={`${label.kind}:${label.name}`}
          className={`ref ref--${label.kind}${label.current ? ' ref--current' : ''}`}
          title={
            label.current && label.kind === 'branch' ? `${label.name} (current branch)` : label.name
          }
        >
          {label.name}
        </span>
      ))}
      {hidden.length > 0 && (
        <span className="ref ref--more" title={hidden.map((label) => label.name).join('\n')}>
          +{hidden.length}
        </span>
      )}
    </span>
  );
}
