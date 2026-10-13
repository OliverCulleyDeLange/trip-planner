import { describe, expect, it } from 'vitest';
import { canonicalDateTime, formatDate, normalizeDateTime } from './date';

describe('trip date formatting', () => {
  it('normalizes legacy datetimes with a single-digit hour', () => {
    expect(normalizeDateTime('2026-11-05T9:50')).toBe('2026-11-05T09:50');
    expect(canonicalDateTime('2026-11-05T9:50')).toBe('2026-11-05T09:50');
    expect(formatDate('2026-11-05T9:50', { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('09:50');
  });

  it('stores local datetimes at minute precision and rejects impossible values', () => {
    expect(canonicalDateTime('2026-11-05T09:50:42')).toBe('2026-11-05T09:50');
    expect(canonicalDateTime('')).toBe('');
    expect(() => canonicalDateTime('2026-02-31T09:50')).toThrow('Enter a valid local date and time.');
  });

  it('does not throw when persisted data is not a date', () => {
    expect(formatDate('not-a-date')).toBeUndefined();
  });
});
