export type Id = string;

export type TripStage = 'planning' | 'voting' | 'booked' | 'travelling';
export type AvailabilityStatus = 'available' | 'maybe' | 'unavailable';
export type AvailabilitySlot = 'all-day' | 'morning' | 'afternoon' | 'evening';
export type TransportMode = 'flight' | 'train' | 'coach' | 'car' | 'ferry';
export type PlanStatus = 'idea' | 'shortlisted' | 'selected' | 'booked';
export type VoteValue = 'first-choice' | 'acceptable' | 'unacceptable';
export type BedType = 'single' | 'double' | 'king' | 'bunk' | 'sofa-bed';
export type Sex = 'female' | 'male' | 'other' | 'prefer-not-to-say';
export type RoomPreference = 'happy-to-share' | 'prefer-own' | 'require-own';
export type BedPreference = 'own-bed' | 'share-anyone' | 'share-women' | 'share-men';

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface Participant {
  id: Id;
  name: string;
  initials: string;
  colour: string;
  origin: string;
  originCoordinates?: GeoCoordinates;
  sex: Sex;
  confirmed: boolean;
  sleepingPreferences: {
    ownRoom: 'required' | 'preferred' | 'not-needed';
    ownBed: boolean;
    shareDoubleWithParticipantId?: Id;
    acceptsSofaBed: boolean;
    roomPreferences: RoomPreference[];
    bedPreferences: BedPreference[];
    shareWithParticipantIds: Id[];
  };
  baggage: BaggageItem[];
}

export interface BaggageItem {
  id: Id;
  label: string;
  weightKg: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  category: 'carry-on' | 'personal' | 'cabin' | 'checked' | 'ski' | 'sports' | 'other';
}

export interface AvailabilityEntry {
  participantId: Id;
  date: string;
  slot: AvailabilitySlot;
  status: AvailabilityStatus;
}

export interface BaggageRule {
  label: string;
  maxWeightKg?: number;
  maxLengthCm?: number;
  price: number;
  currency: 'GBP' | 'EUR';
  sourceUrl: string;
  checkedAt: string;
}

export interface TransportOption {
  id: Id;
  mode: TransportMode;
  status: PlanStatus;
  title: string;
  operator: string;
  serviceNumber?: string;
  origin: string;
  originCoordinates?: GeoCoordinates;
  destination: string;
  destinationCoordinates?: GeoCoordinates;
  departureAt: string;
  arrivalAt: string;
  participantIds: Id[];
  seats?: number;
  pricePerPerson: number;
  currency: 'GBP' | 'EUR';
  bookingUrl?: string;
  baggageRules: BaggageRule[];
  notes?: string;
  votes: Record<Id, VoteValue>;
  bookingReference?: string;
}

export interface Bed {
  id: Id;
  type: BedType;
  sleeps: number;
}

export interface Room {
  id: Id;
  name: string;
  private: boolean;
  beds: Bed[];
}

export interface AccommodationOption {
  id: Id;
  status: PlanStatus;
  participantIds?: Id[];
  name: string;
  platform: string;
  sourceUrl: string;
  location: string;
  locationCoordinates?: GeoCoordinates;
  priceTotal: number;
  currency: 'GBP' | 'EUR';
  checkIn: string;
  checkOut: string;
  walkToPrimarySiteMinutes: number;
  siteDistances: { site: string; minutes: number; coordinates?: GeoCoordinates }[];
  rooms: Room[];
  votes: Record<Id, VoteValue>;
  fitSummary: string;
  fitLevel: 'good' | 'compromise' | 'invalid';
  notes?: string;
  bookingReference?: string;
}

export interface ActivityOption {
  id: Id;
  status: PlanStatus;
  participantIds?: Id[];
  name: string;
  category?: string;
  location?: string;
  locationCoordinates?: GeoCoordinates;
  date?: string;
  time?: string;
  sourceUrl?: string;
  costPerPerson?: number;
  currency: 'GBP' | 'EUR';
  notes?: string;
  votes: Record<Id, VoteValue>;
}

export interface Trip {
  id: Id;
  revision: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  subtitle: string;
  destination: string;
  destinationCoordinates?: GeoCoordinates;
  stage: TripStage;
  currency: 'GBP' | 'EUR';
  dateRange: { start: string; end: string };
  availabilityWindow: { start: string; end: string };
  availabilityRanges: { id: Id; start: string; end: string }[];
  preferredDateRange?: { start: string; end: string };
  participants: Participant[];
  availability: AvailabilityEntry[];
  transportOptions: TransportOption[];
  accommodationOptions: AccommodationOption[];
  activities: ActivityOption[];
}

export interface TripSession {
  tripId: Id;
  participantId: Id;
  displayName: string;
}

export interface TripExport {
  schemaVersion: 1;
  exportedAt: string;
  trip: Trip;
}

export interface JoinTripRequest {
  tripId: string;
  participantId?: Id;
  displayName?: string;
}

export interface CreateTripRequest {
  displayName: string;
  title: string;
  destination: string;
  destinationCoordinates?: GeoCoordinates;
  availabilityRanges: { start: string; end: string }[];
}

export interface TripRepository {
  createTrip(request: CreateTripRequest): Promise<{ trip: Trip; session: TripSession }>;
  importTrip(exported: TripExport): Promise<{ trip: Trip; session: TripSession }>;
  restoreTrip(tripId: string): Promise<{ trip: Trip; session?: TripSession } | undefined>;
  accessTrip(request: JoinTripRequest): Promise<{ trip: Trip; session: TripSession }>;
  getTrip(tripId: Id): Promise<Trip>;
  updateTrip(tripId: Id, patch: Pick<Trip, 'title' | 'destination' | 'destinationCoordinates' | 'dateRange' | 'availabilityWindow'>): Promise<Trip>;
  saveAvailabilityRange(tripId: Id, range: { id: Id; start: string; end: string }): Promise<Trip>;
  removeAvailabilityRange(tripId: Id, rangeId: Id): Promise<Trip>;
  resetAvailability(tripId: Id): Promise<Trip>;
  selectPreferredDates(tripId: Id, range: { start: string; end: string }): Promise<Trip>;
  saveParticipant(tripId: Id, participant: Participant): Promise<Trip>;
  removeParticipant(tripId: Id, participantId: Id): Promise<Trip>;
  setAvailability(tripId: Id, participantId: Id, date: string, slot: AvailabilitySlot, status: AvailabilityStatus): Promise<Trip>;
  setRangeAvailability(tripId: Id, participantId: Id, start: string, end: string, status: AvailabilityStatus): Promise<Trip>;
  saveTransportOption(tripId: Id, option: TransportOption): Promise<Trip>;
  removeTransportOption(tripId: Id, transportId: Id): Promise<Trip>;
  voteForTransport(tripId: Id, transportId: Id, participantId: Id, vote: VoteValue): Promise<Trip>;
  selectTransport(tripId: Id, transportId: Id): Promise<Trip>;
  saveAccommodationOption(tripId: Id, option: AccommodationOption): Promise<Trip>;
  removeAccommodationOption(tripId: Id, accommodationId: Id): Promise<Trip>;
  voteForAccommodation(tripId: Id, accommodationId: Id, participantId: Id, vote: VoteValue): Promise<Trip>;
  selectAccommodation(tripId: Id, accommodationId: Id): Promise<Trip>;
  saveActivityOption(tripId: Id, activity: ActivityOption): Promise<Trip>;
  removeActivityOption(tripId: Id, activityId: Id): Promise<Trip>;
  voteForActivity(tripId: Id, activityId: Id, participantId: Id, vote: VoteValue): Promise<Trip>;
  selectActivity(tripId: Id, activityId: Id): Promise<Trip>;
}
