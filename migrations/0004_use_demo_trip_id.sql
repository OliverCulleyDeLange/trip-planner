PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO trips (id, core_json, revision, write_token, created_at, updated_at)
SELECT 'demo', json_set(core_json, '$.id', 'demo'), revision, write_token, created_at, updated_at
FROM trips WHERE id = 'trip_demo0000000000000000000000000000';

INSERT OR IGNORE INTO participants SELECT 'demo', id, payload, position, revision, write_token, created_at, updated_at FROM participants WHERE trip_id = 'trip_demo0000000000000000000000000000';
INSERT OR IGNORE INTO date_options SELECT 'demo', id, payload, position, revision, write_token, created_at, updated_at FROM date_options WHERE trip_id = 'trip_demo0000000000000000000000000000';
INSERT OR IGNORE INTO availability SELECT 'demo', id, payload, position, revision, write_token, created_at, updated_at FROM availability WHERE trip_id = 'trip_demo0000000000000000000000000000';
INSERT OR IGNORE INTO transport_options SELECT 'demo', id, payload, position, revision, write_token, created_at, updated_at FROM transport_options WHERE trip_id = 'trip_demo0000000000000000000000000000';
INSERT OR IGNORE INTO accommodation_options SELECT 'demo', id, payload, position, revision, write_token, created_at, updated_at FROM accommodation_options WHERE trip_id = 'trip_demo0000000000000000000000000000';
INSERT OR IGNORE INTO activities SELECT 'demo', id, payload, position, revision, write_token, created_at, updated_at FROM activities WHERE trip_id = 'trip_demo0000000000000000000000000000';
INSERT OR IGNORE INTO trip_memberships SELECT user_email, 'demo', participant_id, CASE WHEN participant_id = 'oliver' THEN 'Adam' ELSE display_name END, created_at, updated_at FROM trip_memberships WHERE trip_id = 'trip_demo0000000000000000000000000000';

DELETE FROM trips WHERE id = 'trip_demo0000000000000000000000000000';
