PRAGMA foreign_keys = ON;

CREATE TABLE trips (
  id TEXT PRIMARY KEY NOT NULL,
  core_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  write_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX trips_updated_at ON trips(updated_at);

CREATE TABLE participants (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  position INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  write_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, id, write_token)
);

CREATE TABLE date_options (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  position INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  write_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, id, write_token)
);

CREATE TABLE availability (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  position INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  write_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, id, write_token)
);

CREATE TABLE transport_options (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  position INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  write_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, id, write_token)
);

CREATE TABLE accommodation_options (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  position INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  write_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, id, write_token)
);

CREATE TABLE activities (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  position INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  write_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, id, write_token)
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

CREATE TABLE rate_limits (
  session_id TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, bucket)
);

CREATE INDEX participants_current ON participants(trip_id, write_token, position);
CREATE INDEX date_options_current ON date_options(trip_id, write_token, position);
CREATE INDEX availability_current ON availability(trip_id, write_token, position);
CREATE INDEX transport_options_current ON transport_options(trip_id, write_token, position);
CREATE INDEX accommodation_options_current ON accommodation_options(trip_id, write_token, position);
CREATE INDEX activities_current ON activities(trip_id, write_token, position);
