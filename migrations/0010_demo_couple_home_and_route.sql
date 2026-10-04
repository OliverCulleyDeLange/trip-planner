UPDATE participants
SET payload = json_set(
  payload,
  '$.origin', 'Cambridge',
  '$.originCoordinates.latitude', 52.2053,
  '$.originCoordinates.longitude', 0.1218
)
WHERE trip_id = 'demo' AND id IN ('oliver', 'jacob');

UPDATE transport_options
SET payload = json_set(
  payload,
  '$.participantIds', json('["oliver","jacob","alex"]'),
  '$.votes', json('{"oliver":"first-choice","jacob":"first-choice","alex":"acceptable"}')
)
WHERE trip_id = 'demo' AND id IN ('ryanair-stn', 'ryanair-stn-return');

DELETE FROM transport_options
WHERE trip_id = 'demo'
  AND id IN ('man-train', 'ba-lhr', 'ba-lhr-return', 'man-train-return');
