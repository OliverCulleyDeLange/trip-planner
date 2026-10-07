import type {
  AccommodationOption, ActivityOption, GeoCoordinates, Participant, Room, TransportOption,
  Trip, TripSession, VoteValue,
} from '../trip-planner/types';
import type { TripMutation } from './trips.ts';
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
  // The four legacy participant columns remain write-only until the post-release cleanup migration rebuilds this table.
  participants: ['trip_id', 'id', 'position', 'name', 'initials', 'colour', 'origin', 'origin_latitude', 'origin_longitude', 'sex', 'confirmed', 'go_with_flow', 'own_room', 'own_bed', 'share_double_with_participant_id', 'accepts_sofa_bed', 'room_happy_to_share', 'room_prefer_own', 'room_require_own', 'bed_own', 'bed_share_anyone', 'bed_share_women', 'bed_share_men', 'baggage_json'],
  participant_shares: ['trip_id', 'participant_id', 'shared_participant_id', 'position', 'is_double_partner'],
  availability_ranges: ['trip_id', 'id', 'position', 'start_date', 'end_date'],
  availability: ['trip_id', 'participant_id', 'date', 'slot', 'position', 'status'],
  transport_options: ['trip_id', 'id', 'position', 'mode', 'status', 'title', 'operator', 'origin', 'origin_latitude', 'origin_longitude', 'destination', 'destination_latitude', 'destination_longitude', 'departure_at', 'arrival_at', 'price_per_person', 'currency', 'booking_url', 'notes', 'booking_reference', 'details_json', 'baggage_rules_json'],
  transport_participants: ['trip_id', 'transport_id', 'participant_id', 'position'],
  transport_votes: ['trip_id', 'transport_id', 'participant_id', 'position', 'vote'],
  accommodation_options: ['trip_id', 'id', 'position', 'status', 'applies_to_all', 'name', 'platform', 'source_url', 'location', 'location_latitude', 'location_longitude', 'price_total', 'currency', 'check_in', 'check_out', 'walk_to_primary_site_minutes', 'fit_summary', 'fit_level', 'notes', 'booking_reference', 'site_distances_json', 'rooms_json'],
  accommodation_participants: ['trip_id', 'accommodation_id', 'participant_id', 'position'],
  accommodation_votes: ['trip_id', 'accommodation_id', 'participant_id', 'position', 'vote'],
  activity_options: ['trip_id', 'id', 'position', 'status', 'applies_to_all', 'name', 'category', 'location', 'location_latitude', 'location_longitude', 'date', 'time', 'source_url', 'cost_per_person', 'currency', 'notes'],
  activity_participants: ['trip_id', 'activity_id', 'participant_id', 'position'],
  activity_votes: ['trip_id', 'activity_id', 'participant_id', 'position', 'vote'],
} as const;

export type RelationalTable = keyof typeof relationalTableColumns;
export type RelationalRows = Record<RelationalTable, unknown[][]>;

type RelatedRows = Record<RelationalTable, string | null>;

export function relatedRowsSql(): string {
  const columns = (Object.entries(relationalTableColumns) as [RelationalTable, readonly string[]][]).map(([table, tableColumns]) => {
    const jsonArguments = tableColumns.flatMap(column => [`'${column}'`, `ordered.${column}`]).join(', ');
    return `(SELECT json_group_array(json_object(${jsonArguments})) FROM (SELECT * FROM ${table} WHERE trip_id = target.trip_id ORDER BY position) AS ordered) AS ${table}`;
  });
  return `WITH target(trip_id) AS (VALUES (?)) SELECT ${columns.join(', ')} FROM target`;
}

const boolean = (value: unknown): boolean => Number(value) === 1;
const optionalNumber = (value: unknown): number | undefined => typeof value === 'number' ? value : undefined;
const coordinates = (latitude: unknown, longitude: unknown): GeoCoordinates | undefined =>
  typeof latitude === 'number' && typeof longitude === 'number' ? { latitude, longitude } : undefined;
const withoutNulls = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null).map(([key, item]) => [key, withoutNulls(item)]),
  );
  return value;
};
const parsed = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string') return fallback;
  try { return withoutNulls(JSON.parse(value)) as T; } catch { return fallback; }
};

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
      person.sex, Number(person.confirmed), 0, person.sleepingPreferences.ownRoom,
      Number(person.sleepingPreferences.ownBed), person.sleepingPreferences.shareDoubleWithParticipantId ?? null,
      Number(person.sleepingPreferences.acceptsSofaBed),
      Number(person.sleepingPreferences.roomPreferences.includes('happy-to-share')),
      Number(person.sleepingPreferences.roomPreferences.includes('prefer-own')),
      Number(person.sleepingPreferences.roomPreferences.includes('require-own')),
      Number(person.sleepingPreferences.bedPreferences.includes('own-bed')),
      Number(person.sleepingPreferences.bedPreferences.includes('share-anyone')),
      Number(person.sleepingPreferences.bedPreferences.includes('share-women')),
      Number(person.sleepingPreferences.bedPreferences.includes('share-men')),
      JSON.stringify(person.baggage),
    ]);
    person.sleepingPreferences.shareWithParticipantIds.forEach((participantId, index) => rows.participant_shares.push([
      trip.id, person.id, participantId, index, Number(person.sleepingPreferences.shareDoubleWithParticipantId === participantId),
    ]));
  });
  trip.availabilityRanges.forEach((range, position) => rows.availability_ranges.push([trip.id, range.id, position, range.start, range.end]));
  trip.availability.forEach((entry, position) => rows.availability.push([trip.id, entry.participantId, entry.date, entry.slot, position, entry.status]));
  trip.transportOptions.forEach((option, position) => {
    rows.transport_options.push([
      trip.id, option.id, position, option.mode, option.status, option.title, option.operator,
      option.origin, option.originCoordinates?.latitude ?? null,
      option.originCoordinates?.longitude ?? null, option.destination, option.destinationCoordinates?.latitude ?? null,
      option.destinationCoordinates?.longitude ?? null, option.departureAt, option.arrivalAt,
      option.pricePerPerson, option.currency, option.bookingUrl ?? null, option.notes ?? null, option.bookingReference ?? null,
      JSON.stringify({
        ...(option.serviceNumber ? { serviceNumber: option.serviceNumber } : {}),
        ...(option.seats !== undefined ? { seats: option.seats } : {}),
      }), JSON.stringify(option.baggageRules),
    ]);
    option.participantIds.forEach((participantId, index) => rows.transport_participants.push([trip.id, option.id, participantId, index]));
    Object.entries(option.votes).forEach(([participantId, vote], index) => rows.transport_votes.push([trip.id, option.id, participantId, index, vote]));
  });
  trip.accommodationOptions.forEach((option, position) => {
    rows.accommodation_options.push([
      trip.id, option.id, position, option.status, Number(option.participantIds === undefined), option.name,
      option.platform, option.sourceUrl, option.location, option.locationCoordinates?.latitude ?? null,
      option.locationCoordinates?.longitude ?? null, option.priceTotal, option.currency, option.checkIn, option.checkOut,
      option.walkToPrimarySiteMinutes, option.fitSummary, option.fitLevel, option.notes ?? null, option.bookingReference ?? null,
      JSON.stringify(option.siteDistances), JSON.stringify(option.rooms),
    ]);
    option.participantIds?.forEach((participantId, index) => rows.accommodation_participants.push([trip.id, option.id, participantId, index]));
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
  const related = await database.prepare(relatedRowsSql()).bind(tripId).first<RelatedRows>();
  const tableRows = Object.fromEntries(tableNames.map(table => [table, JSON.parse(related?.[table] ?? '[]') as DatabaseRow[]])) as unknown as Record<RelationalTable, DatabaseRow[]>;

  const shares = grouped(tableRows.participant_shares, 'participant_id');
  const participants: Participant[] = tableRows.participants.map(person => ({
    id: String(person.id), name: String(person.name), initials: String(person.initials), colour: String(person.colour),
    origin: String(person.origin), originCoordinates: coordinates(person.origin_latitude, person.origin_longitude),
    sex: String(person.sex) as Participant['sex'], confirmed: boolean(person.confirmed),
    sleepingPreferences: {
      ownRoom: boolean(person.room_require_own) ? 'required' : boolean(person.room_prefer_own) ? 'preferred' : 'not-needed',
      ownBed: boolean(person.bed_own),
      shareDoubleWithParticipantId: (shares.get(String(person.id)) ?? []).find(item => boolean(item.is_double_partner))?.shared_participant_id as string | undefined,
      acceptsSofaBed: boolean(person.accepts_sofa_bed),
      roomPreferences: [
        boolean(person.room_happy_to_share) ? 'happy-to-share' : undefined,
        boolean(person.room_prefer_own) ? 'prefer-own' : undefined,
        boolean(person.room_require_own) ? 'require-own' : undefined,
      ].filter((value): value is Participant['sleepingPreferences']['roomPreferences'][number] => Boolean(value)),
      bedPreferences: [
        boolean(person.bed_own) ? 'own-bed' : undefined,
        boolean(person.bed_share_anyone) ? 'share-anyone' : undefined,
        boolean(person.bed_share_women) ? 'share-women' : undefined,
        boolean(person.bed_share_men) ? 'share-men' : undefined,
      ].filter((value): value is Participant['sleepingPreferences']['bedPreferences'][number] => Boolean(value)),
      shareWithParticipantIds: (shares.get(String(person.id)) ?? []).map(item => String(item.shared_participant_id)),
    },
    baggage: parsed(person.baggage_json, []),
  }));

  const transportParticipants = grouped(tableRows.transport_participants, 'transport_id');
  const transportVotes = grouped(tableRows.transport_votes, 'transport_id');
  const transportOptions = tableRows.transport_options.map(option => {
    const details = parsed<{ serviceNumber?: string | null; seats?: number | null }>(option.details_json, {});
    return {
    id: String(option.id), mode: String(option.mode) as Trip['transportOptions'][number]['mode'], status: String(option.status) as Trip['transportOptions'][number]['status'],
    title: String(option.title), operator: String(option.operator), serviceNumber: details.serviceNumber ?? undefined,
    origin: String(option.origin), originCoordinates: coordinates(option.origin_latitude, option.origin_longitude),
    destination: String(option.destination), destinationCoordinates: coordinates(option.destination_latitude, option.destination_longitude),
    departureAt: String(option.departure_at), arrivalAt: String(option.arrival_at),
    participantIds: (transportParticipants.get(String(option.id)) ?? []).map(item => String(item.participant_id)),
    seats: details.seats ?? undefined, pricePerPerson: Number(option.price_per_person), currency: String(option.currency) as TransportOption['currency'],
    bookingUrl: option.booking_url ? String(option.booking_url) : undefined,
    baggageRules: parsed(option.baggage_rules_json, []),
    notes: option.notes ? String(option.notes) : undefined, votes: votes(transportVotes.get(String(option.id))),
    bookingReference: option.booking_reference ? String(option.booking_reference) : undefined,
  }});

  const accommodationParticipants = grouped(tableRows.accommodation_participants, 'accommodation_id');
  const accommodationVotes = grouped(tableRows.accommodation_votes, 'accommodation_id');
  const accommodationOptions: AccommodationOption[] = tableRows.accommodation_options.map(option => ({
    id: String(option.id), status: String(option.status) as AccommodationOption['status'],
    participantIds: boolean(option.applies_to_all) ? undefined : (accommodationParticipants.get(String(option.id)) ?? []).map(item => String(item.participant_id)),
    name: String(option.name), platform: String(option.platform), sourceUrl: String(option.source_url), location: String(option.location),
    locationCoordinates: coordinates(option.location_latitude, option.location_longitude), priceTotal: Number(option.price_total),
    currency: String(option.currency) as AccommodationOption['currency'], checkIn: String(option.check_in), checkOut: String(option.check_out),
    walkToPrimarySiteMinutes: Number(option.walk_to_primary_site_minutes),
    siteDistances: parsed(option.site_distances_json, []),
    rooms: parsed<Room[]>(option.rooms_json, []),
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

const primaryKeys: Partial<Record<RelationalTable, readonly string[]>> = {
  participants: ['trip_id', 'id'],
  availability: ['trip_id', 'participant_id', 'date', 'slot'],
  transport_votes: ['trip_id', 'transport_id', 'participant_id'],
  accommodation_votes: ['trip_id', 'accommodation_id', 'participant_id'],
  activity_votes: ['trip_id', 'activity_id', 'participant_id'],
};

export function jsonRowsInsertSql(table: RelationalTable, upsert = false, guarded = false): string {
  const columns = relationalTableColumns[table];
  const values = columns.map((_, index) => `json_extract(value, '$[${index}]')`).join(', ');
  const guard = guarded ? ' WHERE EXISTS (SELECT 1 FROM trips WHERE id = ? AND revision = ?)' : '';
  let conflict = '';
  if (upsert) {
    const keys = primaryKeys[table];
    if (!keys) throw new Error(`No upsert key configured for ${table}.`);
    const updates = columns.filter(column => !keys.includes(column)).map(column => `${column} = excluded.${column}`).join(', ');
    conflict = ` ON CONFLICT (${keys.join(', ')}) DO UPDATE SET ${updates}`;
  }
  return `INSERT INTO ${table} (${columns.join(', ')}) SELECT ${values} FROM json_each(?)${guard}${conflict}`;
}

function appendJsonRows(
  database: D1Database, statements: D1PreparedStatement[], table: RelationalTable, rows: unknown[][],
  guard?: { tripId: string; revision: number }, upsert = false,
): void {
  if (!rows.length) return;
  const statement = database.prepare(jsonRowsInsertSql(table, upsert, Boolean(guard)));
  statements.push(guard ? statement.bind(JSON.stringify(rows), guard.tripId, guard.revision) : statement.bind(JSON.stringify(rows)));
}

function guardedDelete(database: D1Database, table: string, where: string, values: unknown[], guard: { tripId: string; revision: number }): D1PreparedStatement {
  return database.prepare(`DELETE FROM ${table} WHERE ${where} AND EXISTS (SELECT 1 FROM trips WHERE id = ? AND revision = ?)`).bind(...values, guard.tripId, guard.revision);
}

function replaceTables(
  database: D1Database, statements: D1PreparedStatement[], rows: RelationalRows, tables: RelationalTable[], guard: { tripId: string; revision: number },
): void {
  tables.forEach(table => {
    statements.push(guardedDelete(database, table, 'trip_id = ?', [guard.tripId], guard));
    appendJsonRows(database, statements, table, rows[table], guard);
  });
}

function appendEntityRows(
  database: D1Database, statements: D1PreparedStatement[], rows: RelationalRows, tables: RelationalTable[],
  idColumn: string, id: string, guard: { tripId: string; revision: number },
): void {
  tables.forEach(table => {
    const columnIndex = relationalTableColumns[table].indexOf(idColumn as never);
    appendJsonRows(database, statements, table, rows[table].filter(row => row[columnIndex] === id), guard);
  });
}

function appendTripRows(database: D1Database, statements: D1PreparedStatement[], trip: Trip, guard?: { tripId: string; revision: number }): void {
  const rows = tripRelationalRows(trip);
  (Object.keys(relationalTableColumns) as RelationalTable[]).forEach(table => appendJsonRows(database, statements, table, rows[table], guard));
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

export async function updateTrip(database: D1Database, trip: Trip, expectedRevision: number, mutation?: TripMutation): Promise<Trip | undefined> {
  const saved = { ...trip, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
  const coreValues = tripRow(saved).slice(2, -2);
  const coreColumns = tripColumns.slice(2, -2);
  const statements: D1PreparedStatement[] = [database.prepare(
    `UPDATE trips SET ${coreColumns.map(column => `${column} = ?`).join(', ')}, revision = ?, updated_at = ? WHERE id = ? AND revision = ?`,
  ).bind(...coreValues, saved.revision, saved.updatedAt, saved.id, expectedRevision)];
  const guard = { tripId: saved.id, revision: saved.revision };
  const rows = tripRelationalRows(saved);
  const payload = mutation?.payload as Record<string, unknown> | undefined;
  switch (mutation?.operation) {
    case 'updateTrip':
    case 'saveAvailabilityRange': replaceTables(database, statements, rows, ['availability_ranges'], guard); break;
    case 'removeAvailabilityRange': replaceTables(database, statements, rows, ['availability_ranges', 'availability'], guard); break;
    case 'resetAvailability': statements.push(guardedDelete(database, 'availability', 'trip_id = ?', [saved.id], guard)); break;
    case 'selectPreferredDates': break;
    case 'saveParticipant':
      appendJsonRows(database, statements, 'participants', rows.participants, guard, true);
      replaceTables(database, statements, rows, ['participant_shares'], guard);
      break;
    case 'removeParticipant': {
      const participantId = String(payload?.participantId);
      statements.push(guardedDelete(database, 'participants', 'trip_id = ? AND id = ?', [saved.id, participantId], guard));
      statements.push(guardedDelete(database, 'anonymous_sessions', 'trip_id = ? AND participant_id = ?', [saved.id, participantId], guard));
      appendJsonRows(database, statements, 'participants', rows.participants, guard, true);
      replaceTables(database, statements, rows, ['participant_shares'], guard);
      break;
    }
    case 'setAvailability': {
      const row = rows.availability.find(item => item[1] === payload?.participantId && item[2] === payload?.date && item[3] === payload?.slot);
      if (row) appendJsonRows(database, statements, 'availability', [row], guard, true);
      break;
    }
    case 'setRangeAvailability': {
      statements.push(guardedDelete(database, 'availability', 'trip_id = ? AND participant_id = ? AND date >= ? AND date <= ?', [saved.id, payload?.participantId, payload?.start, payload?.end], guard));
      const row = rows.availability.find(item => item[1] === payload?.participantId && item[2] === payload?.start && item[3] === 'all-day');
      if (row) appendJsonRows(database, statements, 'availability', [row], guard, true);
      break;
    }
    case 'saveTransportOption': {
      const id = String(payload?.id);
      statements.push(guardedDelete(database, 'transport_options', 'trip_id = ? AND id = ?', [saved.id, id], guard));
      appendJsonRows(database, statements, 'transport_options', rows.transport_options.filter(row => row[1] === id), guard);
      appendEntityRows(database, statements, rows, ['transport_participants', 'transport_votes'], 'transport_id', id, guard);
      break;
    }
    case 'removeTransportOption': statements.push(guardedDelete(database, 'transport_options', 'trip_id = ? AND id = ?', [saved.id, payload?.transportId], guard)); break;
    case 'voteForTransport': {
      const row = rows.transport_votes.find(item => item[1] === payload?.transportId && item[2] === payload?.participantId);
      if (row) appendJsonRows(database, statements, 'transport_votes', [row], guard, true);
      break;
    }
    case 'selectTransport': {
      const option = saved.transportOptions.find(item => item.id === payload?.transportId)!;
      statements.push(database.prepare('UPDATE transport_options SET status = ? WHERE trip_id = ? AND id = ? AND EXISTS (SELECT 1 FROM trips WHERE id = ? AND revision = ?)').bind(option.status, saved.id, option.id, saved.id, saved.revision));
      break;
    }
    case 'saveAccommodationOption': {
      const id = String(payload?.id);
      statements.push(guardedDelete(database, 'accommodation_options', 'trip_id = ? AND id = ?', [saved.id, id], guard));
      appendJsonRows(database, statements, 'accommodation_options', rows.accommodation_options.filter(row => row[1] === id), guard);
      appendEntityRows(database, statements, rows, ['accommodation_participants', 'accommodation_votes'], 'accommodation_id', id, guard);
      break;
    }
    case 'removeAccommodationOption': statements.push(guardedDelete(database, 'accommodation_options', 'trip_id = ? AND id = ?', [saved.id, payload?.accommodationId], guard)); break;
    case 'voteForAccommodation': {
      const row = rows.accommodation_votes.find(item => item[1] === payload?.accommodationId && item[2] === payload?.participantId);
      if (row) appendJsonRows(database, statements, 'accommodation_votes', [row], guard, true);
      break;
    }
    case 'selectAccommodation': statements.push(database.prepare("UPDATE accommodation_options SET status = CASE WHEN id = ? THEN 'selected' ELSE 'shortlisted' END WHERE trip_id = ? AND EXISTS (SELECT 1 FROM trips WHERE id = ? AND revision = ?)").bind(payload?.accommodationId, saved.id, saved.id, saved.revision)); break;
    case 'saveActivityOption': {
      const id = String(payload?.id);
      statements.push(guardedDelete(database, 'activity_options', 'trip_id = ? AND id = ?', [saved.id, id], guard));
      appendJsonRows(database, statements, 'activity_options', rows.activity_options.filter(row => row[1] === id), guard);
      appendEntityRows(database, statements, rows, ['activity_participants', 'activity_votes'], 'activity_id', id, guard);
      break;
    }
    case 'removeActivityOption': statements.push(guardedDelete(database, 'activity_options', 'trip_id = ? AND id = ?', [saved.id, payload?.activityId], guard)); break;
    case 'voteForActivity': {
      const row = rows.activity_votes.find(item => item[1] === payload?.activityId && item[2] === payload?.participantId);
      if (row) appendJsonRows(database, statements, 'activity_votes', [row], guard, true);
      break;
    }
    case 'selectActivity': {
      const activity = saved.activities.find(item => item.id === payload?.activityId)!;
      statements.push(database.prepare('UPDATE activity_options SET status = ? WHERE trip_id = ? AND id = ? AND EXISTS (SELECT 1 FROM trips WHERE id = ? AND revision = ?)').bind(activity.status, saved.id, activity.id, saved.id, saved.revision));
      break;
    }
    default:
      ['transport_options', 'accommodation_options', 'activity_options', 'availability', 'availability_ranges', 'participants'].forEach(table => {
        statements.push(guardedDelete(database, table, 'trip_id = ?', [saved.id], guard));
      });
      appendTripRows(database, statements, saved, guard);
  }
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
