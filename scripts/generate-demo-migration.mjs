import { writeFileSync } from 'node:fs';
import { buildDemoTrip } from '../src/lib/trip-planner/demo.ts';
import { relationalTableColumns, tripColumns, tripRelationalRows, tripRow } from '../src/lib/server/database.ts';

const schema = `PRAGMA foreign_keys = ON;

CREATE TABLE trips (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  destination TEXT NOT NULL,
  destination_latitude REAL,
  destination_longitude REAL,
  stage TEXT NOT NULL CHECK (stage IN ('planning', 'voting', 'booked', 'travelling')),
  currency TEXT NOT NULL CHECK (currency IN ('GBP', 'EUR')),
  date_start TEXT NOT NULL,
  date_end TEXT NOT NULL,
  availability_start TEXT NOT NULL,
  availability_end TEXT NOT NULL,
  preferred_start TEXT,
  preferred_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE participants (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  colour TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT '',
  origin_latitude REAL,
  origin_longitude REAL,
  sex TEXT NOT NULL CHECK (sex IN ('female', 'male', 'other', 'prefer-not-to-say')),
  confirmed INTEGER NOT NULL CHECK (confirmed IN (0, 1)),
  go_with_flow INTEGER NOT NULL CHECK (go_with_flow IN (0, 1)),
  own_room TEXT NOT NULL CHECK (own_room IN ('required', 'preferred', 'not-needed')),
  own_bed INTEGER NOT NULL CHECK (own_bed IN (0, 1)),
  share_double_with_participant_id TEXT,
  accepts_sofa_bed INTEGER NOT NULL CHECK (accepts_sofa_bed IN (0, 1)),
  PRIMARY KEY (trip_id, id),
  UNIQUE (trip_id, position)
);

CREATE TABLE participant_room_preferences (
  trip_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  preference TEXT NOT NULL CHECK (preference IN ('happy-to-share', 'prefer-own', 'require-own')),
  PRIMARY KEY (trip_id, participant_id, preference),
  FOREIGN KEY (trip_id, participant_id) REFERENCES participants(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE participant_bed_preferences (
  trip_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  preference TEXT NOT NULL CHECK (preference IN ('own-bed', 'share-anyone', 'share-women', 'share-men')),
  PRIMARY KEY (trip_id, participant_id, preference),
  FOREIGN KEY (trip_id, participant_id) REFERENCES participants(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE participant_shares (
  trip_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  shared_participant_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (trip_id, participant_id, shared_participant_id),
  FOREIGN KEY (trip_id, participant_id) REFERENCES participants(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE baggage_items (
  trip_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  length_cm REAL,
  width_cm REAL,
  height_cm REAL,
  category TEXT NOT NULL CHECK (category IN ('carry-on', 'personal', 'cabin', 'checked', 'ski', 'sports', 'other')),
  PRIMARY KEY (trip_id, participant_id, id),
  FOREIGN KEY (trip_id, participant_id) REFERENCES participants(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE availability_ranges (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  PRIMARY KEY (trip_id, id),
  UNIQUE (trip_id, position)
);

CREATE TABLE availability (
  trip_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  date TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('all-day', 'morning', 'afternoon', 'evening')),
  position INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'maybe', 'unavailable')),
  PRIMARY KEY (trip_id, participant_id, date, slot),
  FOREIGN KEY (trip_id, participant_id) REFERENCES participants(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE transport_options (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('flight', 'train', 'coach', 'car', 'ferry')),
  status TEXT NOT NULL CHECK (status IN ('idea', 'shortlisted', 'selected', 'booked')),
  title TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT '',
  service_number TEXT,
  origin TEXT NOT NULL DEFAULT '',
  origin_latitude REAL,
  origin_longitude REAL,
  destination TEXT NOT NULL DEFAULT '',
  destination_latitude REAL,
  destination_longitude REAL,
  departure_at TEXT NOT NULL,
  arrival_at TEXT NOT NULL,
  seats INTEGER,
  price_per_person REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL CHECK (currency IN ('GBP', 'EUR')),
  booking_url TEXT,
  notes TEXT,
  booking_reference TEXT,
  PRIMARY KEY (trip_id, id),
  UNIQUE (trip_id, position)
);

CREATE TABLE transport_participants (
  trip_id TEXT NOT NULL,
  transport_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (trip_id, transport_id, participant_id),
  FOREIGN KEY (trip_id, transport_id) REFERENCES transport_options(trip_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, participant_id) REFERENCES participants(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE transport_baggage_rules (
  trip_id TEXT NOT NULL,
  transport_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  max_weight_kg REAL,
  max_length_cm REAL,
  price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL CHECK (currency IN ('GBP', 'EUR')),
  source_url TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (trip_id, transport_id, position),
  FOREIGN KEY (trip_id, transport_id) REFERENCES transport_options(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE transport_votes (
  trip_id TEXT NOT NULL,
  transport_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('first-choice', 'acceptable', 'unacceptable')),
  PRIMARY KEY (trip_id, transport_id, participant_id),
  FOREIGN KEY (trip_id, transport_id) REFERENCES transport_options(trip_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, participant_id) REFERENCES participants(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE accommodation_options (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('idea', 'shortlisted', 'selected', 'booked')),
  applies_to_all INTEGER NOT NULL CHECK (applies_to_all IN (0, 1)),
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  location_latitude REAL,
  location_longitude REAL,
  price_total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL CHECK (currency IN ('GBP', 'EUR')),
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  walk_to_primary_site_minutes INTEGER NOT NULL DEFAULT 0,
  fit_summary TEXT NOT NULL DEFAULT '',
  fit_level TEXT NOT NULL CHECK (fit_level IN ('good', 'compromise', 'invalid')),
  notes TEXT,
  booking_reference TEXT,
  PRIMARY KEY (trip_id, id),
  UNIQUE (trip_id, position)
);

CREATE TABLE accommodation_participants (
  trip_id TEXT NOT NULL,
  accommodation_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (trip_id, accommodation_id, participant_id),
  FOREIGN KEY (trip_id, accommodation_id) REFERENCES accommodation_options(trip_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, participant_id) REFERENCES participants(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE accommodation_site_distances (
  trip_id TEXT NOT NULL,
  accommodation_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  site TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  latitude REAL,
  longitude REAL,
  PRIMARY KEY (trip_id, accommodation_id, position),
  FOREIGN KEY (trip_id, accommodation_id) REFERENCES accommodation_options(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE accommodation_rooms (
  trip_id TEXT NOT NULL,
  accommodation_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  private INTEGER NOT NULL CHECK (private IN (0, 1)),
  PRIMARY KEY (trip_id, accommodation_id, id),
  FOREIGN KEY (trip_id, accommodation_id) REFERENCES accommodation_options(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE accommodation_beds (
  trip_id TEXT NOT NULL,
  accommodation_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('single', 'double', 'king', 'bunk', 'sofa-bed')),
  sleeps INTEGER NOT NULL,
  PRIMARY KEY (trip_id, accommodation_id, room_id, id),
  FOREIGN KEY (trip_id, accommodation_id, room_id) REFERENCES accommodation_rooms(trip_id, accommodation_id, id) ON DELETE CASCADE
);

CREATE TABLE accommodation_votes (
  trip_id TEXT NOT NULL,
  accommodation_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('first-choice', 'acceptable', 'unacceptable')),
  PRIMARY KEY (trip_id, accommodation_id, participant_id),
  FOREIGN KEY (trip_id, accommodation_id) REFERENCES accommodation_options(trip_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, participant_id) REFERENCES participants(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE activity_options (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('idea', 'shortlisted', 'selected', 'booked')),
  applies_to_all INTEGER NOT NULL CHECK (applies_to_all IN (0, 1)),
  name TEXT NOT NULL,
  category TEXT,
  location TEXT,
  location_latitude REAL,
  location_longitude REAL,
  date TEXT,
  time TEXT,
  source_url TEXT,
  cost_per_person REAL,
  currency TEXT NOT NULL CHECK (currency IN ('GBP', 'EUR')),
  notes TEXT,
  PRIMARY KEY (trip_id, id),
  UNIQUE (trip_id, position)
);

CREATE TABLE activity_participants (
  trip_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (trip_id, activity_id, participant_id),
  FOREIGN KEY (trip_id, activity_id) REFERENCES activity_options(trip_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, participant_id) REFERENCES participants(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE activity_votes (
  trip_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('first-choice', 'acceptable', 'unacceptable')),
  PRIMARY KEY (trip_id, activity_id, participant_id),
  FOREIGN KEY (trip_id, activity_id) REFERENCES activity_options(trip_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, participant_id) REFERENCES participants(trip_id, id) ON DELETE CASCADE
);

CREATE TABLE anonymous_sessions (
  session_id TEXT NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, trip_id)
);

CREATE INDEX trips_updated_at ON trips(updated_at);
CREATE INDEX participants_order ON participants(trip_id, position);
CREATE INDEX availability_by_trip_date ON availability(trip_id, date);
CREATE INDEX transport_order ON transport_options(trip_id, position);
CREATE INDEX accommodation_order ON accommodation_options(trip_id, position);
CREATE INDEX activity_order ON activity_options(trip_id, position);
CREATE INDEX sessions_by_trip ON anonymous_sessions(trip_id);
`;

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insert(table, columns, rows) {
  if (!rows.length) return '';
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${rows.map(row => `  (${row.map(sqlLiteral).join(', ')})`).join(',\n')};\n`;
}

const timestamp = '2026-10-04T00:00:00.000Z';
const trip = buildDemoTrip('demo');
trip.revision = 1;
trip.createdAt = timestamp;
trip.updatedAt = timestamp;
const rows = tripRelationalRows(trip);
const seed = [insert('trips', tripColumns, [tripRow(trip)])]
  .concat(Object.entries(relationalTableColumns).map(([table, columns]) => insert(table, columns, rows[table])))
  .filter(Boolean)
  .join('\n');

writeFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), `${schema}\n${seed}`);
