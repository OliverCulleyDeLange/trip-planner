import type { Trip, TripSession } from '../trip-planner/types';
import { normalizeTrip } from './trips';

type TripRow = {
  id: string; core_json: string; revision: number; write_token: string; created_at: string; updated_at: string;
};
type PayloadRow = { payload: string };

const childTables = [
  ['participants', 'participants'],
  ['date_options', 'availabilityRanges'],
  ['availability', 'availability'],
  ['transport_options', 'transportOptions'],
  ['accommodation_options', 'accommodationOptions'],
  ['activities', 'activities'],
] as const;

function itemId(key: typeof childTables[number][1], value: Record<string, unknown>, index: number): string {
  if (typeof value.id === 'string') return value.id;
  if (key === 'availability') return `${value.participantId}:${value.date}:${value.slot}`;
  return String(index);
}

function splitTrip(trip: Trip): { core: Omit<Trip, typeof childTables[number][1]>; children: Record<string, Record<string, unknown>[]> } {
  const copy = structuredClone(trip) as Trip & Record<string, unknown>;
  const children: Record<string, Record<string, unknown>[]> = {};
  for (const [table, key] of childTables) {
    children[table] = copy[key] as Record<string, unknown>[];
    delete copy[key];
  }
  return { core: copy, children } as never;
}

export async function loadTrip(database: D1Database, tripId: string): Promise<Trip | undefined> {
  const row = await database.prepare('SELECT id, core_json, revision, write_token, created_at, updated_at FROM trips WHERE id = ?').bind(tripId).first<TripRow>();
  if (!row) return undefined;
  const core = JSON.parse(row.core_json) as Trip;
  const trip = { ...core, id: row.id, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at } as Trip & Record<string, unknown>;
  const results = await database.batch(childTables.map(([table]) => database
    .prepare(`SELECT payload FROM ${table} WHERE trip_id = ? AND write_token = ? ORDER BY position`)
    .bind(tripId, row.write_token)));
  childTables.forEach(([, key], index) => {
    trip[key] = (results[index].results as PayloadRow[]).map(child => JSON.parse(child.payload));
  });
  return normalizeTrip(trip);
}

export async function insertTrip(database: D1Database, trip: Trip): Promise<Trip> {
  const now = new Date().toISOString();
  const saved = { ...trip, revision: 1, createdAt: now, updatedAt: now };
  const token = crypto.randomUUID();
  const { core, children } = splitTrip(saved);
  const statements: D1PreparedStatement[] = [database.prepare(
    'INSERT INTO trips (id, core_json, revision, write_token, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)',
  ).bind(saved.id, JSON.stringify(core), token, now, now)];
  appendChildren(database, statements, saved.id, token, saved.revision, children, false);
  await database.batch(statements);
  return saved;
}

export async function updateTrip(database: D1Database, trip: Trip, expectedRevision: number): Promise<Trip | undefined> {
  const now = new Date().toISOString();
  const saved = { ...trip, revision: expectedRevision + 1, updatedAt: now };
  const token = crypto.randomUUID();
  const { core, children } = splitTrip(saved);
  const statements: D1PreparedStatement[] = [database.prepare(
    'UPDATE trips SET core_json = ?, revision = ?, write_token = ?, updated_at = ? WHERE id = ? AND revision = ?',
  ).bind(JSON.stringify(core), saved.revision, token, now, saved.id, expectedRevision)];
  appendChildren(database, statements, saved.id, token, saved.revision, children, true);
  const results = await database.batch(statements);
  return results[0].meta.changes === 1 ? saved : undefined;
}

function appendChildren(
  database: D1Database,
  statements: D1PreparedStatement[],
  tripId: string,
  token: string,
  revision: number,
  children: Record<string, Record<string, unknown>[]>,
  guarded: boolean,
): void {
  for (const [table, key] of childTables) {
    if (guarded) {
      statements.push(database.prepare(
        `DELETE FROM ${table} WHERE trip_id = ? AND write_token != ? AND EXISTS (SELECT 1 FROM trips WHERE id = ? AND write_token = ?)`,
      ).bind(tripId, token, tripId, token));
    }
    children[table].forEach((item, position) => {
      const id = itemId(key, item, position);
      if (guarded) {
        statements.push(database.prepare(
          `INSERT INTO ${table} (trip_id, id, payload, position, revision, write_token, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM trips WHERE id = ? AND write_token = ?)`,
        ).bind(tripId, id, JSON.stringify(item), position, revision, token, new Date().toISOString(), new Date().toISOString(), tripId, token));
      } else {
        statements.push(database.prepare(
          `INSERT INTO ${table} (trip_id, id, payload, position, revision, write_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(tripId, id, JSON.stringify(item), position, revision, token, new Date().toISOString(), new Date().toISOString()));
      }
    });
  }
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

export async function enforceRateLimit(database: D1Database, sessionId: string, limit = 120): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60_000);
  await database.prepare(
    `INSERT INTO rate_limits (session_id, bucket, request_count) VALUES (?, ?, 1)
     ON CONFLICT(session_id, bucket) DO UPDATE SET request_count = request_count + 1`,
  ).bind(sessionId, bucket).run();
  const row = await database.prepare('SELECT request_count FROM rate_limits WHERE session_id = ? AND bucket = ?').bind(sessionId, bucket).first<{ request_count: number }>();
  if (Math.random() < 0.02) await database.prepare('DELETE FROM rate_limits WHERE bucket < ?').bind(bucket - 10).run();
  return (row?.request_count ?? limit + 1) <= limit;
}
