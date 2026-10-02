import type {
  AccommodationOption, ActivityOption, AvailabilitySlot, AvailabilityStatus, CreateTripRequest, Id, Participant,
  TransportOption, Trip, TripAccessRequest, TripExport, TripRepository, TripSession, VoteValue,
} from './types';
import { buildDemoTrip } from './demo';

const clone = <T>(value: T): T => structuredClone(value);
const pause = () => new Promise(resolve => window.setTimeout(resolve, 90));
const colours = ['#8cc5a0', '#e4bd88', '#8fb2dc', '#d99da2', '#b7c982', '#b59acb', '#83c6bf'];
const DATABASE_NAME = 'trip-planner-local';
const DATABASE_VERSION = 1;

function normalizeTrip(trip: Trip): Trip {
  const now = new Date().toISOString();
  trip.revision ??= 0;
  trip.createdAt ??= now;
  trip.updatedAt ??= now;
  trip.activities ??= [];
  trip.participants.forEach(person => {
    person.sex ??= 'prefer-not-to-say';
    person.goWithFlow = false;
    const preferences = person.sleepingPreferences;
    preferences.roomPreferences ??= preferences.ownRoom === 'required'
      ? ['require-own']
      : preferences.ownRoom === 'preferred' ? ['happy-to-share', 'prefer-own'] : ['happy-to-share'];
    preferences.bedPreferences ??= [
      ...(preferences.ownBed ? ['own-bed' as const] : []),
      ...(preferences.acceptsSofaBed ? ['sofa-bed' as const] : []),
    ];
    preferences.shareWithParticipantIds ??= preferences.shareDoubleWithParticipantId ? [preferences.shareDoubleWithParticipantId] : [];
    person.baggage ??= [];
  });
  return trip;
}

function openDatabase(): Promise<IDBDatabase | undefined> {
  if (!('indexedDB' in window)) return Promise.resolve(undefined);
  return new Promise(resolve => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('trips')) {
        database.createObjectStore('trips', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('sessions')) database.createObjectStore('sessions', { keyPath: 'tripId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
  });
}

function readRecord<T>(database: IDBDatabase, storeName: string, key: IDBValidKey, indexName?: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const store = database.transaction(storeName, 'readonly').objectStore(storeName);
    const request = indexName ? store.index(indexName).get(key) : store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

function writeRecord(database: IDBDatabase, storeName: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(clone(value));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export class LocalTripRepository implements TripRepository {
  private readonly trips = new Map<Id, Trip>();
  private readonly database = openDatabase();

  async createTrip(request: CreateTripRequest): Promise<{ trip: Trip; session: TripSession }> {
    await pause();
    if (!request.availabilityRanges.length) throw new Error('Select at least one potential date range.');
    const id = `trip_${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
    const participantId = `person-${crypto.randomUUID()}`;
    const person = this.newParticipant(participantId, request.displayName, 0);
    const availabilityRanges = request.availabilityRanges
      .map(candidate => ({ id: `range-${crypto.randomUUID()}`, ...candidate }))
      .sort((a, b) => a.start.localeCompare(b.start));
    const availabilityWindow = { start: availabilityRanges[0].start, end: availabilityRanges.at(-1)!.end };
    const trip: Trip = {
      id,
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: request.title.trim(),
      subtitle: 'A plan made together.',
      destination: request.destination.trim(),
      destinationCoordinates: request.destinationCoordinates,
      stage: 'planning',
      currency: 'GBP',
      dateRange: { start: availabilityRanges[0].start, end: availabilityRanges[0].end },
      availabilityWindow,
      availabilityRanges,
      participants: [person],
      availability: [],
      transportOptions: [],
      accommodationOptions: [],
      activities: [],
    };
    this.trips.set(id, trip);
    const session = { tripId: id, participantId, displayName: person.name };
    await Promise.all([this.saveTrip(trip), this.saveSession(session)]);
    return { trip: clone(trip), session };
  }

  async createDemoTrip(): Promise<{ trip: Trip; session: TripSession }> {
    await pause();
    const id = `trip_${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
    const trip = buildDemoTrip(id);
    this.trips.set(id, trip);
    const session = { tripId: id, participantId: 'oliver', displayName: 'Sam' };
    await Promise.all([this.saveTrip(trip), this.saveSession(session)]);
    return { trip: clone(trip), session };
  }

  async importTrip(exported: TripExport): Promise<{ trip: Trip; session: TripSession }> {
    await pause();
    if (exported?.schemaVersion !== 1 || !exported.trip?.id || !Array.isArray(exported.trip.participants)) {
      throw new Error('This is not a valid trip planner export.');
    }
    const trip = normalizeTrip(clone(exported.trip));
    if (!trip.participants.length) throw new Error('The exported trip has no travellers.');
    this.trips.set(trip.id, trip);
    const person = trip.participants[0];
    const session = { tripId: trip.id, participantId: person.id, displayName: person.name };
    await Promise.all([this.saveTrip(trip), this.saveSession(session)]);
    return { trip: clone(trip), session };
  }

  async restoreTrip(tripId: string): Promise<{ trip: Trip; session: TripSession } | undefined> {
    const database = await this.database;
    if (!database) return undefined;
    const storedTrip = await readRecord<Trip>(database, 'trips', tripId);
    if (!storedTrip) return undefined;
    normalizeTrip(storedTrip);
    this.trips.set(storedTrip.id, storedTrip);
    let storedSession = await readRecord<TripSession>(database, 'sessions', storedTrip.id);
    const participant = storedTrip.participants.find(person => person.id === storedSession?.participantId) ?? storedTrip.participants[0];
    if (!participant) return undefined;
    if (!storedSession || storedSession.participantId !== participant.id) {
      storedSession = { tripId: storedTrip.id, participantId: participant.id, displayName: participant.name };
      await this.saveSession(storedSession);
    }
    return { trip: clone(storedTrip), session: clone(storedSession) };
  }

  async accessTrip(request: TripAccessRequest): Promise<{ trip: Trip; session: TripSession }> {
    await pause();
    let trip = this.trips.get(request.tripId);
    if (!trip) {
      const database = await this.database;
      trip = database ? await readRecord<Trip>(database, 'trips', request.tripId) : undefined;
      if (trip) this.trips.set(trip.id, trip);
    }
    if (!trip) throw new Error('This trip is not stored in this browser.');
    normalizeTrip(trip);
    const name = request.displayName.trim();
    if (!name) throw new Error('Enter your name to join the trip.');
    let person = trip.participants.find(candidate => candidate.name.toLowerCase() === name.toLowerCase());
    if (!person) {
      person = this.newParticipant(`person-${crypto.randomUUID()}`, name, trip.participants.length);
      trip.participants.push(person);
    }
    const session = { tripId: trip.id, participantId: person.id, displayName: person.name };
    await Promise.all([this.saveTrip(trip), this.saveSession(session)]);
    return { trip: clone(trip), session };
  }

  async getTrip(tripId: Id): Promise<Trip> {
    await pause();
    let trip = this.trips.get(tripId);
    if (!trip) {
      const database = await this.database;
      trip = database ? await readRecord<Trip>(database, 'trips', tripId) : undefined;
      if (trip) this.trips.set(tripId, trip);
    }
    if (!trip) throw new Error('Trip not found.');
    normalizeTrip(trip);
    return clone(trip);
  }

  async updateTrip(tripId: Id, patch: Pick<Trip, 'title' | 'destination' | 'destinationCoordinates' | 'dateRange' | 'availabilityWindow'>): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    Object.assign(trip, clone(patch));
    if (trip.availabilityRanges[0]) Object.assign(trip.availabilityRanges[0], clone(patch.availabilityWindow));
    return this.commit(trip);
  }

  async saveAvailabilityRange(tripId: Id, range: { id: Id; start: string; end: string }): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    const index = trip.availabilityRanges.findIndex(candidate => candidate.id === range.id);
    if (index >= 0) trip.availabilityRanges[index] = clone(range); else trip.availabilityRanges.push(clone(range));
    trip.availabilityRanges.sort((a, b) => a.start.localeCompare(b.start));
    trip.availabilityWindow = { start: trip.availabilityRanges[0].start, end: trip.availabilityRanges.at(-1)!.end };
    return this.commit(trip);
  }

  async removeAvailabilityRange(tripId: Id, rangeId: Id): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    if (trip.availabilityRanges.length <= 1) throw new Error('A trip needs at least one candidate date range.');
    const removed = trip.availabilityRanges.find(candidate => candidate.id === rangeId);
    trip.availabilityRanges = trip.availabilityRanges.filter(candidate => candidate.id !== rangeId);
    if (removed) trip.availability = trip.availability.filter(entry => entry.date < removed.start || entry.date > removed.end);
    trip.availabilityWindow = { start: trip.availabilityRanges[0].start, end: trip.availabilityRanges.at(-1)!.end };
    return this.commit(trip);
  }

  async resetAvailability(tripId: Id): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    trip.availability = [];
    return this.commit(trip);
  }

  async selectPreferredDates(tripId: Id, selected: { start: string; end: string }): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    trip.preferredDateRange = clone(selected);
    trip.dateRange = clone(selected);
    return this.commit(trip);
  }

  async saveParticipant(tripId: Id, participant: Participant): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    const previousPartnerId = trip.participants.find(candidate => candidate.id === participant.id)?.sleepingPreferences.shareDoubleWithParticipantId;
    const index = trip.participants.findIndex(candidate => candidate.id === participant.id);
    if (index >= 0) trip.participants[index] = clone(participant);
    else trip.participants.push(clone(participant));
    if (previousPartnerId && previousPartnerId !== participant.sleepingPreferences.shareDoubleWithParticipantId) {
      const previousPartner = trip.participants.find(candidate => candidate.id === previousPartnerId);
      if (previousPartner?.sleepingPreferences.shareDoubleWithParticipantId === participant.id) previousPartner.sleepingPreferences.shareDoubleWithParticipantId = undefined;
      if (previousPartner) previousPartner.sleepingPreferences.shareWithParticipantIds = previousPartner.sleepingPreferences.shareWithParticipantIds.filter(id => id !== participant.id);
    }
    const partnerId = participant.sleepingPreferences.shareDoubleWithParticipantId;
    if (partnerId) {
      const savedParticipant = trip.participants.find(candidate => candidate.id === participant.id)!;
      const partner = trip.participants.find(candidate => candidate.id === partnerId);
      savedParticipant.sleepingPreferences.ownBed = false;
      if (partner) {
        const partnerPreviousId = partner.sleepingPreferences.shareDoubleWithParticipantId;
        if (partnerPreviousId && partnerPreviousId !== participant.id) {
          const partnerPrevious = trip.participants.find(candidate => candidate.id === partnerPreviousId);
          if (partnerPrevious?.sleepingPreferences.shareDoubleWithParticipantId === partner.id) partnerPrevious.sleepingPreferences.shareDoubleWithParticipantId = undefined;
        }
        partner.sleepingPreferences.shareDoubleWithParticipantId = participant.id;
        partner.sleepingPreferences.ownBed = false;
        if (!partner.sleepingPreferences.shareWithParticipantIds.includes(participant.id)) partner.sleepingPreferences.shareWithParticipantIds.push(participant.id);
      }
    }
    return this.commit(trip);
  }

  async setAvailability(tripId: Id, participantId: Id, date: string, slot: AvailabilitySlot, status: AvailabilityStatus): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    const existing = trip.availability.find(entry => entry.participantId === participantId && entry.date === date && entry.slot === slot);
    if (existing) existing.status = status;
    else trip.availability.push({ participantId, date, slot, status });
    return this.commit(trip);
  }

  async setRangeAvailability(tripId: Id, participantId: Id, start: string, end: string, status: AvailabilityStatus): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    trip.availability = trip.availability.filter(entry => entry.participantId !== participantId || entry.date < start || entry.date > end);
    if (status === 'available') trip.availability.push({ participantId, date: start, slot: 'all-day', status });
    return this.commit(trip);
  }

  async saveTransportOption(tripId: Id, option: TransportOption): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    const index = trip.transportOptions.findIndex(candidate => candidate.id === option.id);
    if (index >= 0) trip.transportOptions[index] = clone(option); else trip.transportOptions.push(clone(option));
    return this.commit(trip);
  }

  async removeTransportOption(tripId: Id, transportId: Id): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    trip.transportOptions = trip.transportOptions.filter(option => option.id !== transportId);
    return this.commit(trip);
  }

  async voteForTransport(tripId: Id, transportId: Id, participantId: Id, vote: VoteValue): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    const option = trip.transportOptions.find(candidate => candidate.id === transportId);
    if (!option) throw new Error('Transport option not found.');
    option.votes[participantId] = vote;
    return this.commit(trip);
  }

  async selectTransport(tripId: Id, transportId: Id): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    const selected = trip.transportOptions.find(candidate => candidate.id === transportId);
    if (!selected) throw new Error('Transport option not found.');
    selected.status = selected.status === 'selected' ? 'shortlisted' : 'selected';
    return this.commit(trip);
  }

  async saveAccommodationOption(tripId: Id, option: AccommodationOption): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    const index = trip.accommodationOptions.findIndex(candidate => candidate.id === option.id);
    if (index >= 0) trip.accommodationOptions[index] = clone(option); else trip.accommodationOptions.push(clone(option));
    return this.commit(trip);
  }

  async voteForAccommodation(tripId: Id, accommodationId: Id, participantId: Id, vote: VoteValue): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    this.requireAccommodation(trip, accommodationId).votes[participantId] = vote;
    return this.commit(trip);
  }

  async selectAccommodation(tripId: Id, accommodationId: Id): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    trip.accommodationOptions.forEach(option => { option.status = option.id === accommodationId ? 'selected' : 'shortlisted'; });
    return this.commit(trip);
  }

  async saveActivityOption(tripId: Id, activity: ActivityOption): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    trip.activities ??= [];
    const index = trip.activities.findIndex(candidate => candidate.id === activity.id);
    if (index >= 0) trip.activities[index] = clone(activity); else trip.activities.push(clone(activity));
    return this.commit(trip);
  }

  async removeActivityOption(tripId: Id, activityId: Id): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    trip.activities = trip.activities.filter(option => option.id !== activityId);
    return this.commit(trip);
  }

  async voteForActivity(tripId: Id, activityId: Id, participantId: Id, vote: VoteValue): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    const activity = trip.activities.find(candidate => candidate.id === activityId);
    if (!activity) throw new Error('Activity not found.');
    activity.votes[participantId] = vote;
    return this.commit(trip);
  }

  async selectActivity(tripId: Id, activityId: Id): Promise<Trip> {
    await pause();
    const trip = this.requireTrip(tripId);
    const activity = trip.activities.find(candidate => candidate.id === activityId);
    if (!activity) throw new Error('Activity not found.');
    activity.status = activity.status === 'selected' ? 'shortlisted' : 'selected';
    return this.commit(trip);
  }

  private async commit(trip: Trip): Promise<Trip> {
    trip.revision += 1;
    trip.updatedAt = new Date().toISOString();
    this.trips.set(trip.id, trip);
    await this.saveTrip(trip);
    return clone(trip);
  }

  private async saveTrip(trip: Trip): Promise<void> {
    const database = await this.database;
    if (database) await writeRecord(database, 'trips', trip);
  }

  private async saveSession(session: TripSession): Promise<void> {
    const database = await this.database;
    if (database) await writeRecord(database, 'sessions', session);
  }

  private newParticipant(id: Id, name: string, index: number): Participant {
    const cleanName = name.trim();
    return {
      id, name: cleanName, initials: cleanName.slice(0, 1).toUpperCase(),
      colour: colours[index % colours.length], origin: '', sex: 'prefer-not-to-say', confirmed: false, goWithFlow: false,
      sleepingPreferences: { ownRoom: 'not-needed', ownBed: true, acceptsSofaBed: false, roomPreferences: ['happy-to-share'], bedPreferences: ['own-bed'], shareWithParticipantIds: [] }, baggage: [],
    };
  }

  private requireTrip(tripId: Id): Trip {
    const trip = this.trips.get(tripId);
    if (!trip) throw new Error('Trip not found.');
    return trip;
  }

  private requireAccommodation(trip: Trip, accommodationId: Id): AccommodationOption {
    const accommodation = trip.accommodationOptions.find(option => option.id === accommodationId);
    if (!accommodation) throw new Error('Accommodation option not found.');
    return accommodation;
  }
}
