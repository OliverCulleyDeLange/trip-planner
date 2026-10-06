import type {
  AccommodationOption, ActivityOption, BaggageItem, BaggageRule, Bed, GeoCoordinates, Participant,
  Trip, TripSession, VoteValue,
} from '../trip-planner/types';
import { normalizeTrip } from './trips.ts';

type TripRow = {
  id: string; revision: number; title: string; subtitle: string; destination: string;
  destination_latitude: number | null; destination_longitude: number | null; stage: Trip['stage']; currency: Trip['currency'];
  date_start: string; date_end: string; availability_start: string; availability_end: string;
  preferred_start: string | null; preferred_end: string | null; created_at: string; updated_at: string;
};
type DatabaseRow = Record<string, string | number | null>;

export const tripColumns = [
  'id', 'revision', 'title', 'subtitle', 'destination', 'destination_latitude', 'destination_longitude',
  'stage', 'currency', 'date_start', 'date_end', 'availability_start', 'availability_end',
  'preferred_start', 'preferred_end', 'created_at', 'updated_at',
] as const;

export const relationalTableColumns = {
  participants: ['trip_id', 'id', 'position', 'name', 'initials', 'colour', 'origin', 'origin_latitude', 'origin_longitude', 'sex', 'confirmed', 'go_with_flow', 'own_room', 'own_bed', 'share_double_with_participant_id', 'accepts_sofa_bed'],
  participant_room_preferences: ['trip_id', 'participant_id', 'position', 'preference'],
  participant_bed_preferences: ['trip_id', 'participant_id', 'position', 'preference'],
  participant_shares: ['trip_id', 'participant_id', 'shared_participant_id', 'position'],
  baggage_items: ['trip_id', 'participant_id', 'id', 'position', 'label', 'weight_kg', 'length_cm', 'width_cm', 'height_cm', 'category'],
  availability_ranges: ['trip_id', 'id', 'position', 'start_date', 'end_date'],
  availability: ['trip_id', 'participant_id', 'date', 'slot', 'position', 'status'],
  transport_options: ['trip_id', 'id', 'position', 'mode', 'status', 'title', 'operator', 'service_number', 'origin', 'origin_latitude', 'origin_longitude', 'destination', 'destination_latitude', 'destination_longitude', 'departure_at', 'arrival_at', 'seats', 'price_per_person', 'currency', 'booking_url', 'notes', 'booking_reference'],
  transport_participants: ['trip_id', 'transport_id', 'participant_id', 'position'],
  transport_baggage_rules: ['trip_id', 'transport_id', 'position', 'label', 'max_weight_kg', 'max_length_cm', 'price', 'currency', 'source_url', 'checked_at'],
  transport_votes: ['trip_id', 'transport_id', 'participant_id', 'position', 'vote'],
  accommodation_options: ['trip_id', 'id', 'position', 'status', 'applies_to_all', 'name', 'platform', 'source_url', 'location', 'location_latitude', 'location_longitude', 'price_total', 'currency', 'check_in', 'check_out', 'walk_to_primary_site_minutes', 'fit_summary', 'fit_level', 'notes', 'booking_reference'],
  accommodation_participants: ['trip_id', 'accommodation_id', 'participant_id', 'position'],
  accommodation_site_distances: ['trip_id', 'accommodation_id', 'position', 'site', 'minutes', 'latitude', 'longitude'],
  accommodation_rooms: ['trip_id', 'accommodation_id', 'id', 'position', 'name', 'private'],
  accommodation_beds: ['trip_id', 'accommodation_id', 'room_id', 'id', 'position', 'type', 'sleeps'],
  accommodation_votes: ['trip_id', 'accommodation_id', 'participant_id', 'position', 'vote'],
  activity_options: ['trip_id', 'id', 'position', 'status', 'applies_to_all', 'name', 'category', 'location', 'location_latitude', 'location_longitude', 'date', 'time', 'source_url', 'cost_per_person', 'currency', 'notes'],
  activity_participants: ['trip_id', 'activity_id', 'participant_id', 'position'],
  activity_votes: ['trip_id', 'activity_id', 'participant_id', 'position', 'vote'],
} as const;

export type RelationalTable = keyof typeof relationalTableColumns;
export type RelationalRows = Record<RelationalTable, unknown[][]>;

const boolean = (value: unknown): boolean => Number(value) === 1;
const optionalNumber = (value: unknown): number | undefined => typeof value === 'number' ? value : undefined;
const coordinates = (latitude: unknown, longitude: unknown): GeoCoordinates | undefined =>
  typeof latitude === 'number' && typeof longitude === 'number' ? { latitude, longitude } : undefined;

function grouped<T extends DatabaseRow>(rows: T[], key: keyof T): Map<string, T[]> {
  const output = new Map<string, T[]>();
  rows.forEach(row => {
    const value = String(row[key]);
    output.set(value, [...(output.get(value) ?? []), row]);
  });
  return output;
}

function votes(rows: DatabaseRow[] | undefined): Record<string, VoteValue> {
  return Object.fromEntries((rows ?? []).map(row => [String(row.participant_id), String(row.vote) as VoteValue]));
}

export function tripRow(trip: Trip): unknown[] {
  return [
    trip.id, trip.revision, trip.title, trip.subtitle, trip.destination,
    trip.destinationCoordinates?.latitude ?? null, trip.destinationCoordinates?.longitude ?? null,
    trip.stage, trip.currency, trip.dateRange.start, trip.dateRange.end,
    trip.availabilityWindow.start, trip.availabilityWindow.end,
    trip.preferredDateRange?.start ?? null, trip.preferredDateRange?.end ?? null,
    trip.createdAt, trip.updatedAt,
  ];
}

export function tripRelationalRows(trip: Trip): RelationalRows {
  const rows = Object.fromEntries(Object.keys(relationalTableColumns).map(table => [table, []])) as unknown as RelationalRows;
  trip.participants.forEach((person, position) => {
    rows.participants.push([
      trip.id, person.id, position, person.name, person.initials, person.colour, person.origin,
      person.originCoordinates?.latitude ?? null, person.originCoordinates?.longitude ?? null,
      person.sex, Number(person.confirmed), Number(person.goWithFlow), person.sleepingPreferences.ownRoom,
      Number(person.sleepingPreferences.ownBed), person.sleepingPreferences.shareDoubleWithParticipantId ?? null,
      Number(person.sleepingPreferences.acceptsSofaBed),
    ]);
    person.sleepingPreferences.roomPreferences.forEach((preference, index) => rows.participant_room_preferences.push([trip.id, person.id, index, preference]));
    person.sleepingPreferences.bedPreferences.forEach((preference, index) => rows.participant_bed_preferences.push([trip.id, person.id, index, preference]));
    person.sleepingPreferences.shareWithParticipantIds.forEach((participantId, index) => rows.participant_shares.push([trip.id, person.id, participantId, index]));
    person.baggage.forEach((item, index) => rows.baggage_items.push([
      trip.id, person.id, item.id, index, item.label, item.weightKg, item.lengthCm ?? null,
      item.widthCm ?? null, item.heightCm ?? null, item.category,
    ]));
  });
  trip.availabilityRanges.forEach((range, position) => rows.availability_ranges.push([trip.id, range.id, position, range.start, range.end]));
  trip.availability.forEach((entry, position) => rows.availability.push([trip.id, entry.participantId, entry.date, entry.slot, position, entry.status]));
  trip.transportOptions.forEach((option, position) => {
    rows.transport_options.push([
      trip.id, option.id, position, option.mode, option.status, option.title, option.operator,
      option.serviceNumber ?? null, option.origin, option.originCoordinates?.latitude ?? null,
      option.originCoordinates?.longitude ?? null, option.destination, option.destinationCoordinates?.latitude ?? null,
      option.destinationCoordinates?.longitude ?? null, option.departureAt, option.arrivalAt, option.seats ?? null,
      option.pricePerPerson, option.currency, option.bookingUrl ?? null, option.notes ?? null, option.bookingReference ?? null,
    ]);
    option.participantIds.forEach((participantId, index) => rows.transport_participants.push([trip.id, option.id, participantId, index]));
    option.baggageRules.forEach((rule, index) => rows.transport_baggage_rules.push([
      trip.id, option.id, index, rule.label, rule.maxWeightKg ?? null, rule.maxLengthCm ?? null,
      rule.price, rule.currency, rule.sourceUrl, rule.checkedAt,
    ]));
    Object.entries(option.votes).forEach(([participantId, vote], index) => rows.transport_votes.push([trip.id, option.id, participantId, index, vote]));
  });
  trip.accommodationOptions.forEach((option, position) => {
    rows.accommodation_options.push([
      trip.id, option.id, position, option.status, Number(option.participantIds === undefined), option.name,
      option.platform, option.sourceUrl, option.location, option.locationCoordinates?.latitude ?? null,
      option.locationCoordinates?.longitude ?? null, option.priceTotal, option.currency, option.checkIn, option.checkOut,
      option.walkToPrimarySiteMinutes, option.fitSummary, option.fitLevel, option.notes ?? null, option.bookingReference ?? null,
    ]);
    option.participantIds?.forEach((participantId, index) => rows.accommodation_participants.push([trip.id, option.id, participantId, index]));
    option.siteDistances.forEach((distance, index) => rows.accommodation_site_distances.push([
      trip.id, option.id, index, distance.site, distance.minutes,
      distance.coordinates?.latitude ?? null, distance.coordinates?.longitude ?? null,
    ]));
    option.rooms.forEach((room, roomPosition) => {
      rows.accommodation_rooms.push([trip.id, option.id, room.id, roomPosition, room.name, Number(room.private)]);
      room.beds.forEach((bed, bedPosition) => rows.accommodation_beds.push([trip.id, option.id, room.id, bed.id, bedPosition, bed.type, bed.sleeps]));
    });
    Object.entries(option.votes).forEach(([participantId, vote], index) => rows.accommodation_votes.push([trip.id, option.id, participantId, index, vote]));
  });
  trip.activities.forEach((option, position) => {
    rows.activity_options.push([
      trip.id, option.id, position, option.status, Number(option.participantIds === undefined), option.name,
      option.category ?? null, option.location ?? null, option.locationCoordinates?.latitude ?? null,
      option.locationCoordinates?.longitude ?? null, option.date ?? null, option.time ?? null, option.sourceUrl ?? null,
      option.costPerPerson ?? null, option.currency, option.notes ?? null,
    ]);
    option.participantIds?.forEach((participantId, index) => rows.activity_participants.push([trip.id, option.id, participantId, index]));
    Object.entries(option.votes).forEach(([participantId, vote], index) => rows.activity_votes.push([trip.id, option.id, participantId, index, vote]));
  });
  return rows;
}

export async function loadTrip(database: D1Database, tripId: string): Promise<Trip | undefined> {
  const row = await database.prepare(`SELECT ${tripColumns.join(', ')} FROM trips WHERE id = ?`).bind(tripId).first<TripRow>();
  if (!row) return undefined;
  const tableNames = Object.keys(relationalTableColumns) as RelationalTable[];
  const results = await database.batch(tableNames.map(table => database.prepare(`SELECT * FROM ${table} WHERE trip_id = ? ORDER BY position`).bind(tripId)));
  const tableRows = Object.fromEntries(tableNames.map((table, index) => [table, results[index].results as unknown as DatabaseRow[]])) as Record<RelationalTable, DatabaseRow[]>;

  const roomPreferences = grouped(tableRows.participant_room_preferences, 'participant_id');
  const bedPreferences = grouped(tableRows.participant_bed_preferences, 'participant_id');
  const shares = grouped(tableRows.participant_shares, 'participant_id');
  const baggage = grouped(tableRows.baggage_items, 'participant_id');
  const participants: Participant[] = tableRows.participants.map(person => ({
    id: String(person.id), name: String(person.name), initials: String(person.initials), colour: String(person.colour),
    origin: String(person.origin), originCoordinates: coordinates(person.origin_latitude, person.origin_longitude),
    sex: String(person.sex) as Participant['sex'], confirmed: boolean(person.confirmed), goWithFlow: boolean(person.go_with_flow),
    sleepingPreferences: {
      ownRoom: String(person.own_room) as Participant['sleepingPreferences']['ownRoom'], ownBed: boolean(person.own_bed),
      shareDoubleWithParticipantId: person.share_double_with_participant_id ? String(person.share_double_with_participant_id) : undefined,
      acceptsSofaBed: boolean(person.accepts_sofa_bed),
      roomPreferences: (roomPreferences.get(String(person.id)) ?? []).map(item => String(item.preference) as Participant['sleepingPreferences']['roomPreferences'][number]),
      bedPreferences: (bedPreferences.get(String(person.id)) ?? []).map(item => String(item.preference) as Participant['sleepingPreferences']['bedPreferences'][number]),
      shareWithParticipantIds: (shares.get(String(person.id)) ?? []).map(item => String(item.shared_participant_id)),
    },
    baggage: (baggage.get(String(person.id)) ?? []).map(item => ({
      id: String(item.id), label: String(item.label), weightKg: Number(item.weight_kg),
      lengthCm: optionalNumber(item.length_cm), widthCm: optionalNumber(item.width_cm), heightCm: optionalNumber(item.height_cm),
      category: String(item.category) as BaggageItem['category'],
    })),
  }));

  const transportParticipants = grouped(tableRows.transport_participants, 'transport_id');
  const transportRules = grouped(tableRows.transport_baggage_rules, 'transport_id');
  const transportVotes = grouped(tableRows.transport_votes, 'transport_id');
  const transportOptions = tableRows.transport_options.map(option => ({
    id: String(option.id), mode: String(option.mode) as Trip['transportOptions'][number]['mode'], status: String(option.status) as Trip['transportOptions'][number]['status'],
    title: String(option.title), operator: String(option.operator), serviceNumber: option.service_number ? String(option.service_number) : undefined,
    origin: String(option.origin), originCoordinates: coordinates(option.origin_latitude, option.origin_longitude),
    destination: String(option.destination), destinationCoordinates: coordinates(option.destination_latitude, option.destination_longitude),
    departureAt: String(option.departure_at), arrivalAt: String(option.arrival_at),
    participantIds: (transportParticipants.get(String(option.id)) ?? []).map(item => String(item.participant_id)),
    seats: optionalNumber(option.seats), pricePerPerson: Number(option.price_per_person), currency: String(option.currency) as BaggageRule['currency'],
    bookingUrl: option.booking_url ? String(option.booking_url) : undefined,
    baggageRules: (transportRules.get(String(option.id)) ?? []).map(rule => ({
      label: String(rule.label), maxWeightKg: optionalNumber(rule.max_weight_kg), maxLengthCm: optionalNumber(rule.max_length_cm),
      price: Number(rule.price), currency: String(rule.currency) as BaggageRule['currency'], sourceUrl: String(rule.source_url), checkedAt: String(rule.checked_at),
    })),
    notes: option.notes ? String(option.notes) : undefined, votes: votes(transportVotes.get(String(option.id))),
    bookingReference: option.booking_reference ? String(option.booking_reference) : undefined,
  }));

  const accommodationParticipants = grouped(tableRows.accommodation_participants, 'accommodation_id');
  const distances = grouped(tableRows.accommodation_site_distances, 'accommodation_id');
  const accommodationRooms = grouped(tableRows.accommodation_rooms, 'accommodation_id');
  const roomBeds = grouped(tableRows.accommodation_beds, 'room_id');
  const accommodationVotes = grouped(tableRows.accommodation_votes, 'accommodation_id');
  const accommodationOptions: AccommodationOption[] = tableRows.accommodation_options.map(option => ({
    id: String(option.id), status: String(option.status) as AccommodationOption['status'],
    participantIds: boolean(option.applies_to_all) ? undefined : (accommodationParticipants.get(String(option.id)) ?? []).map(item => String(item.participant_id)),
    name: String(option.name), platform: String(option.platform), sourceUrl: String(option.source_url), location: String(option.location),
    locationCoordinates: coordinates(option.location_latitude, option.location_longitude), priceTotal: Number(option.price_total),
    currency: String(option.currency) as AccommodationOption['currency'], checkIn: String(option.check_in), checkOut: String(option.check_out),
    walkToPrimarySiteMinutes: Number(option.walk_to_primary_site_minutes),
    siteDistances: (distances.get(String(option.id)) ?? []).map(distance => ({
      site: String(distance.site), minutes: Number(distance.minutes), coordinates: coordinates(distance.latitude, distance.longitude),
    })),
    rooms: (accommodationRooms.get(String(option.id)) ?? []).map(room => ({
      id: String(room.id), name: String(room.name), private: boolean(room.private),
      beds: (roomBeds.get(String(room.id)) ?? []).filter(bed => String(bed.accommodation_id) === String(option.id)).map(bed => ({
        id: String(bed.id), type: String(bed.type) as Bed['type'], sleeps: Number(bed.sleeps),
      })),
    })),
    votes: votes(accommodationVotes.get(String(option.id))), fitSummary: String(option.fit_summary),
    fitLevel: String(option.fit_level) as AccommodationOption['fitLevel'], notes: option.notes ? String(option.notes) : undefined,
    bookingReference: option.booking_reference ? String(option.booking_reference) : undefined,
  }));

  const activityParticipants = grouped(tableRows.activity_participants, 'activity_id');
  const activityVotes = grouped(tableRows.activity_votes, 'activity_id');
  const activities: ActivityOption[] = tableRows.activity_options.map(option => ({
    id: String(option.id), status: String(option.status) as ActivityOption['status'],
    participantIds: boolean(option.applies_to_all) ? undefined : (activityParticipants.get(String(option.id)) ?? []).map(item => String(item.participant_id)),
    name: String(option.name), category: option.category ? String(option.category) : undefined,
    location: option.location ? String(option.location) : undefined,
    locationCoordinates: coordinates(option.location_latitude, option.location_longitude), date: option.date ? String(option.date) : undefined,
    time: option.time ? String(option.time) : undefined, sourceUrl: option.source_url ? String(option.source_url) : undefined,
    costPerPerson: optionalNumber(option.cost_per_person), currency: String(option.currency) as ActivityOption['currency'],
    notes: option.notes ? String(option.notes) : undefined, votes: votes(activityVotes.get(String(option.id))),
  }));

  return normalizeTrip({
    id: row.id, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
    title: row.title, subtitle: row.subtitle, destination: row.destination,
    destinationCoordinates: coordinates(row.destination_latitude, row.destination_longitude), stage: row.stage, currency: row.currency,
    dateRange: { start: row.date_start, end: row.date_end }, availabilityWindow: { start: row.availability_start, end: row.availability_end },
    preferredDateRange: row.preferred_start && row.preferred_end ? { start: row.preferred_start, end: row.preferred_end } : undefined,
    availabilityRanges: tableRows.availability_ranges.map(range => ({ id: String(range.id), start: String(range.start_date), end: String(range.end_date) })),
    participants,
    availability: tableRows.availability.map(entry => ({
      participantId: String(entry.participant_id), date: String(entry.date),
      slot: String(entry.slot) as Trip['availability'][number]['slot'], status: String(entry.status) as Trip['availability'][number]['status'],
    })),
    transportOptions, accommodationOptions, activities,
  });
}

export async function loadTripByPublicId(database: D1Database, tripId: string): Promise<Trip | undefined> {
  return loadTrip(database, tripId);
}

function appendInsertStatements(
  database: D1Database, statements: D1PreparedStatement[], table: RelationalTable, rows: unknown[][],
  guard?: { tripId: string; revision: number },
): void {
  if (!rows.length) return;
  const columns = relationalTableColumns[table];
  const valuesPerRow = columns.length + (guard ? 2 : 0);
  const chunkSize = Math.max(1, Math.floor(90 / valuesPerRow));
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    if (guard) {
      const select = chunk.map(() => `SELECT ${columns.map(() => '?').join(', ')} WHERE EXISTS (SELECT 1 FROM trips WHERE id = ? AND revision = ?)`).join(' UNION ALL ');
      statements.push(database.prepare(`INSERT INTO ${table} (${columns.join(', ')}) ${select}`).bind(...chunk.flatMap(row => [...row, guard.tripId, guard.revision])));
    } else {
      const placeholders = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
      statements.push(database.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`).bind(...chunk.flat()));
    }
  }
}

function appendTripRows(database: D1Database, statements: D1PreparedStatement[], trip: Trip, guard?: { tripId: string; revision: number }): void {
  const rows = tripRelationalRows(trip);
  (Object.keys(relationalTableColumns) as RelationalTable[]).forEach(table => appendInsertStatements(database, statements, table, rows[table], guard));
}

export async function insertTrip(database: D1Database, trip: Trip): Promise<Trip> {
  const now = new Date().toISOString();
  const saved = { ...trip, revision: 1, createdAt: now, updatedAt: now };
  const statements: D1PreparedStatement[] = [database.prepare(
    `INSERT INTO trips (${tripColumns.join(', ')}) VALUES (${tripColumns.map(() => '?').join(', ')})`,
  ).bind(...tripRow(saved))];
  appendTripRows(database, statements, saved);
  await database.batch(statements);
  return saved;
}

export async function updateTrip(database: D1Database, trip: Trip, expectedRevision: number): Promise<Trip | undefined> {
  const saved = { ...trip, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
  const coreValues = tripRow(saved).slice(2, -2);
  const coreColumns = tripColumns.slice(2, -2);
  const statements: D1PreparedStatement[] = [database.prepare(
    `UPDATE trips SET ${coreColumns.map(column => `${column} = ?`).join(', ')}, revision = ?, updated_at = ? WHERE id = ? AND revision = ?`,
  ).bind(...coreValues, saved.revision, saved.updatedAt, saved.id, expectedRevision)];
  const guard = { tripId: saved.id, revision: saved.revision };
  ['transport_options', 'accommodation_options', 'activity_options', 'availability', 'availability_ranges', 'participants'].forEach(table => {
    statements.push(database.prepare(`DELETE FROM ${table} WHERE trip_id = ? AND EXISTS (SELECT 1 FROM trips WHERE id = ? AND revision = ?)`).bind(saved.id, saved.id, saved.revision));
  });
  appendTripRows(database, statements, saved, guard);
  const results = await database.batch(statements);
  return results[0].meta.changes === 1 ? saved : undefined;
}

export async function getTripSession(database: D1Database, sessionId: string, tripId: string): Promise<TripSession | undefined> {
  const row = await database.prepare(
    'SELECT trip_id as tripId, participant_id as participantId, display_name as displayName FROM anonymous_sessions WHERE session_id = ? AND trip_id = ?',
  ).bind(sessionId, tripId).first<TripSession>();
  return row ?? undefined;
}

export async function saveTripSession(database: D1Database, sessionId: string, session: TripSession): Promise<void> {
  const now = new Date().toISOString();
  await database.prepare(
    `INSERT INTO anonymous_sessions (session_id, trip_id, participant_id, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, trip_id) DO UPDATE SET participant_id = excluded.participant_id, display_name = excluded.display_name, updated_at = excluded.updated_at`,
  ).bind(sessionId, session.tripId, session.participantId, session.displayName, now, now).run();
}
