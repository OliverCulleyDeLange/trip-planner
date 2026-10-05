import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrip } from '../server/trips';
import { ApiTripRepository } from './api-repository';

const request = {
  displayName: 'Oliver', title: 'Winter trip', destination: 'Madrid',
  availabilityRanges: [{ start: '2027-01-10', end: '2027-01-12' }],
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('ApiTripRepository revision conflicts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('retries any trip mutation once with the latest revision', async () => {
    const { trip } = createTrip(request);
    trip.revision = 4;
    const conflicted = structuredClone(trip);
    conflicted.revision = 5;
    conflicted.destination = 'Barcelona';
    const saved = structuredClone(conflicted);
    saved.revision = 6;
    saved.title = 'Renamed trip';

    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ trip }))
      .mockResolvedValueOnce(response({ trip: conflicted }, 409))
      .mockResolvedValueOnce(response({ trip: saved }));
    const repository = new ApiTripRepository();
    await repository.getTrip(trip.id);

    const result = await repository.updateTrip(trip.id, {
      title: 'Renamed trip',
      destination: conflicted.destination,
      dateRange: trip.dateRange,
      availabilityWindow: trip.availabilityWindow,
    });

    expect(result).toEqual(saved);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({
      operation: 'updateTrip',
      expectedRevision: 5,
    });
  });

  it('retries a deletion once with the latest revision after a conflict', async () => {
    const { trip } = createTrip(request);
    const removed = { ...trip.participants[0], id: 'person-alex', name: 'Alex' };
    trip.participants.push(removed);
    trip.revision = 4;
    const conflicted = structuredClone(trip);
    conflicted.revision = 5;
    conflicted.title = 'Updated elsewhere';
    const deleted = structuredClone(conflicted);
    deleted.revision = 6;
    deleted.participants = deleted.participants.filter(person => person.id !== removed.id);

    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ trip }))
      .mockResolvedValueOnce(response({ trip: conflicted }, 409))
      .mockResolvedValueOnce(response({ trip: deleted }));
    const repository = new ApiTripRepository();
    await repository.getTrip(trip.id);

    const result = await repository.removeParticipant(trip.id, removed.id);

    expect(result).toEqual(deleted);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({
      operation: 'removeParticipant',
      payload: { participantId: removed.id },
      expectedRevision: 5,
    });
  });

  it('treats an already completed deletion as success after a conflict', async () => {
    const { trip } = createTrip(request);
    const removed = { ...trip.participants[0], id: 'person-alex', name: 'Alex' };
    trip.participants.push(removed);
    trip.revision = 4;
    const conflicted = structuredClone(trip);
    conflicted.revision = 5;
    conflicted.participants = conflicted.participants.filter(person => person.id !== removed.id);

    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ trip }))
      .mockResolvedValueOnce(response({ trip: conflicted }, 409));
    const repository = new ApiTripRepository();
    await repository.getTrip(trip.id);

    await expect(repository.removeParticipant(trip.id, removed.id)).resolves.toEqual(conflicted);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
