UPDATE trips
SET core_json = json_set(
  core_json,
  '$.destinationCoordinates.latitude', 44.9447,
  '$.destinationCoordinates.longitude', 6.5717
)
WHERE id = 'demo';

UPDATE participants
SET payload = CASE id
  WHEN 'alex' THEN json_set(payload, '$.originCoordinates.latitude', 51.886, '$.originCoordinates.longitude', 0.2389)
  WHEN 'conor' THEN json_set(payload, '$.originCoordinates.latitude', 51.1537, '$.originCoordinates.longitude', -0.1821)
  WHEN 'hanah' THEN json_set(payload, '$.origin', 'Bristol Airport', '$.originCoordinates.latitude', 51.3827, '$.originCoordinates.longitude', -2.7191)
  ELSE payload
END
WHERE trip_id = 'demo';

UPDATE transport_options
SET payload = json_set(
  payload,
  '$.origin', CASE json_extract(payload, '$.origin') WHEN 'Bristol' THEN 'Bristol Airport' ELSE json_extract(payload, '$.origin') END,
  '$.destination', CASE json_extract(payload, '$.destination') WHEN 'Bristol' THEN 'Bristol Airport' ELSE json_extract(payload, '$.destination') END,
  '$.originCoordinates', json(CASE json_extract(payload, '$.origin')
    WHEN 'Bristol' THEN '{"latitude":51.3827,"longitude":-2.7191}'
    WHEN 'Bristol Airport' THEN '{"latitude":51.3827,"longitude":-2.7191}'
    WHEN 'Geneva Airport' THEN '{"latitude":46.2381,"longitude":6.109}'
    WHEN 'Serre Chevalier' THEN '{"latitude":44.9447,"longitude":6.5717}'
    WHEN 'London Gatwick' THEN '{"latitude":51.1537,"longitude":-0.1821}'
    WHEN 'Turin Airport' THEN '{"latitude":45.2008,"longitude":7.6497}'
    WHEN 'London Stansted' THEN '{"latitude":51.886,"longitude":0.2389}'
  END),
  '$.destinationCoordinates', json(CASE json_extract(payload, '$.destination')
    WHEN 'Bristol' THEN '{"latitude":51.3827,"longitude":-2.7191}'
    WHEN 'Bristol Airport' THEN '{"latitude":51.3827,"longitude":-2.7191}'
    WHEN 'Geneva Airport' THEN '{"latitude":46.2381,"longitude":6.109}'
    WHEN 'Serre Chevalier' THEN '{"latitude":44.9447,"longitude":6.5717}'
    WHEN 'London Gatwick' THEN '{"latitude":51.1537,"longitude":-0.1821}'
    WHEN 'Turin Airport' THEN '{"latitude":45.2008,"longitude":7.6497}'
    WHEN 'London Stansted' THEN '{"latitude":51.886,"longitude":0.2389}'
  END)
)
WHERE trip_id = 'demo';

UPDATE accommodation_options
SET payload = json_set(
  payload,
  '$.locationCoordinates', json(CASE json_extract(payload, '$.location')
    WHEN 'La Salle-les-Alpes' THEN '{"latitude":44.9447,"longitude":6.5717}'
    WHEN 'Briançon' THEN '{"latitude":44.8994,"longitude":6.6433}'
  END)
)
WHERE trip_id = 'demo';
