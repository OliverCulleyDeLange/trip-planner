PRAGMA foreign_keys = ON;

CREATE TABLE trip_memberships (
  user_email TEXT NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_email, trip_id)
);

CREATE INDEX trip_memberships_by_user ON trip_memberships(user_email, updated_at DESC);
