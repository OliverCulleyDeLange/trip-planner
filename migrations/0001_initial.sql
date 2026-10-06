PRAGMA foreign_keys = ON;

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

INSERT INTO trips (id, revision, title, subtitle, destination, destination_latitude, destination_longitude, stage, currency, date_start, date_end, availability_start, availability_end, preferred_start, preferred_end, created_at, updated_at) VALUES
  ('demo', 1, 'Ski trip 2027', '', 'Serre Chevalier, France', 44.9447, 6.5717, 'booked', 'GBP', '2027-01-09', '2027-01-16', '2027-01-09', '2027-02-13', '2027-01-09', '2027-01-16', '2026-10-04T00:00:00.000Z', '2026-10-04T00:00:00.000Z');

INSERT INTO participants (trip_id, id, position, name, initials, colour, origin, origin_latitude, origin_longitude, sex, confirmed, go_with_flow, own_room, own_bed, share_double_with_participant_id, accepts_sofa_bed) VALUES
  ('demo', 'adam', 0, 'Adam', 'A', '#8cc5a0', 'Cambridge', 52.2053, 0.1218, 'male', 1, 0, 'not-needed', 0, 'eve', 0),
  ('demo', 'bob', 1, 'Bob', 'B', '#e4bd88', 'London Stansted', 51.886, 0.2389, 'male', 1, 0, 'not-needed', 1, NULL, 0),
  ('demo', 'charlie', 2, 'Charlie', 'C', '#8fb2dc', 'London Gatwick', 51.1537, -0.1821, 'male', 1, 0, 'preferred', 1, NULL, 0),
  ('demo', 'dave', 3, 'Dave', 'D', '#d99da2', 'Bristol Airport', 51.3827, -2.7191, 'male', 1, 0, 'not-needed', 1, NULL, 0),
  ('demo', 'eve', 4, 'Eve', 'E', '#83c6bf', 'Cambridge', 52.2053, 0.1218, 'female', 1, 0, 'not-needed', 0, 'adam', 0);

INSERT INTO participant_room_preferences (trip_id, participant_id, position, preference) VALUES
  ('demo', 'adam', 0, 'happy-to-share'),
  ('demo', 'bob', 0, 'happy-to-share'),
  ('demo', 'charlie', 0, 'happy-to-share'),
  ('demo', 'charlie', 1, 'prefer-own'),
  ('demo', 'dave', 0, 'happy-to-share'),
  ('demo', 'eve', 0, 'happy-to-share');

INSERT INTO participant_bed_preferences (trip_id, participant_id, position, preference) VALUES
  ('demo', 'bob', 0, 'own-bed'),
  ('demo', 'charlie', 0, 'own-bed'),
  ('demo', 'dave', 0, 'own-bed');

INSERT INTO participant_shares (trip_id, participant_id, shared_participant_id, position) VALUES
  ('demo', 'adam', 'eve', 0),
  ('demo', 'eve', 'adam', 0);

INSERT INTO baggage_items (trip_id, participant_id, id, position, label, weight_kg, length_cm, width_cm, height_cm, category) VALUES
  ('demo', 'adam', 'adam-cabin', 0, 'Cabin bag', 8, 55, 40, 20, 'cabin'),
  ('demo', 'adam', 'adam-skis', 1, 'Ski bag', 19, 185, 30, 20, 'sports'),
  ('demo', 'bob', 'bob-cabin', 0, 'Cabin bag', 7, 55, 40, 20, 'cabin'),
  ('demo', 'charlie', 'charlie-checked', 0, 'Checked bag', 20, NULL, NULL, NULL, 'checked'),
  ('demo', 'charlie', 'charlie-skis', 1, 'Snowboard bag', 18, 170, 35, 20, 'sports'),
  ('demo', 'dave', 'dave-cabin', 0, 'Cabin bag', 10, NULL, NULL, NULL, 'cabin'),
  ('demo', 'dave', 'dave-skis', 1, 'Ski bag', 20, 180, 30, 20, 'sports'),
  ('demo', 'eve', 'eve-checked', 0, 'Checked bag', 23, NULL, NULL, NULL, 'checked'),
  ('demo', 'eve', 'eve-skis', 1, 'Ski bag', 21, 190, 32, 22, 'sports');

INSERT INTO availability_ranges (trip_id, id, position, start_date, end_date) VALUES
  ('demo', 'range-a', 0, '2027-01-09', '2027-01-16'),
  ('demo', 'range-b', 1, '2027-01-23', '2027-01-30'),
  ('demo', 'range-c', 2, '2027-02-06', '2027-02-13');

INSERT INTO availability (trip_id, participant_id, date, slot, position, status) VALUES
  ('demo', 'adam', '2027-01-09', 'all-day', 0, 'available'),
  ('demo', 'bob', '2027-01-09', 'all-day', 1, 'available'),
  ('demo', 'charlie', '2027-01-09', 'all-day', 2, 'available'),
  ('demo', 'dave', '2027-01-09', 'all-day', 3, 'available'),
  ('demo', 'eve', '2027-01-09', 'all-day', 4, 'available'),
  ('demo', 'adam', '2027-01-10', 'all-day', 5, 'available'),
  ('demo', 'bob', '2027-01-10', 'all-day', 6, 'available'),
  ('demo', 'charlie', '2027-01-10', 'all-day', 7, 'available'),
  ('demo', 'dave', '2027-01-10', 'all-day', 8, 'available'),
  ('demo', 'eve', '2027-01-10', 'all-day', 9, 'available'),
  ('demo', 'adam', '2027-01-11', 'all-day', 10, 'available'),
  ('demo', 'bob', '2027-01-11', 'all-day', 11, 'available'),
  ('demo', 'charlie', '2027-01-11', 'all-day', 12, 'available'),
  ('demo', 'dave', '2027-01-11', 'all-day', 13, 'available'),
  ('demo', 'eve', '2027-01-11', 'all-day', 14, 'available'),
  ('demo', 'adam', '2027-01-12', 'all-day', 15, 'available'),
  ('demo', 'bob', '2027-01-12', 'all-day', 16, 'available'),
  ('demo', 'charlie', '2027-01-12', 'all-day', 17, 'available'),
  ('demo', 'dave', '2027-01-12', 'all-day', 18, 'available'),
  ('demo', 'eve', '2027-01-12', 'all-day', 19, 'available'),
  ('demo', 'adam', '2027-01-13', 'all-day', 20, 'available'),
  ('demo', 'bob', '2027-01-13', 'all-day', 21, 'available'),
  ('demo', 'charlie', '2027-01-13', 'all-day', 22, 'available'),
  ('demo', 'dave', '2027-01-13', 'all-day', 23, 'available'),
  ('demo', 'eve', '2027-01-13', 'all-day', 24, 'available'),
  ('demo', 'adam', '2027-01-14', 'all-day', 25, 'available'),
  ('demo', 'bob', '2027-01-14', 'all-day', 26, 'available'),
  ('demo', 'charlie', '2027-01-14', 'all-day', 27, 'available'),
  ('demo', 'dave', '2027-01-14', 'all-day', 28, 'available'),
  ('demo', 'eve', '2027-01-14', 'all-day', 29, 'available'),
  ('demo', 'adam', '2027-01-15', 'all-day', 30, 'available'),
  ('demo', 'bob', '2027-01-15', 'all-day', 31, 'available'),
  ('demo', 'charlie', '2027-01-15', 'all-day', 32, 'available'),
  ('demo', 'dave', '2027-01-15', 'all-day', 33, 'available'),
  ('demo', 'eve', '2027-01-15', 'all-day', 34, 'available'),
  ('demo', 'adam', '2027-01-16', 'all-day', 35, 'available'),
  ('demo', 'bob', '2027-01-16', 'all-day', 36, 'available'),
  ('demo', 'charlie', '2027-01-16', 'all-day', 37, 'available'),
  ('demo', 'dave', '2027-01-16', 'all-day', 38, 'available'),
  ('demo', 'eve', '2027-01-16', 'all-day', 39, 'available'),
  ('demo', 'bob', '2027-01-23', 'all-day', 40, 'available'),
  ('demo', 'dave', '2027-01-23', 'all-day', 41, 'available'),
  ('demo', 'eve', '2027-01-23', 'all-day', 42, 'available'),
  ('demo', 'bob', '2027-01-24', 'all-day', 43, 'available'),
  ('demo', 'dave', '2027-01-24', 'all-day', 44, 'available'),
  ('demo', 'eve', '2027-01-24', 'all-day', 45, 'available'),
  ('demo', 'bob', '2027-01-25', 'all-day', 46, 'available'),
  ('demo', 'dave', '2027-01-25', 'all-day', 47, 'available'),
  ('demo', 'eve', '2027-01-25', 'all-day', 48, 'available'),
  ('demo', 'bob', '2027-01-26', 'all-day', 49, 'available'),
  ('demo', 'dave', '2027-01-26', 'all-day', 50, 'available'),
  ('demo', 'eve', '2027-01-26', 'all-day', 51, 'available'),
  ('demo', 'bob', '2027-01-27', 'all-day', 52, 'available'),
  ('demo', 'dave', '2027-01-27', 'all-day', 53, 'available'),
  ('demo', 'eve', '2027-01-27', 'all-day', 54, 'available'),
  ('demo', 'bob', '2027-01-28', 'all-day', 55, 'available'),
  ('demo', 'dave', '2027-01-28', 'all-day', 56, 'available'),
  ('demo', 'eve', '2027-01-28', 'all-day', 57, 'available'),
  ('demo', 'bob', '2027-01-29', 'all-day', 58, 'available'),
  ('demo', 'dave', '2027-01-29', 'all-day', 59, 'available'),
  ('demo', 'eve', '2027-01-29', 'all-day', 60, 'available'),
  ('demo', 'bob', '2027-01-30', 'all-day', 61, 'available'),
  ('demo', 'dave', '2027-01-30', 'all-day', 62, 'available'),
  ('demo', 'eve', '2027-01-30', 'all-day', 63, 'available'),
  ('demo', 'adam', '2027-02-06', 'all-day', 64, 'available'),
  ('demo', 'charlie', '2027-02-06', 'all-day', 65, 'available'),
  ('demo', 'adam', '2027-02-07', 'all-day', 66, 'available'),
  ('demo', 'charlie', '2027-02-07', 'all-day', 67, 'available'),
  ('demo', 'adam', '2027-02-08', 'all-day', 68, 'available'),
  ('demo', 'charlie', '2027-02-08', 'all-day', 69, 'available'),
  ('demo', 'adam', '2027-02-09', 'all-day', 70, 'available'),
  ('demo', 'charlie', '2027-02-09', 'all-day', 71, 'available'),
  ('demo', 'adam', '2027-02-10', 'all-day', 72, 'available'),
  ('demo', 'charlie', '2027-02-10', 'all-day', 73, 'available'),
  ('demo', 'adam', '2027-02-11', 'all-day', 74, 'available'),
  ('demo', 'charlie', '2027-02-11', 'all-day', 75, 'available'),
  ('demo', 'adam', '2027-02-12', 'all-day', 76, 'available'),
  ('demo', 'charlie', '2027-02-12', 'all-day', 77, 'available'),
  ('demo', 'adam', '2027-02-13', 'all-day', 78, 'available'),
  ('demo', 'charlie', '2027-02-13', 'all-day', 79, 'available');

INSERT INTO transport_options (trip_id, id, position, mode, status, title, operator, service_number, origin, origin_latitude, origin_longitude, destination, destination_latitude, destination_longitude, departure_at, arrival_at, seats, price_per_person, currency, booking_url, notes, booking_reference) VALUES
  ('demo', 'ryanair-stn', 0, 'flight', 'booked', 'Stansted to Turin', 'Ryanair', 'FR 464', 'London Stansted', 51.886, 0.2389, 'Turin Airport', 45.2008, 7.6497, '2027-01-09T14:25', '2027-01-09T17:20', NULL, 135.98, 'GBP', 'https://www.ryanair.com/', NULL, 'DEMO-FR464'),
  ('demo', 'ba-lgw', 1, 'flight', 'booked', 'Gatwick to Turin', 'British Airways', 'BA 2576', 'London Gatwick', 51.1537, -0.1821, 'Turin Airport', 45.2008, 7.6497, '2027-01-09T12:10', '2027-01-09T15:05', NULL, 188.48, 'GBP', 'https://www.britishairways.com/', NULL, 'DEMO-BA2576'),
  ('demo', 'easyjet-brs', 2, 'flight', 'booked', 'Bristol to Geneva', 'easyJet', NULL, 'Bristol Airport', 51.3827, -2.7191, 'Geneva Airport', 46.2381, 6.109, '2027-01-09T07:15', '2027-01-09T10:05', NULL, 96, 'GBP', 'https://www.easyjet.com/', NULL, 'DEMO-EZY6142'),
  ('demo', 'geneva-outbound-transfer', 3, 'coach', 'booked', 'Geneva to Serre Chevalier', 'Shared mountain shuttle', NULL, 'Geneva Airport', 46.2381, 6.109, 'Serre Chevalier', 44.9447, 6.5717, '2027-01-09T11:00', '2027-01-09T14:30', NULL, 68, 'EUR', NULL, NULL, 'DEMO-GVA-OUT'),
  ('demo', 'alps-transfer', 4, 'coach', 'booked', 'Turin to Serre Chevalier', 'Private minibus', NULL, 'Turin Airport', 45.2008, 7.6497, 'Serre Chevalier', 44.9447, 6.5717, '2027-01-09T18:15', '2027-01-09T20:45', NULL, 52, 'EUR', NULL, NULL, 'DEMO-ALPS-OUT'),
  ('demo', 'turin-return-transfer', 5, 'coach', 'booked', 'Serre Chevalier to Turin', 'Private minibus', NULL, 'Serre Chevalier', 44.9447, 6.5717, 'Turin Airport', 45.2008, 7.6497, '2027-01-16T06:00', '2027-01-16T08:30', NULL, 52, 'EUR', NULL, NULL, 'DEMO-ALPS-IN'),
  ('demo', 'geneva-return-transfer', 6, 'coach', 'booked', 'Serre Chevalier to Geneva', 'Shared mountain shuttle', NULL, 'Serre Chevalier', 44.9447, 6.5717, 'Geneva Airport', 46.2381, 6.109, '2027-01-16T06:15', '2027-01-16T09:30', NULL, 68, 'EUR', NULL, NULL, 'DEMO-GVA-IN'),
  ('demo', 'ba-lgw-return', 7, 'flight', 'booked', 'Turin to Gatwick', 'British Airways', 'BA 2577', 'Turin Airport', 45.2008, 7.6497, 'London Gatwick', 51.1537, -0.1821, '2027-01-16T10:45', '2027-01-16T11:40', NULL, 176, 'GBP', 'https://www.britishairways.com/', NULL, 'DEMO-BA2577'),
  ('demo', 'easyjet-brs-return', 8, 'flight', 'booked', 'Geneva to Bristol', 'easyJet', NULL, 'Geneva Airport', 46.2381, 6.109, 'Bristol Airport', 51.3827, -2.7191, '2027-01-16T11:20', '2027-01-16T12:15', NULL, 102, 'GBP', 'https://www.easyjet.com/', NULL, 'DEMO-EZY6143'),
  ('demo', 'ryanair-stn-return', 9, 'flight', 'booked', 'Turin to Stansted', 'Ryanair', 'FR 465', 'Turin Airport', 45.2008, 7.6497, 'London Stansted', 51.886, 0.2389, '2027-01-16T11:20', '2027-01-16T12:15', NULL, 128, 'GBP', 'https://www.ryanair.com/', NULL, 'DEMO-FR465');

INSERT INTO transport_participants (trip_id, transport_id, participant_id, position) VALUES
  ('demo', 'ryanair-stn', 'adam', 0),
  ('demo', 'ryanair-stn', 'eve', 1),
  ('demo', 'ryanair-stn', 'bob', 2),
  ('demo', 'ba-lgw', 'charlie', 0),
  ('demo', 'easyjet-brs', 'dave', 0),
  ('demo', 'geneva-outbound-transfer', 'dave', 0),
  ('demo', 'alps-transfer', 'adam', 0),
  ('demo', 'alps-transfer', 'bob', 1),
  ('demo', 'alps-transfer', 'charlie', 2),
  ('demo', 'alps-transfer', 'eve', 3),
  ('demo', 'turin-return-transfer', 'adam', 0),
  ('demo', 'turin-return-transfer', 'bob', 1),
  ('demo', 'turin-return-transfer', 'charlie', 2),
  ('demo', 'turin-return-transfer', 'eve', 3),
  ('demo', 'geneva-return-transfer', 'dave', 0),
  ('demo', 'ba-lgw-return', 'charlie', 0),
  ('demo', 'easyjet-brs-return', 'dave', 0),
  ('demo', 'ryanair-stn-return', 'adam', 0),
  ('demo', 'ryanair-stn-return', 'eve', 1),
  ('demo', 'ryanair-stn-return', 'bob', 2);

INSERT INTO transport_baggage_rules (trip_id, transport_id, position, label, max_weight_kg, max_length_cm, price, currency, source_url, checked_at) VALUES
  ('demo', 'ryanair-stn', 0, '20 kg checked bag', 20, NULL, 60, 'GBP', 'https://help.ryanair.com/hc/en-gb/categories/12489112419089-Bag-Rules', '2026-09-28'),
  ('demo', 'ryanair-stn', 1, 'Sports equipment', 20, NULL, 45, 'GBP', 'https://help.ryanair.com/hc/en-gb/categories/12489112419089-Bag-Rules', '2026-09-28'),
  ('demo', 'ba-lgw', 0, 'Checked bag', 23, NULL, 40, 'GBP', 'https://www.britishairways.com/content/information/baggage-essentials', '2026-09-28'),
  ('demo', 'easyjet-brs', 0, 'Sports equipment', 20, NULL, 42, 'GBP', 'https://www.easyjet.com/en/help/baggage/sports-equipment', '2026-09-28'),
  ('demo', 'ba-lgw-return', 0, 'Checked bag', 23, NULL, 40, 'GBP', 'https://www.britishairways.com/content/information/baggage-essentials', '2026-09-28'),
  ('demo', 'easyjet-brs-return', 0, 'Sports equipment', 20, NULL, 42, 'GBP', 'https://www.easyjet.com/en/help/baggage/sports-equipment', '2026-09-28'),
  ('demo', 'ryanair-stn-return', 0, '20 kg checked bag', 20, NULL, 60, 'GBP', 'https://help.ryanair.com/hc/en-gb/categories/12489112419089-Bag-Rules', '2026-09-28'),
  ('demo', 'ryanair-stn-return', 1, 'Sports equipment', 20, NULL, 45, 'GBP', 'https://help.ryanair.com/hc/en-gb/categories/12489112419089-Bag-Rules', '2026-09-28');

INSERT INTO transport_votes (trip_id, transport_id, participant_id, position, vote) VALUES
  ('demo', 'ryanair-stn', 'adam', 0, 'first-choice'),
  ('demo', 'ryanair-stn', 'eve', 1, 'first-choice'),
  ('demo', 'ryanair-stn', 'bob', 2, 'acceptable'),
  ('demo', 'ba-lgw', 'charlie', 0, 'acceptable'),
  ('demo', 'easyjet-brs', 'dave', 0, 'first-choice'),
  ('demo', 'geneva-outbound-transfer', 'dave', 0, 'first-choice'),
  ('demo', 'alps-transfer', 'adam', 0, 'acceptable'),
  ('demo', 'alps-transfer', 'bob', 1, 'acceptable'),
  ('demo', 'alps-transfer', 'charlie', 2, 'acceptable'),
  ('demo', 'alps-transfer', 'eve', 3, 'acceptable'),
  ('demo', 'turin-return-transfer', 'adam', 0, 'acceptable'),
  ('demo', 'turin-return-transfer', 'bob', 1, 'acceptable'),
  ('demo', 'turin-return-transfer', 'charlie', 2, 'acceptable'),
  ('demo', 'turin-return-transfer', 'eve', 3, 'acceptable'),
  ('demo', 'geneva-return-transfer', 'dave', 0, 'first-choice'),
  ('demo', 'ba-lgw-return', 'charlie', 0, 'acceptable'),
  ('demo', 'easyjet-brs-return', 'dave', 0, 'first-choice'),
  ('demo', 'ryanair-stn-return', 'adam', 0, 'first-choice'),
  ('demo', 'ryanair-stn-return', 'eve', 1, 'first-choice'),
  ('demo', 'ryanair-stn-return', 'bob', 2, 'acceptable');

INSERT INTO accommodation_options (trip_id, id, position, status, applies_to_all, name, platform, source_url, location, location_latitude, location_longitude, price_total, currency, check_in, check_out, walk_to_primary_site_minutes, fit_summary, fit_level, notes, booking_reference) VALUES
  ('demo', 'cristal', 0, 'booked', 0, 'Cristal Lodge', 'Direct', 'https://www.terresens-hr.co.uk/', 'La Salle-les-Alpes', 44.9447, 6.5717, 1126.18, 'GBP', '2027-01-09', '2027-01-16', 6, 'Five sleeping spaces, including a double for Adam and Eve.', 'good', NULL, 'DEMO-CRISTAL'),
  ('demo', 'meleze', 1, 'shortlisted', 0, 'Chalet Mélèze', 'Airbnb', 'https://www.airbnb.co.uk/', 'Briançon', 44.8994, 6.6433, 920, 'GBP', '2027-01-09', '2027-01-16', 18, 'Fits five only if one person uses the living-room sofa bed.', 'compromise', NULL, NULL),
  ('demo', 'aigle', 2, 'shortlisted', 0, 'Résidence Aigle Bleu', 'Booking.com', 'https://www.booking.com/', 'Briançon', 44.8994, 6.6433, 1390, 'GBP', '2027-01-09', '2027-01-16', 11, 'Everyone has a bed, including a double for Adam and Eve.', 'good', NULL, NULL);

INSERT INTO accommodation_participants (trip_id, accommodation_id, participant_id, position) VALUES
  ('demo', 'cristal', 'adam', 0),
  ('demo', 'cristal', 'bob', 1),
  ('demo', 'cristal', 'charlie', 2),
  ('demo', 'cristal', 'dave', 3),
  ('demo', 'cristal', 'eve', 4),
  ('demo', 'meleze', 'adam', 0),
  ('demo', 'meleze', 'bob', 1),
  ('demo', 'meleze', 'charlie', 2),
  ('demo', 'meleze', 'dave', 3),
  ('demo', 'meleze', 'eve', 4),
  ('demo', 'aigle', 'adam', 0),
  ('demo', 'aigle', 'bob', 1),
  ('demo', 'aigle', 'charlie', 2),
  ('demo', 'aigle', 'dave', 3),
  ('demo', 'aigle', 'eve', 4);

INSERT INTO accommodation_site_distances (trip_id, accommodation_id, position, site, minutes, latitude, longitude) VALUES
  ('demo', 'cristal', 0, 'Aravet lift', 6, NULL, NULL),
  ('demo', 'cristal', 1, 'Supermarket', 9, NULL, NULL),
  ('demo', 'cristal', 2, 'Ski school', 7, NULL, NULL),
  ('demo', 'meleze', 0, 'Prorel lift', 18, NULL, NULL),
  ('demo', 'meleze', 1, 'Old town', 5, NULL, NULL),
  ('demo', 'aigle', 0, 'Prorel lift', 11, NULL, NULL),
  ('demo', 'aigle', 1, 'Train station', 14, NULL, NULL),
  ('demo', 'aigle', 2, 'Supermarket', 4, NULL, NULL);

INSERT INTO accommodation_rooms (trip_id, accommodation_id, id, position, name, private) VALUES
  ('demo', 'cristal', 'c1', 0, 'Bedroom 1', 1),
  ('demo', 'cristal', 'c2', 1, 'Bedroom 2', 1),
  ('demo', 'cristal', 'c3', 2, 'Bedroom 3', 1),
  ('demo', 'meleze', 'm1', 0, 'Bedroom 1', 1),
  ('demo', 'meleze', 'm2', 1, 'Bedroom 2', 1),
  ('demo', 'meleze', 'm3', 2, 'Living room', 0),
  ('demo', 'aigle', 'a1', 0, 'Bedroom 1', 1),
  ('demo', 'aigle', 'a2', 1, 'Bedroom 2', 1),
  ('demo', 'aigle', 'a3', 2, 'Bedroom 3', 1),
  ('demo', 'aigle', 'a4', 3, 'Bedroom 4', 1);

INSERT INTO accommodation_beds (trip_id, accommodation_id, room_id, id, position, type, sleeps) VALUES
  ('demo', 'cristal', 'c1', 'cb1', 0, 'double', 2),
  ('demo', 'cristal', 'c2', 'cb2', 0, 'single', 1),
  ('demo', 'cristal', 'c2', 'cb3', 1, 'single', 1),
  ('demo', 'cristal', 'c3', 'cb4', 0, 'single', 1),
  ('demo', 'meleze', 'm1', 'mb1', 0, 'double', 2),
  ('demo', 'meleze', 'm2', 'mb2', 0, 'double', 2),
  ('demo', 'meleze', 'm3', 'mb3', 0, 'sofa-bed', 1),
  ('demo', 'aigle', 'a1', 'ab1', 0, 'double', 2),
  ('demo', 'aigle', 'a2', 'ab2', 0, 'single', 1),
  ('demo', 'aigle', 'a3', 'ab3', 0, 'single', 1),
  ('demo', 'aigle', 'a4', 'ab4', 0, 'single', 1);

INSERT INTO accommodation_votes (trip_id, accommodation_id, participant_id, position, vote) VALUES
  ('demo', 'cristal', 'adam', 0, 'first-choice'),
  ('demo', 'cristal', 'bob', 1, 'first-choice'),
  ('demo', 'cristal', 'dave', 2, 'acceptable'),
  ('demo', 'cristal', 'charlie', 3, 'acceptable'),
  ('demo', 'cristal', 'eve', 4, 'acceptable'),
  ('demo', 'meleze', 'charlie', 0, 'unacceptable'),
  ('demo', 'meleze', 'dave', 1, 'acceptable'),
  ('demo', 'meleze', 'adam', 2, 'acceptable'),
  ('demo', 'meleze', 'bob', 3, 'acceptable'),
  ('demo', 'meleze', 'eve', 4, 'acceptable'),
  ('demo', 'aigle', 'charlie', 0, 'first-choice'),
  ('demo', 'aigle', 'eve', 1, 'first-choice'),
  ('demo', 'aigle', 'adam', 2, 'acceptable'),
  ('demo', 'aigle', 'bob', 3, 'acceptable'),
  ('demo', 'aigle', 'dave', 4, 'acceptable');

INSERT INTO activity_options (trip_id, id, position, status, applies_to_all, name, category, location, location_latitude, location_longitude, date, time, source_url, cost_per_person, currency, notes) VALUES
  ('demo', 'activity-1', 0, 'booked', 0, 'Après-ski at La Grotte', 'Après-ski', 'Villeneuve, Serre Chevalier', 44.9419, 6.5592, '2027-01-10', '16:30', NULL, 18, 'EUR', NULL),
  ('demo', 'activity-2', 1, 'booked', 0, 'Group dinner', 'Food', 'La Salle-les-Alpes', 44.9447, 6.5717, '2027-01-12', '20:00', NULL, 35, 'EUR', NULL);

INSERT INTO activity_participants (trip_id, activity_id, participant_id, position) VALUES
  ('demo', 'activity-1', 'adam', 0),
  ('demo', 'activity-1', 'bob', 1),
  ('demo', 'activity-1', 'dave', 2),
  ('demo', 'activity-1', 'eve', 3),
  ('demo', 'activity-2', 'adam', 0),
  ('demo', 'activity-2', 'bob', 1),
  ('demo', 'activity-2', 'charlie', 2),
  ('demo', 'activity-2', 'dave', 3),
  ('demo', 'activity-2', 'eve', 4);

INSERT INTO activity_votes (trip_id, activity_id, participant_id, position, vote) VALUES
  ('demo', 'activity-1', 'adam', 0, 'acceptable'),
  ('demo', 'activity-1', 'bob', 1, 'first-choice'),
  ('demo', 'activity-1', 'dave', 2, 'acceptable'),
  ('demo', 'activity-1', 'eve', 3, 'first-choice'),
  ('demo', 'activity-2', 'dave', 0, 'first-choice'),
  ('demo', 'activity-2', 'charlie', 1, 'acceptable'),
  ('demo', 'activity-2', 'adam', 2, 'acceptable'),
  ('demo', 'activity-2', 'bob', 3, 'acceptable'),
  ('demo', 'activity-2', 'eve', 4, 'acceptable');
