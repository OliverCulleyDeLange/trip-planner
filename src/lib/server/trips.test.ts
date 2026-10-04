import { describe, expect, it } from 'vitest';
import { applyMutation, createTrip, importTrip, joinTrip, newTripId } from './trips';
import { buildDemoTrip } from '../trip-planner/demo';
import type { TripExport } from '../trip-planner/types';

const request = {
  displayName: 'Oliver', title: 'Winter trip', destination: 'Madrid',
  availabilityRanges: [{ start: '2027-01-10', end: '2027-01-12' }],
};

describe('trip model', () => {
  it('creates high-entropy URL-safe trip IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newTripId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^trip_[A-Za-z0-9_-]{32}$/);
  });

  it('creates and joins a shared trip without a password', () => {
    const created = createTrip(request);
    const joined = joinTrip(created.trip, 'Alex');
    expect(joined.session.displayName).toBe('Alex');
    expect(joined.trip.participants.map(person => person.name)).toEqual(['Oliver', 'Alex']);
  });

  it('applies mutations without discarding unrelated records', () => {
    const { trip } = createTrip(request);
    applyMutation(trip, { operation: 'setAvailability', payload: { participantId: trip.participants[0].id, date: '2027-01-10', slot: 'all-day', status: 'available' } });
    applyMutation(trip, { operation: 'updateTrip', payload: { title: 'Renamed', destination: 'Madrid', dateRange: trip.dateRange, availabilityWindow: trip.availabilityWindow } });
    expect(trip.title).toBe('Renamed');
    expect(trip.availability).toHaveLength(1);
  });

  it('imports legacy exports under a fresh private ID', () => {
    const { trip } = createTrip(request);
    const oldId = trip.id;
    const result = importTrip({ schemaVersion: 1, exportedAt: new Date().toISOString(), trip } satisfies TripExport);
    expect(result.trip.id).not.toBe(oldId);
    expect(result.trip.id).toMatch(/^trip_[A-Za-z0-9_-]{32}$/);
    expect(result.trip.revision).toBe(0);
  });

  it('creates a complete demo journey for every traveller', () => {
    const trip = buildDemoTrip('demo');
    for (const person of trip.participants) {
      const journeys = trip.transportOptions.filter(option => option.participantIds.includes(person.id));
      expect(journeys.some(option => option.departureAt.startsWith(trip.dateRange.start))).toBe(true);
      expect(journeys.some(option => option.departureAt.startsWith(trip.dateRange.end))).toBe(true);
    }
  });
});
