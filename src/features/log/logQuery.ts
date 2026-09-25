import type { LogOptions } from '../../git/parsers/log';
import type { LogFilters, LogPeriod } from '../../shared/protocol';

const PERIOD_DAYS: Record<LogPeriod, number> = { day: 1, week: 7, month: 30, year: 365 };
const HASH = /^[0-9a-f]{4,40}$/i;

export function isFiltered(filters: LogFilters): boolean {
  return Boolean(filters.text || filters.author || filters.since || filters.path);
}

export function looksLikeHash(text: string | undefined): text is string {
  return text !== undefined && HASH.test(text.trim());
}

export function toLogOptions(filters: LogFilters, now: Date = new Date()): LogOptions {
  const options: LogOptions = {};
  if (filters.branch) {
    options.revisions = [filters.branch];
  } else {
    options.all = true;
  }
  const text = filters.text?.trim();
  if (text) {
    options.grep = text;
  }
  const author = filters.author?.trim();
  if (author) {
    options.author = author;
  }
  if (filters.since) {
    options.since = new Date(now.getTime() - PERIOD_DAYS[filters.since] * 24 * 60 * 60 * 1000);
  }
  const path = filters.path?.trim();
  if (path) {
    options.paths = [path];
  }
  return options;
}
