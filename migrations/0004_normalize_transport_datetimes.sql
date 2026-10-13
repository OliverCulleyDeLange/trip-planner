-- Older imports could contain local datetimes such as 2026-11-05T9:50.
-- Pad the hour so every persisted transport datetime uses YYYY-MM-DDTHH:mm.
UPDATE transport_options
SET departure_at = substr(departure_at, 1, 11) || '0' || substr(departure_at, 12)
WHERE length(departure_at) = 15
  AND departure_at GLOB '????-??-??T?:??';

UPDATE transport_options
SET arrival_at = substr(arrival_at, 1, 11) || '0' || substr(arrival_at, 12)
WHERE length(arrival_at) = 15
  AND arrival_at GLOB '????-??-??T?:??';
