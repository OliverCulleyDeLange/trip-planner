import type { Trip, TripSession } from '../trip-planner/types';
import { normalizeTrip } from './trips';

type TripRow = {
  id: string; core_json: string; revision: number; write_token: string; created_at: string; updated_at: string;
};
type PayloadRow = { payload: string };
type MembershipRow = { tripId: string; participantId: string; displayName: string };

export interface AccountTripSummary {
  id: string;
  title: string;
  destination: string;
  start: string;
  end: string;
  stage: Trip['stage'];
  updatedAt: string;
}

export type TripAccessMode = 'public-link' | 'restricted';
export type TripPermissionRole = 'viewer' | 'editor';
export interface TripPermission { email: string; role: TripPermissionRole }
export interface TripAccessRecord { mode: TripAccessMode; hasOwner: boolean; ownerEmail?: string; permissions: TripPermission[] }
export interface TripAccessState extends TripAccessRecord {
  role: 'owner' | TripPermissionRole | 'public';
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
}

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

export async function saveTripMembership(database: D1Database, email: string, session: TripSession): Promise<void> {
  const now = new Date().toISOString();
  await database.prepare(
    `INSERT INTO trip_memberships (user_email, trip_id, participant_id, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_email, trip_id) DO UPDATE SET participant_id = excluded.participant_id, display_name = excluded.display_name, updated_at = excluded.updated_at`,
  ).bind(email, session.tripId, session.participantId, session.displayName, now, now).run();
}

export async function getTripMembership(database: D1Database, email: string, tripId: string): Promise<TripSession | undefined> {
  const row = await database.prepare(
    'SELECT trip_id as tripId, participant_id as participantId, display_name as displayName FROM trip_memberships WHERE user_email = ? AND trip_id = ?',
  ).bind(email, tripId).first<MembershipRow>();
  return row ?? undefined;
}

export async function listAccountTrips(database: D1Database, email: string): Promise<AccountTripSummary[]> {
  const rows = await database.prepare(
    `SELECT DISTINCT trips.id, trips.core_json as coreJson, trips.updated_at as updatedAt
     FROM trips
     LEFT JOIN trip_memberships ON trip_memberships.trip_id = trips.id AND trip_memberships.user_email = ?
     LEFT JOIN trip_permissions ON trip_permissions.trip_id = trips.id AND trip_permissions.user_email = ?
     LEFT JOIN trip_access ON trip_access.trip_id = trips.id
     WHERE trip_memberships.user_email IS NOT NULL OR trip_permissions.user_email IS NOT NULL OR trip_access.owner_email = ?
     ORDER BY trips.updated_at DESC`,
  ).bind(email, email, email).all<{ id: string; coreJson: string; updatedAt: string }>();
  return rows.results.map(row => {
    const core = JSON.parse(row.coreJson) as Trip;
    const dates = core.preferredDateRange ?? core.dateRange;
    return { id: row.id, title: core.title, destination: core.destination, start: dates.start, end: dates.end, stage: core.stage, updatedAt: row.updatedAt };
  });
}

export async function saveAccountSession(database: D1Database, sessionId: string, email: string, name: string): Promise<void> {
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  await database.prepare(
    `INSERT INTO account_sessions (session_id, user_email, display_name, expires_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET user_email = excluded.user_email, display_name = excluded.display_name, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
  ).bind(sessionId, email, name, expires, now.toISOString()).run();
}

export async function getAccountSession(database: D1Database, sessionId: string): Promise<{ email: string; name: string } | undefined> {
  const row = await database.prepare(
    'SELECT user_email as email, display_name as name FROM account_sessions WHERE session_id = ? AND expires_at > ?',
  ).bind(sessionId, new Date().toISOString()).first<{ email: string; name: string }>();
  return row ?? undefined;
}

export async function deleteAccountSession(database: D1Database, sessionId: string): Promise<void> {
  await database.prepare('DELETE FROM account_sessions WHERE session_id = ?').bind(sessionId).run();
}

export async function getTripAccess(database: D1Database, tripId: string, email?: string): Promise<TripAccessState> {
  if (tripId === 'demo') {
    return { mode: 'public-link', hasOwner: false, permissions: [], role: 'public', canView: true, canEdit: false, canManage: false };
  }
  const row = await database.prepare(
    'SELECT mode, owner_email as ownerEmail FROM trip_access WHERE trip_id = ?',
  ).bind(tripId).first<{ mode: TripAccessMode; ownerEmail?: string }>();
  const mode = row?.mode ?? 'public-link';
  const ownerEmail = row?.ownerEmail?.toLowerCase();
  const permissionRows = await database.prepare(
    'SELECT user_email as email, role FROM trip_permissions WHERE trip_id = ? ORDER BY user_email',
  ).bind(tripId).all<TripPermission>();
  const permissions = permissionRows.results;
  const normalizedEmail = email?.toLowerCase();
  const permission = normalizedEmail ? permissions.find(candidate => candidate.email === normalizedEmail) : undefined;
  const role = normalizedEmail && ownerEmail === normalizedEmail ? 'owner' : permission?.role ?? 'public';
  const canView = mode === 'public-link' || role !== 'public';
  const canEdit = mode === 'public-link' || role === 'owner' || role === 'editor';
  const canManage = role === 'owner';
  return { mode, hasOwner: Boolean(ownerEmail), ownerEmail: canManage ? ownerEmail : undefined, permissions: canManage ? permissions : [], role, canView, canEdit, canManage };
}

export async function getTripOwnerEmail(database: D1Database, tripId: string): Promise<string | undefined> {
  const row = await database.prepare('SELECT owner_email as ownerEmail FROM trip_access WHERE trip_id = ?').bind(tripId).first<{ ownerEmail?: string }>();
  return row?.ownerEmail?.toLowerCase();
}

export async function createTripAccess(database: D1Database, tripId: string, ownerEmail?: string): Promise<void> {
  const now = new Date().toISOString();
  await database.prepare(
    `INSERT OR IGNORE INTO trip_access (trip_id, mode, owner_email, created_at, updated_at) VALUES (?, 'public-link', ?, ?, ?)`,
  ).bind(tripId, ownerEmail?.toLowerCase() ?? null, now, now).run();
}

export async function saveTripAccess(database: D1Database, tripId: string, ownerEmail: string, mode: TripAccessMode, permissions: TripPermission[]): Promise<void> {
  const now = new Date().toISOString();
  const normalizedOwner = ownerEmail.toLowerCase();
  const statements: D1PreparedStatement[] = [
    database.prepare(
      `INSERT INTO trip_access (trip_id, mode, owner_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(trip_id) DO UPDATE SET mode = excluded.mode, owner_email = excluded.owner_email, updated_at = excluded.updated_at`,
    ).bind(tripId, mode, normalizedOwner, now, now),
    database.prepare('DELETE FROM trip_permissions WHERE trip_id = ?').bind(tripId),
  ];
  for (const permission of permissions) {
    statements.push(database.prepare(
      'INSERT INTO trip_permissions (trip_id, user_email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(tripId, permission.email.toLowerCase(), permission.role, now, now));
  }
  await database.batch(statements);
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
