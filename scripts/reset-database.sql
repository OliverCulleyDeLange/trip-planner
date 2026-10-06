PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS activity_votes;
DROP TABLE IF EXISTS activity_participants;
DROP TABLE IF EXISTS activity_options;
DROP TABLE IF EXISTS accommodation_votes;
DROP TABLE IF EXISTS accommodation_beds;
DROP TABLE IF EXISTS accommodation_rooms;
DROP TABLE IF EXISTS accommodation_site_distances;
DROP TABLE IF EXISTS accommodation_participants;
DROP TABLE IF EXISTS accommodation_options;
DROP TABLE IF EXISTS transport_votes;
DROP TABLE IF EXISTS transport_baggage_rules;
DROP TABLE IF EXISTS transport_participants;
DROP TABLE IF EXISTS transport_options;
DROP TABLE IF EXISTS availability;
DROP TABLE IF EXISTS availability_ranges;
DROP TABLE IF EXISTS baggage_items;
DROP TABLE IF EXISTS participant_shares;
DROP TABLE IF EXISTS participant_bed_preferences;
DROP TABLE IF EXISTS participant_room_preferences;
DROP TABLE IF EXISTS anonymous_sessions;
DROP TABLE IF EXISTS participants;
DROP TABLE IF EXISTS trips;

-- Previous pre-squash table names, retained only so this reset script can
-- replace an existing development or deployed database in one pass.
DROP TABLE IF EXISTS activities;
DROP TABLE IF EXISTS date_options;
DROP TABLE IF EXISTS rate_limits;
DROP TABLE IF EXISTS trip_permissions;
DROP TABLE IF EXISTS trip_access;
DROP TABLE IF EXISTS trip_memberships;
DROP TABLE IF EXISTS account_sessions;
DROP TABLE IF EXISTS d1_migrations;

PRAGMA foreign_keys = ON;
