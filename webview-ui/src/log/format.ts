const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function formatCommitDate(time: number, now: number = Date.now(), locale?: string): string {
  const clock = new Date(time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY_MS);
  if (days === 0) {
    return `Today ${clock}`;
  }
  if (days === 1) {
    return `Yesterday ${clock}`;
  }
  const date = new Date(time).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
  return `${date} ${clock}`;
}

export function shortHash(hash: string): string {
  return hash.slice(0, 8);
}
