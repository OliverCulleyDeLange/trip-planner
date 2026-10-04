DELETE FROM availability
WHERE trip_id = 'demo'
  AND (
    (date(json_extract(payload, '$.date')) BETWEEN '2027-01-23' AND '2027-01-30' AND json_extract(payload, '$.participantId') IN ('oliver', 'conor'))
    OR
    (date(json_extract(payload, '$.date')) BETWEEN '2027-02-06' AND '2027-02-13' AND json_extract(payload, '$.participantId') IN ('alex', 'hanah', 'jacob'))
  );

UPDATE accommodation_options
SET payload = json_set(
  payload,
  '$.participantIds', json('["oliver","alex","conor","hanah","jacob"]'),
  '$.votes', json_patch(json('{"oliver":"acceptable","alex":"acceptable","conor":"acceptable","hanah":"acceptable","jacob":"acceptable"}'), json_extract(payload, '$.votes'))
)
WHERE trip_id = 'demo';

UPDATE accommodation_options
SET payload = json_set(payload, '$.fitSummary', 'Five sleeping spaces, including a double for Adam and Eve.')
WHERE trip_id = 'demo' AND id = 'cristal';

UPDATE accommodation_options
SET payload = json_set(payload, '$.fitSummary', 'Everyone has a bed, including a double for Adam and Eve.')
WHERE trip_id = 'demo' AND id = 'aigle';

UPDATE activities
SET payload = json_set(
  payload,
  '$.name', 'Après-ski at La Grotte',
  '$.category', 'Après-ski',
  '$.location', 'Villeneuve, Serre Chevalier',
  '$.locationCoordinates.latitude', 44.9419,
  '$.locationCoordinates.longitude', 6.5592,
  '$.date', '2027-01-10',
  '$.time', '16:30',
  '$.costPerPerson', 18,
  '$.participantIds', json('["oliver","alex","hanah","jacob"]'),
  '$.votes', json('{"oliver":"acceptable","alex":"first-choice","hanah":"acceptable","jacob":"first-choice"}')
)
WHERE trip_id = 'demo' AND id = 'activity-1';

UPDATE activities
SET payload = json_set(
  payload,
  '$.participantIds', json('["oliver","alex","conor","hanah","jacob"]'),
  '$.votes', json('{"oliver":"acceptable","alex":"acceptable","conor":"acceptable","hanah":"first-choice","jacob":"acceptable"}')
)
WHERE trip_id = 'demo' AND id = 'activity-2';
