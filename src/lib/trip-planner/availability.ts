import type { Trip } from './types';

export type SelectedDateStatus = 'confirmed' | 'unavailable' | 'unanswered';

function days(start: string, end: string): string[] {
  const output: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last && output.length < 93) {
    output.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return output;
}

/** Summarise one traveller's explicit answer for the dates locked in by the organiser. */
export function selectedDateStatus(trip: Trip, participantId: string): SelectedDateStatus {
  const selected = trip.preferredDateRange;
  if (!selected) return 'confirmed';
  const entries = trip.availability.filter(entry => entry.participantId === participantId
    && entry.slot === 'all-day' && entry.date >= selected.start && entry.date <= selected.end);
  const matchingRange = trip.availabilityRanges.find(range => range.start === selected.start && range.end === selected.end);
  const rangeAnswer = matchingRange ? entries.find(entry => entry.date === matchingRange.start) : undefined;

  // Multi-option polls store one answer on the range's start date.
  if (trip.availabilityRanges.length > 1 && rangeAnswer) {
    return rangeAnswer.status === 'available' ? 'confirmed' : 'unavailable';
  }

  const selectedDays = days(selected.start, selected.end);
  if (entries.some(entry => entry.status !== 'available')) return 'unavailable';
  if (selectedDays.every(day => entries.some(entry => entry.date === day && entry.status === 'available'))) return 'confirmed';
  return 'unanswered';
}

export function confirmedParticipantIds(trip: Trip): string[] {
  if (!trip.preferredDateRange) return trip.participants.map(person => person.id);
  return trip.participants.filter(person => selectedDateStatus(trip, person.id) === 'confirmed').map(person => person.id);
}
