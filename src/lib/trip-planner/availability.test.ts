import { describe, expect, it } from 'vitest';
import { buildDemoTrip } from './demo';
import { confirmedParticipantIds, selectedDateStatus } from './availability';

describe('selected date availability', () => {
  it('requires an explicit available answer for every day in a day-by-day poll', () => {
    const trip = buildDemoTrip('availability-days');
    const person = trip.participants[0];
    trip.availabilityRanges = [{ id: 'range', start: '2027-01-09', end: '2027-01-11' }];
    trip.preferredDateRange = { start: '2027-01-09', end: '2027-01-11' };
    trip.availability = [
      { participantId: person.id, date: '2027-01-09', slot: 'all-day', status: 'available' },
      { participantId: person.id, date: '2027-01-10', slot: 'all-day', status: 'available' },
    ];
    expect(selectedDateStatus(trip, person.id)).toBe('unanswered');
    trip.availability.push({ participantId: person.id, date: '2027-01-11', slot: 'all-day', status: 'unavailable' });
    expect(selectedDateStatus(trip, person.id)).toBe('unavailable');
    trip.availability.at(-1)!.status = 'available';
    expect(selectedDateStatus(trip, person.id)).toBe('confirmed');
  });

  it('uses the single stored answer for a selected option in a multi-range poll', () => {
    const trip = buildDemoTrip('availability-ranges');
    const person = trip.participants[0];
    const selected = trip.availabilityRanges[1];
    trip.preferredDateRange = { start: selected.start, end: selected.end };
    trip.availability = [{ participantId: person.id, date: selected.start, slot: 'all-day', status: 'available' }];
    expect(selectedDateStatus(trip, person.id)).toBe('confirmed');
    expect(confirmedParticipantIds(trip)).toContain(person.id);
  });
});
