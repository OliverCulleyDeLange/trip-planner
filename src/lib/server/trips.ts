import type {
  AccommodationOption, ActivityOption, AvailabilitySlot, AvailabilityStatus, CreateTripRequest, Participant,
  TransportOption, Trip, TripExport, TripSession, VoteValue,
} from '../trip-planner/types';

const colours = ['#8cc5a0', '#e4bd88', '#8fb2dc', '#d99da2', '#b7c982', '#b59acb', '#83c6bf'];
const clone = <T>(value: T): T => structuredClone(value);

export type TripMutation = { operation: string; payload: unknown };

export function newTripId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `trip_${btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
}

export function newParticipant(name: string, index: number, id = `person-${crypto.randomUUID()}`): Participant {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 80) throw new Error('Enter a name between 1 and 80 characters.');
  return {
    id, name: cleanName, initials: cleanName.slice(0, 1).toUpperCase(), colour: colours[index % colours.length],
    origin: '', sex: 'prefer-not-to-say', confirmed: false, goWithFlow: false,
    sleepingPreferences: {
      ownRoom: 'not-needed', ownBed: true, acceptsSofaBed: false, roomPreferences: ['happy-to-share'],
      bedPreferences: ['own-bed'], shareWithParticipantIds: [],
    },
    baggage: [],
  };
}

export function createTrip(request: CreateTripRequest): { trip: Trip; session: TripSession } {
  if (!request.availabilityRanges?.length) throw new Error('Select at least one potential date range.');
  const now = new Date().toISOString();
  const id = newTripId();
  const person = newParticipant(request.displayName, 0);
  const availabilityRanges = request.availabilityRanges
    .map(candidate => ({ id: `range-${crypto.randomUUID()}`, start: candidate.start, end: candidate.end }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const trip: Trip = {
    id, revision: 0, createdAt: now, updatedAt: now, title: request.title.trim().slice(0, 160),
    subtitle: 'A plan made together.', destination: request.destination.trim().slice(0, 240),
    destinationCoordinates: request.destinationCoordinates, stage: 'planning', currency: 'GBP',
    dateRange: { start: availabilityRanges[0].start, end: availabilityRanges[0].end },
    availabilityWindow: { start: availabilityRanges[0].start, end: availabilityRanges.at(-1)!.end },
    availabilityRanges, participants: [person], availability: [], transportOptions: [], accommodationOptions: [], activities: [],
  };
  return { trip, session: { tripId: id, participantId: person.id, displayName: person.name } };
}

export function importTrip(exported: TripExport): { trip: Trip; session: TripSession } {
  if (exported?.schemaVersion !== 1 || !Array.isArray(exported.trip?.participants) || !exported.trip.participants.length) {
    throw new Error('This is not a valid trip planner export.');
  }
  const now = new Date().toISOString();
  const trip = normalizeTrip({ ...clone(exported.trip), id: newTripId(), revision: 0, createdAt: now, updatedAt: now });
  const person = trip.participants[0];
  return { trip, session: { tripId: trip.id, participantId: person.id, displayName: person.name } };
}

export function normalizeTrip(trip: Trip): Trip {
  trip.activities ??= [];
  trip.participants ??= [];
  trip.availability ??= [];
  trip.transportOptions ??= [];
  trip.accommodationOptions ??= [];
  trip.transportOptions.forEach(option => {
    if ((option.mode as string) === 'transfer') option.mode = 'coach';
  });
  trip.participants.forEach(person => {
    person.sex ??= 'prefer-not-to-say';
    person.goWithFlow ??= false;
    person.baggage ??= [];
    const preferences = person.sleepingPreferences;
    preferences.roomPreferences ??= preferences.ownRoom === 'required' ? ['require-own'] : ['happy-to-share'];
    preferences.bedPreferences ??= preferences.ownBed ? ['own-bed'] : [];
    preferences.bedPreferences = preferences.bedPreferences.filter(preference => (preference as string) !== 'sofa-bed');
    preferences.acceptsSofaBed = false;
    preferences.shareWithParticipantIds ??= preferences.shareDoubleWithParticipantId ? [preferences.shareDoubleWithParticipantId] : [];
  });
  return trip;
}

export function joinTrip(trip: Trip, displayName = '', participantId?: string): { trip: Trip; session: TripSession } {
  const name = displayName.trim();
  let person = participantId
    ? trip.participants.find(candidate => candidate.id === participantId)
    : trip.participants.find(candidate => candidate.name.toLowerCase() === name.toLowerCase());
  if (participantId && !person) throw new Error('That traveller is no longer on this trip. Choose another name.');
  if (!person) {
    person = newParticipant(name, trip.participants.length);
    trip.participants.push(person);
  }
  return { trip, session: { tripId: trip.id, participantId: person.id, displayName: person.name } };
}

export function applyMutation(trip: Trip, mutation: TripMutation): Trip {
  const payload = mutation.payload as Record<string, unknown>;
  switch (mutation.operation) {
    case 'updateTrip': {
      const patch = mutation.payload as Pick<Trip, 'title' | 'destination' | 'destinationCoordinates' | 'dateRange' | 'availabilityWindow'>;
      trip.title = patch.title;
      trip.destination = patch.destination;
      trip.destinationCoordinates = patch.destinationCoordinates;
      trip.dateRange = clone(patch.dateRange);
      trip.availabilityWindow = clone(patch.availabilityWindow);
      if (trip.availabilityRanges[0]) Object.assign(trip.availabilityRanges[0], clone(patch.availabilityWindow));
      break;
    }
    case 'saveAvailabilityRange': {
      const range = mutation.payload as { id: string; start: string; end: string };
      const index = trip.availabilityRanges.findIndex(candidate => candidate.id === range.id);
      if (index >= 0) trip.availabilityRanges[index] = clone(range); else trip.availabilityRanges.push(clone(range));
      trip.availabilityRanges.sort((a, b) => a.start.localeCompare(b.start));
      trip.availabilityWindow = { start: trip.availabilityRanges[0].start, end: trip.availabilityRanges.at(-1)!.end };
      break;
    }
    case 'removeAvailabilityRange': {
      if (trip.availabilityRanges.length <= 1) throw new Error('A trip needs at least one candidate date range.');
      const rangeId = String(payload.rangeId);
      const removed = trip.availabilityRanges.find(candidate => candidate.id === rangeId);
      trip.availabilityRanges = trip.availabilityRanges.filter(candidate => candidate.id !== rangeId);
      if (removed) trip.availability = trip.availability.filter(entry => entry.date < removed.start || entry.date > removed.end);
      trip.availabilityWindow = { start: trip.availabilityRanges[0].start, end: trip.availabilityRanges.at(-1)!.end };
      break;
    }
    case 'resetAvailability': trip.availability = []; break;
    case 'selectPreferredDates': {
      const selected = mutation.payload as { start: string; end: string };
      trip.preferredDateRange = clone(selected); trip.dateRange = clone(selected); break;
    }
    case 'saveParticipant': saveParticipant(trip, mutation.payload as Participant); break;
    case 'removeParticipant': removeParticipant(trip, String(payload.participantId)); break;
    case 'setAvailability': {
      const entry = payload as unknown as { participantId: string; date: string; slot: AvailabilitySlot; status: AvailabilityStatus };
      const existing = trip.availability.find(candidate => candidate.participantId === entry.participantId && candidate.date === entry.date && candidate.slot === entry.slot);
      if (existing) existing.status = entry.status; else trip.availability.push(clone(entry));
      break;
    }
    case 'setRangeAvailability': {
      const entry = payload as unknown as { participantId: string; start: string; end: string; status: AvailabilityStatus };
      trip.availability = trip.availability.filter(candidate => candidate.participantId !== entry.participantId || candidate.date < entry.start || candidate.date > entry.end);
      if (entry.status === 'available') trip.availability.push({ participantId: entry.participantId, date: entry.start, slot: 'all-day', status: entry.status });
      break;
    }
    case 'saveTransportOption': upsert(trip.transportOptions, mutation.payload as TransportOption); break;
    case 'removeTransportOption': trip.transportOptions = trip.transportOptions.filter(option => option.id !== String(payload.transportId)); break;
    case 'voteForTransport': requireItem(trip.transportOptions, String(payload.transportId), 'Transport').votes[String(payload.participantId)] = payload.vote as VoteValue; break;
    case 'selectTransport': {
      const selected = requireItem(trip.transportOptions, String(payload.transportId), 'Transport');
      selected.status = selected.status === 'selected' ? 'shortlisted' : 'selected'; break;
    }
    case 'saveAccommodationOption': upsert(trip.accommodationOptions, mutation.payload as AccommodationOption); break;
    case 'removeAccommodationOption': trip.accommodationOptions = trip.accommodationOptions.filter(option => option.id !== String(payload.accommodationId)); break;
    case 'voteForAccommodation': requireItem(trip.accommodationOptions, String(payload.accommodationId), 'Accommodation').votes[String(payload.participantId)] = payload.vote as VoteValue; break;
    case 'selectAccommodation': trip.accommodationOptions.forEach(option => { option.status = option.id === String(payload.accommodationId) ? 'selected' : 'shortlisted'; }); break;
    case 'saveActivityOption': upsert(trip.activities, mutation.payload as ActivityOption); break;
    case 'removeActivityOption': trip.activities = trip.activities.filter(option => option.id !== String(payload.activityId)); break;
    case 'voteForActivity': requireItem(trip.activities, String(payload.activityId), 'Activity').votes[String(payload.participantId)] = payload.vote as VoteValue; break;
    case 'selectActivity': {
      const selected = requireItem(trip.activities, String(payload.activityId), 'Activity');
      selected.status = selected.status === 'selected' ? 'shortlisted' : 'selected'; break;
    }
    default: throw new Error('Unsupported trip change.');
  }
  return trip;
}

function upsert<T extends { id: string }>(items: T[], item: T): void {
  const index = items.findIndex(candidate => candidate.id === item.id);
  if (index >= 0) items[index] = clone(item); else items.push(clone(item));
}

function requireItem<T extends { id: string }>(items: T[], id: string, label: string): T {
  const item = items.find(candidate => candidate.id === id);
  if (!item) throw new Error(`${label} option not found.`);
  return item;
}

function saveParticipant(trip: Trip, participant: Participant): void {
  const previousPartnerId = trip.participants.find(candidate => candidate.id === participant.id)?.sleepingPreferences.shareDoubleWithParticipantId;
  upsert(trip.participants, participant);
  if (previousPartnerId && previousPartnerId !== participant.sleepingPreferences.shareDoubleWithParticipantId) {
    const previous = trip.participants.find(candidate => candidate.id === previousPartnerId);
    if (previous?.sleepingPreferences.shareDoubleWithParticipantId === participant.id) previous.sleepingPreferences.shareDoubleWithParticipantId = undefined;
    if (previous) previous.sleepingPreferences.shareWithParticipantIds = previous.sleepingPreferences.shareWithParticipantIds.filter(id => id !== participant.id);
  }
  const partnerId = participant.sleepingPreferences.shareDoubleWithParticipantId;
  if (!partnerId) return;
  const saved = trip.participants.find(candidate => candidate.id === participant.id)!;
  const partner = trip.participants.find(candidate => candidate.id === partnerId);
  saved.sleepingPreferences.ownBed = false;
  if (partner) {
    partner.sleepingPreferences.shareDoubleWithParticipantId = participant.id;
    partner.sleepingPreferences.ownBed = false;
    if (!partner.sleepingPreferences.shareWithParticipantIds.includes(participant.id)) partner.sleepingPreferences.shareWithParticipantIds.push(participant.id);
  }
}

function removeParticipant(trip: Trip, participantId: string): void {
  if (trip.participants.length <= 1) throw new Error('A trip needs at least one person.');
  if (!trip.participants.some(person => person.id === participantId)) throw new Error('Person not found.');
  trip.participants = trip.participants.filter(person => person.id !== participantId);
  trip.availability = trip.availability.filter(entry => entry.participantId !== participantId);
  trip.participants.forEach(person => {
    if (person.sleepingPreferences.shareDoubleWithParticipantId === participantId) person.sleepingPreferences.shareDoubleWithParticipantId = undefined;
    person.sleepingPreferences.shareWithParticipantIds = person.sleepingPreferences.shareWithParticipantIds.filter(id => id !== participantId);
  });
  [...trip.transportOptions, ...trip.accommodationOptions, ...trip.activities].forEach(option => {
    if (option.participantIds) option.participantIds = option.participantIds.filter(id => id !== participantId);
    delete option.votes[participantId];
  });
}
