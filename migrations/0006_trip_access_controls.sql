PRAGMA foreign_keys = ON;

CREATE TABLE trip_access (
  trip_id TEXT PRIMARY KEY NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'public-link' CHECK (mode IN ('public-link', 'restricted')),
  owner_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE trip_permissions (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, user_email)
);

CREATE INDEX trip_permissions_by_email ON trip_permissions(user_email, updated_at DESC);

CREATE TABLE account_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  user_email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO trip_access (trip_id, mode, owner_email, created_at, updated_at)
SELECT id, 'public-link', CASE WHEN id = 'demo' THEN 'olly@oliverdelange.co.uk' ELSE NULL END, created_at, updated_at
FROM trips;
