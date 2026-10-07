PRAGMA foreign_keys = ON;

ALTER TABLE participants ADD COLUMN room_happy_to_share INTEGER NOT NULL DEFAULT 0 CHECK (room_happy_to_share IN (0, 1));
ALTER TABLE participants ADD COLUMN room_prefer_own INTEGER NOT NULL DEFAULT 0 CHECK (room_prefer_own IN (0, 1));
ALTER TABLE participants ADD COLUMN room_require_own INTEGER NOT NULL DEFAULT 0 CHECK (room_require_own IN (0, 1));
ALTER TABLE participants ADD COLUMN bed_own INTEGER NOT NULL DEFAULT 0 CHECK (bed_own IN (0, 1));
ALTER TABLE participants ADD COLUMN bed_share_anyone INTEGER NOT NULL DEFAULT 0 CHECK (bed_share_anyone IN (0, 1));
ALTER TABLE participants ADD COLUMN bed_share_women INTEGER NOT NULL DEFAULT 0 CHECK (bed_share_women IN (0, 1));
ALTER TABLE participants ADD COLUMN bed_share_men INTEGER NOT NULL DEFAULT 0 CHECK (bed_share_men IN (0, 1));
ALTER TABLE participants ADD COLUMN baggage_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(baggage_json) AND json_type(baggage_json) = 'array');

UPDATE participants
SET room_happy_to_share = EXISTS (
      SELECT 1 FROM participant_room_preferences preference
      WHERE preference.trip_id = participants.trip_id AND preference.participant_id = participants.id AND preference.preference = 'happy-to-share'
    ),
    room_prefer_own = EXISTS (
      SELECT 1 FROM participant_room_preferences preference
      WHERE preference.trip_id = participants.trip_id AND preference.participant_id = participants.id AND preference.preference = 'prefer-own'
    ),
    room_require_own = EXISTS (
      SELECT 1 FROM participant_room_preferences preference
      WHERE preference.trip_id = participants.trip_id AND preference.participant_id = participants.id AND preference.preference = 'require-own'
    ),
    bed_own = EXISTS (
      SELECT 1 FROM participant_bed_preferences preference
      WHERE preference.trip_id = participants.trip_id AND preference.participant_id = participants.id AND preference.preference = 'own-bed'
    ),
    bed_share_anyone = EXISTS (
      SELECT 1 FROM participant_bed_preferences preference
      WHERE preference.trip_id = participants.trip_id AND preference.participant_id = participants.id AND preference.preference = 'share-anyone'
    ),
    bed_share_women = EXISTS (
      SELECT 1 FROM participant_bed_preferences preference
      WHERE preference.trip_id = participants.trip_id AND preference.participant_id = participants.id AND preference.preference = 'share-women'
    ),
    bed_share_men = EXISTS (
      SELECT 1 FROM participant_bed_preferences preference
      WHERE preference.trip_id = participants.trip_id AND preference.participant_id = participants.id AND preference.preference = 'share-men'
    ),
    baggage_json = COALESCE((
      SELECT json_group_array(json(item))
      FROM (
        SELECT json_object(
          'id', baggage.id,
          'label', baggage.label,
          'weightKg', baggage.weight_kg,
          'lengthCm', baggage.length_cm,
          'widthCm', baggage.width_cm,
          'heightCm', baggage.height_cm,
          'category', baggage.category
        ) AS item
        FROM baggage_items baggage
        WHERE baggage.trip_id = participants.trip_id AND baggage.participant_id = participants.id
        ORDER BY baggage.position
      )
    ), '[]');

ALTER TABLE participant_shares ADD COLUMN is_double_partner INTEGER NOT NULL DEFAULT 0 CHECK (is_double_partner IN (0, 1));

INSERT OR IGNORE INTO participant_shares (trip_id, participant_id, shared_participant_id, position, is_double_partner)
SELECT participant.trip_id, participant.id, participant.share_double_with_participant_id,
       COALESCE((
         SELECT MAX(existing.position) + 1
         FROM participant_shares existing
         WHERE existing.trip_id = participant.trip_id AND existing.participant_id = participant.id
       ), 0),
       1
FROM participants participant
WHERE participant.share_double_with_participant_id IS NOT NULL;

UPDATE participant_shares
SET is_double_partner = EXISTS (
  SELECT 1 FROM participants participant
  WHERE participant.trip_id = participant_shares.trip_id
    AND participant.id = participant_shares.participant_id
    AND participant.share_double_with_participant_id = participant_shares.shared_participant_id
);

ALTER TABLE transport_options ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json) AND json_type(details_json) = 'object');
ALTER TABLE transport_options ADD COLUMN baggage_rules_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(baggage_rules_json) AND json_type(baggage_rules_json) = 'array');

UPDATE transport_options
SET details_json = json_object('serviceNumber', service_number, 'seats', seats),
    baggage_rules_json = COALESCE((
      SELECT json_group_array(json(item))
      FROM (
        SELECT json_object(
          'label', rule.label,
          'maxWeightKg', rule.max_weight_kg,
          'maxLengthCm', rule.max_length_cm,
          'price', rule.price,
          'currency', rule.currency,
          'sourceUrl', rule.source_url,
          'checkedAt', rule.checked_at
        ) AS item
        FROM transport_baggage_rules rule
        WHERE rule.trip_id = transport_options.trip_id AND rule.transport_id = transport_options.id
        ORDER BY rule.position
      )
    ), '[]');

ALTER TABLE accommodation_options ADD COLUMN site_distances_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(site_distances_json) AND json_type(site_distances_json) = 'array');
ALTER TABLE accommodation_options ADD COLUMN rooms_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(rooms_json) AND json_type(rooms_json) = 'array');

UPDATE accommodation_options
SET site_distances_json = COALESCE((
      SELECT json_group_array(json(item))
      FROM (
        SELECT json_object(
          'site', distance.site,
          'minutes', distance.minutes,
          'coordinates', CASE
            WHEN distance.latitude IS NOT NULL AND distance.longitude IS NOT NULL
            THEN json_object('latitude', distance.latitude, 'longitude', distance.longitude)
            ELSE NULL
          END
        ) AS item
        FROM accommodation_site_distances distance
        WHERE distance.trip_id = accommodation_options.trip_id AND distance.accommodation_id = accommodation_options.id
        ORDER BY distance.position
      )
    ), '[]'),
    rooms_json = COALESCE((
      SELECT json_group_array(json(room_item))
      FROM (
        SELECT json_object(
          'id', room.id,
          'name', room.name,
          'private', json(CASE WHEN room.private = 1 THEN 'true' ELSE 'false' END),
          'beds', json(COALESCE((
            SELECT json_group_array(json(bed_item))
            FROM (
              SELECT json_object('id', bed.id, 'type', bed.type, 'sleeps', bed.sleeps) AS bed_item
              FROM accommodation_beds bed
              WHERE bed.trip_id = room.trip_id
                AND bed.accommodation_id = room.accommodation_id
                AND bed.room_id = room.id
              ORDER BY bed.position
            )
          ), '[]'))
        ) AS room_item
        FROM accommodation_rooms room
        WHERE room.trip_id = accommodation_options.trip_id AND room.accommodation_id = accommodation_options.id
        ORDER BY room.position
      )
    ), '[]');
