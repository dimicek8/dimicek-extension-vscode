import type { LogRef } from '../../shared/protocol';

const KIND_ORDER: Record<LogRef['kind'], number> = { head: 0, branch: 1, remote: 2, tag: 3 };

export function toLogRefs(refs: readonly string[], isHead: boolean, headRef?: string): LogRef[] {
  const labels: LogRef[] = [];
  if (isHead && headRef === undefined) {
    labels.push({ name: 'HEAD', kind: 'head', current: true });
  }
  for (const ref of refs) {
    if (ref.startsWith('refs/heads/')) {
      labels.push({
        name: ref.slice('refs/heads/'.length),
        kind: 'branch',
        current: ref === headRef,
      });
    } else if (ref.startsWith('refs/remotes/')) {
      const name = ref.slice('refs/remotes/'.length);
      if (!name.endsWith('/HEAD')) {
        labels.push({ name, kind: 'remote', current: false });
      }
    } else if (ref.startsWith('refs/tags/')) {
      labels.push({ name: ref.slice('refs/tags/'.length), kind: 'tag', current: false });
    }
  }
  return labels.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.name.localeCompare(b.name),
  );
}
