/** Normalise legacy local datetimes whose hour was stored without a leading zero. */
export function normalizeDateTime(value: string): string {
  return value.trim().replace(/^(\d{4}-\d{2}-\d{2}T)(\d)(:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)$/, '$10$2$3');
}

/** Return the minute-precision local datetime format persisted by the planner. */
export function canonicalDateTime(value: string): string {
  const normalized = normalizeDateTime(value);
  if (!normalized) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(normalized);
  if (!match) throw new Error('Enter a valid local date and time.');
  const [, year, month, day, hour, minute] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() + 1 !== Number(month)
    || parsed.getUTCDate() !== Number(day) || parsed.getUTCHours() !== Number(hour)
    || parsed.getUTCMinutes() !== Number(minute)) throw new Error('Enter a valid local date and time.');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' },
): string | undefined {
  const normalized = normalizeDateTime(value.length === 10 ? `${value}T12:00:00` : value);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return new Intl.DateTimeFormat('en-GB', options).format(parsed);
}
