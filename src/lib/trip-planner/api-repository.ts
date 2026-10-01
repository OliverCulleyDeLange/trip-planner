import type {
  AccommodationOption, ActivityOption, AvailabilitySlot, AvailabilityStatus, CreateTripRequest, Id, Participant,
  TransportOption, Trip, TripAccessRequest, TripExport, TripRepository, TripSession, VoteValue,
} from './types';

type TripResult = { trip: Trip; session?: TripSession };

export class RevisionConflictError extends Error {
  constructor() {
    super('This trip changed in another browser. The latest version has been loaded; please try your change again.');
    this.name = 'RevisionConflictError';
  }
}

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;

export class ApiTripRepository implements TripRepository {
  private readonly trips = new Map<Id, Trip>();

  async createTrip(request: CreateTripRequest): Promise<{ trip: Trip; session: TripSession }> {
    return this.storeResult(await this.request<TripResult>('/trips', { method: 'POST', body: JSON.stringify({ kind: 'create', request }) })) as { trip: Trip; session: TripSession };
  }

  async createDemoTrip(): Promise<{ trip: Trip; session: TripSession }> {
    return this.storeResult(await this.request<TripResult>('/trips', { method: 'POST', body: JSON.stringify({ kind: 'demo' }) })) as { trip: Trip; session: TripSession };
  }

  async importTrip(exported: TripExport): Promise<{ trip: Trip; session: TripSession }> {
    return this.storeResult(await this.request<TripResult>('/trips', { method: 'POST', body: JSON.stringify({ kind: 'import', exported }) })) as { trip: Trip; session: TripSession };
  }

  async restoreTrip(tripId: string): Promise<TripResult | undefined> {
    const response = await fetch(`${apiBase}/trips/${encodeURIComponent(tripId)}`, { credentials: 'same-origin' });
    if (response.status === 404) return undefined;
    return this.storeResult(await this.parse<TripResult>(response));
  }

  async accessTrip(request: TripAccessRequest): Promise<{ trip: Trip; session: TripSession }> {
    const result = await this.request<TripResult>(`/trips/${encodeURIComponent(request.tripId)}/join`, {
      method: 'POST', body: JSON.stringify({ displayName: request.displayName, expectedRevision: this.requireTrip(request.tripId).revision }),
    }, request.tripId);
    return this.storeResult(result) as { trip: Trip; session: TripSession };
  }

  async getTrip(tripId: Id): Promise<Trip> {
    const result = await this.request<TripResult>(`/trips/${encodeURIComponent(tripId)}`);
    return this.storeResult(result).trip;
  }

  updateTrip(tripId: Id, patch: Pick<Trip, 'title' | 'destination' | 'destinationCoordinates' | 'dateRange' | 'availabilityWindow'>): Promise<Trip> {
    return this.mutate(tripId, 'updateTrip', patch);
  }

  saveAvailabilityRange(tripId: Id, range: { id: Id; start: string; end: string }): Promise<Trip> { return this.mutate(tripId, 'saveAvailabilityRange', range); }
  removeAvailabilityRange(tripId: Id, rangeId: Id): Promise<Trip> { return this.mutate(tripId, 'removeAvailabilityRange', { rangeId }); }
  resetAvailability(tripId: Id): Promise<Trip> { return this.mutate(tripId, 'resetAvailability', {}); }
  selectPreferredDates(tripId: Id, range: { start: string; end: string }): Promise<Trip> { return this.mutate(tripId, 'selectPreferredDates', range); }
  saveParticipant(tripId: Id, participant: Participant): Promise<Trip> { return this.mutate(tripId, 'saveParticipant', participant); }
  setAvailability(tripId: Id, participantId: Id, date: string, slot: AvailabilitySlot, status: AvailabilityStatus): Promise<Trip> { return this.mutate(tripId, 'setAvailability', { participantId, date, slot, status }); }
  setRangeAvailability(tripId: Id, participantId: Id, start: string, end: string, status: AvailabilityStatus): Promise<Trip> { return this.mutate(tripId, 'setRangeAvailability', { participantId, start, end, status }); }
  saveTransportOption(tripId: Id, option: TransportOption): Promise<Trip> { return this.mutate(tripId, 'saveTransportOption', option); }
  removeTransportOption(tripId: Id, transportId: Id): Promise<Trip> { return this.mutate(tripId, 'removeTransportOption', { transportId }); }
  voteForTransport(tripId: Id, transportId: Id, participantId: Id, vote: VoteValue): Promise<Trip> { return this.mutate(tripId, 'voteForTransport', { transportId, participantId, vote }); }
  selectTransport(tripId: Id, transportId: Id): Promise<Trip> { return this.mutate(tripId, 'selectTransport', { transportId }); }
  saveAccommodationOption(tripId: Id, option: AccommodationOption): Promise<Trip> { return this.mutate(tripId, 'saveAccommodationOption', option); }
  voteForAccommodation(tripId: Id, accommodationId: Id, participantId: Id, vote: VoteValue): Promise<Trip> { return this.mutate(tripId, 'voteForAccommodation', { accommodationId, participantId, vote }); }
  selectAccommodation(tripId: Id, accommodationId: Id): Promise<Trip> { return this.mutate(tripId, 'selectAccommodation', { accommodationId }); }
  saveActivityOption(tripId: Id, activity: ActivityOption): Promise<Trip> { return this.mutate(tripId, 'saveActivityOption', activity); }
  removeActivityOption(tripId: Id, activityId: Id): Promise<Trip> { return this.mutate(tripId, 'removeActivityOption', { activityId }); }
  voteForActivity(tripId: Id, activityId: Id, participantId: Id, vote: VoteValue): Promise<Trip> { return this.mutate(tripId, 'voteForActivity', { activityId, participantId, vote }); }
  selectActivity(tripId: Id, activityId: Id): Promise<Trip> { return this.mutate(tripId, 'selectActivity', { activityId }); }

  private async mutate(tripId: Id, operation: string, payload: unknown): Promise<Trip> {
    const result = await this.request<TripResult>(`/trips/${encodeURIComponent(tripId)}/mutate`, {
      method: 'POST', body: JSON.stringify({ operation, payload, expectedRevision: this.requireTrip(tripId).revision }),
    }, tripId);
    return this.storeResult(result).trip;
  }

  private requireTrip(tripId: Id): Trip {
    const trip = this.trips.get(tripId);
    if (!trip) throw new Error('Trip not found.');
    return trip;
  }

  private storeResult(result: TripResult): TripResult {
    this.trips.set(result.trip.id, structuredClone(result.trip));
    return structuredClone(result);
  }

  private async request<T>(path: string, init: RequestInit = {}, conflictTripId?: string): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...init.headers },
    });
    if (response.status === 409 && conflictTripId) {
      const conflict = await this.parse<TripResult>(response);
      this.storeResult(conflict);
      throw new RevisionConflictError();
    }
    return this.parse<T>(response);
  }

  private async parse<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => ({})) as { error?: string } & T;
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
    return body;
  }
}
