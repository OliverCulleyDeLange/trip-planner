UPDATE participants SET payload = json_set(payload, '$.name', 'Adam', '$.initials', 'A') WHERE trip_id = 'demo' AND id = 'oliver';
UPDATE participants SET payload = json_set(payload, '$.name', 'Bob', '$.initials', 'B') WHERE trip_id = 'demo' AND id = 'alex';
UPDATE participants SET payload = json_set(payload, '$.name', 'Charlie', '$.initials', 'C') WHERE trip_id = 'demo' AND id = 'conor';
UPDATE participants SET payload = json_set(payload, '$.name', 'Dave', '$.initials', 'D') WHERE trip_id = 'demo' AND id = 'hanah';
UPDATE participants SET payload = json_set(payload, '$.name', 'Eve', '$.initials', 'E') WHERE trip_id = 'demo' AND id = 'jacob';
UPDATE trip_memberships SET display_name = 'Adam' WHERE trip_id = 'demo' AND participant_id = 'oliver';
