import { describe, expect, it } from 'vitest';
import { buildDemoTrip } from '../trip-planner/demo';
import { applyMutation, type TripMutation } from './trips';
import { jsonRowsInsertSql, relatedRowsSql, relationalTableColumns, updateTrip } from './database';

describe('D1 normalized persistence', () => {
  it('loads all normalized child tables in one fixed statement', () => {
    const sql = relatedRowsSql();
    expect(sql).not.toContain('UNION');
    expect(sql.match(/json_group_array/g)).toHaveLength(Object.keys(relationalTableColumns).length);
    expect(sql.match(/\?/g)).toHaveLength(1);
  });

  it('bulk inserts arbitrary row counts through one JSON parameter', () => {
    const sql = jsonRowsInsertSql('availability', true, true);
    expect(sql).toContain('json_each(?)');
    expect(sql).toContain('ON CONFLICT (trip_id, participant_id, date, slot)');
    expect(sql.match(/\?/g)).toHaveLength(3);
  });

  it('keeps owned collections on their main entities and only genuine relationships in lookup tables', () => {
    expect(Object.keys(relationalTableColumns)).not.toEqual(expect.arrayContaining([
      'participant_room_preferences', 'participant_bed_preferences', 'baggage_items',
      'transport_baggage_rules', 'accommodation_site_distances', 'accommodation_rooms', 'accommodation_beds',
    ]));
    expect(relationalTableColumns.transport_options).toContain('details_json');
    expect(relationalTableColumns.transport_options).not.toEqual(expect.arrayContaining(['service_number', 'seats']));
    expect(relationalTableColumns.accommodation_options).toEqual(expect.arrayContaining(['site_distances_json', 'rooms_json']));
  });

  it('keeps every ordinary mutation comfortably below the D1 Free query budget', async () => {
    const demo = buildDemoTrip('budget-test');
    const mutations: TripMutation[] = [
      { operation: 'updateTrip', payload: { title: 'Updated', destination: demo.destination, destinationCoordinates: demo.destinationCoordinates, dateRange: demo.dateRange, availabilityWindow: demo.availabilityWindow } },
      { operation: 'saveAvailabilityRange', payload: { ...demo.availabilityRanges[0], end: demo.availabilityRanges[0].end } },
      { operation: 'removeAvailabilityRange', payload: { rangeId: demo.availabilityRanges[1].id } },
      { operation: 'resetAvailability', payload: {} },
      { operation: 'selectPreferredDates', payload: demo.dateRange },
      { operation: 'saveParticipant', payload: { ...demo.participants[0], name: 'Updated person' } },
      { operation: 'removeParticipant', payload: { participantId: demo.participants[1].id } },
      { operation: 'setAvailability', payload: { participantId: demo.participants[0].id, date: demo.dateRange.start, slot: 'all-day', status: 'available' } },
      { operation: 'setRangeAvailability', payload: { participantId: demo.participants[0].id, start: demo.dateRange.start, end: demo.dateRange.end, status: 'available' } },
      { operation: 'saveTransportOption', payload: demo.transportOptions[0] },
      { operation: 'removeTransportOption', payload: { transportId: demo.transportOptions[0].id } },
      { operation: 'voteForTransport', payload: { transportId: demo.transportOptions[0].id, participantId: demo.participants[0].id, vote: 'acceptable' } },
      { operation: 'selectTransport', payload: { transportId: demo.transportOptions[0].id } },
      { operation: 'saveAccommodationOption', payload: demo.accommodationOptions[0] },
      { operation: 'removeAccommodationOption', payload: { accommodationId: demo.accommodationOptions[0].id } },
      { operation: 'voteForAccommodation', payload: { accommodationId: demo.accommodationOptions[0].id, participantId: demo.participants[0].id, vote: 'acceptable' } },
      { operation: 'selectAccommodation', payload: { accommodationId: demo.accommodationOptions[0].id } },
      { operation: 'saveActivityOption', payload: demo.activities[0] },
      { operation: 'removeActivityOption', payload: { activityId: demo.activities[0].id } },
      { operation: 'voteForActivity', payload: { activityId: demo.activities[0].id, participantId: demo.participants[0].id, vote: 'acceptable' } },
      { operation: 'selectActivity', payload: { activityId: demo.activities[0].id } },
    ];

    for (const mutation of mutations) {
      const queries: string[] = [];
      const statement = (sql: string): D1PreparedStatement => ({
        bind: () => statement(sql), first: async () => null, all: async () => ({ results: [], meta: { changes: 0 } }),
        run: async () => ({ results: [], meta: { changes: 0 } }),
      });
      const database: D1Database = {
        prepare(sql) { queries.push(sql); return statement(sql); },
        async batch(statements) { return statements.map((_, index) => ({ results: [], meta: { changes: index === 0 ? 1 : 0 } })); },
        async exec() {},
      };
      const changed = structuredClone(demo);
      applyMutation(changed, mutation);
      await updateTrip(database, changed, demo.revision, mutation);
      expect(queries.length + 2, mutation.operation).toBeLessThanOrEqual(10);
    }
  });
});
