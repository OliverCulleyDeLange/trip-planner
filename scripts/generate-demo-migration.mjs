import { writeFileSync } from 'node:fs';
import { buildDemoTrip } from '../src/lib/trip-planner/demo.ts';

const tripId = 'trip_demo0000000000000000000000000000';
const timestamp = '2026-10-04T00:00:00.000Z';
const token = 'demo-seed-v1';
const trip = buildDemoTrip(tripId);
trip.createdAt = timestamp;
trip.updatedAt = timestamp;
const payload = JSON.stringify(trip).replaceAll("'", "''");

const childTables = [
  ['participants', '$.participants', "json_extract(item.value, '$.id')"],
  ['date_options', '$.availabilityRanges', "json_extract(item.value, '$.id')"],
  ['availability', '$.availability', "json_extract(item.value, '$.participantId') || ':' || json_extract(item.value, '$.date') || ':' || json_extract(item.value, '$.slot')"],
  ['transport_options', '$.transportOptions', "json_extract(item.value, '$.id')"],
  ['accommodation_options', '$.accommodationOptions', "json_extract(item.value, '$.id')"],
  ['activities', '$.activities', "json_extract(item.value, '$.id')"],
];

const children = childTables.map(([table, path, id]) => `INSERT OR IGNORE INTO ${table} (trip_id, id, payload, position, revision, write_token, created_at, updated_at)
SELECT '${tripId}', ${id}, item.value, CAST(item.key AS INTEGER), 1, '${token}', '${timestamp}', '${timestamp}'
FROM demo_seed_migration, json_each(demo_seed_migration.payload, '${path}') AS item;`).join('\n\n');

const migration = `PRAGMA foreign_keys = ON;

CREATE TABLE demo_seed_migration (payload TEXT NOT NULL);
INSERT INTO demo_seed_migration (payload) VALUES ('${payload}');

INSERT OR IGNORE INTO trips (id, core_json, revision, write_token, created_at, updated_at)
SELECT '${tripId}', json_remove(payload, '$.participants', '$.availabilityRanges', '$.availability', '$.transportOptions', '$.accommodationOptions', '$.activities'), 1, '${token}', '${timestamp}', '${timestamp}'
FROM demo_seed_migration;

${children}

INSERT OR IGNORE INTO trip_memberships (user_email, trip_id, participant_id, display_name, created_at, updated_at)
VALUES ('olly@oliverdelange.co.uk', '${tripId}', 'oliver', 'Adam', '${timestamp}', '${timestamp}');

DROP TABLE demo_seed_migration;
`;

writeFileSync(new URL('../migrations/0003_seed_demo_trip.sql', import.meta.url), migration);
