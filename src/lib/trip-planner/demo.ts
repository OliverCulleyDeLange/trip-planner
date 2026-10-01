import type { Participant, Trip } from './types';

const people: Participant[] = [
  {
    id: 'oliver', name: 'Oliver', initials: 'O', colour: '#8cc5a0', origin: 'London Stansted', sex: 'male', confirmed: true, goWithFlow: false,
    sleepingPreferences: { ownRoom: 'not-needed', ownBed: true, shareDoubleWithParticipantId: 'alex', acceptsSofaBed: false, roomPreferences: ['happy-to-share'], bedPreferences: ['own-bed'], shareWithParticipantIds: ['alex'] },
    baggage: [{ id: 'oliver-cabin', label: 'Cabin bag', weightKg: 8, lengthCm: 55, widthCm: 40, heightCm: 20, category: 'cabin' }, { id: 'oliver-skis', label: 'Ski bag', weightKg: 19, lengthCm: 185, widthCm: 30, heightCm: 20, category: 'sports' }],
  },
  {
    id: 'alex', name: 'Alex', initials: 'A', colour: '#e4bd88', origin: 'London Stansted', sex: 'female', confirmed: true, goWithFlow: false,
    sleepingPreferences: { ownRoom: 'not-needed', ownBed: false, shareDoubleWithParticipantId: 'oliver', acceptsSofaBed: false, roomPreferences: ['happy-to-share'], bedPreferences: [], shareWithParticipantIds: ['oliver'] },
    baggage: [{ id: 'alex-cabin', label: 'Cabin bag', weightKg: 7, lengthCm: 55, widthCm: 40, heightCm: 20, category: 'cabin' }],
  },
  {
    id: 'conor', name: 'Conor', initials: 'C', colour: '#8fb2dc', origin: 'London Gatwick', sex: 'male', confirmed: true, goWithFlow: false,
    sleepingPreferences: { ownRoom: 'preferred', ownBed: true, acceptsSofaBed: false, roomPreferences: ['happy-to-share', 'prefer-own'], bedPreferences: ['own-bed'], shareWithParticipantIds: [] },
    baggage: [{ id: 'conor-checked', label: 'Checked bag', weightKg: 20, category: 'checked' }, { id: 'conor-skis', label: 'Snowboard bag', weightKg: 18, lengthCm: 170, widthCm: 35, heightCm: 20, category: 'sports' }],
  },
  {
    id: 'hanah', name: 'Hanah', initials: 'H', colour: '#d99da2', origin: 'Bristol', sex: 'female', confirmed: true, goWithFlow: false,
    sleepingPreferences: { ownRoom: 'not-needed', ownBed: true, acceptsSofaBed: true, roomPreferences: ['happy-to-share'], bedPreferences: ['own-bed', 'sofa-bed'], shareWithParticipantIds: [] },
    baggage: [{ id: 'hanah-cabin', label: 'Cabin bag', weightKg: 10, category: 'cabin' }, { id: 'hanah-skis', label: 'Ski bag', weightKg: 20, lengthCm: 180, widthCm: 30, heightCm: 20, category: 'sports' }],
  },
  {
    id: 'jacob', name: 'Jacob', initials: 'J', colour: '#83c6bf', origin: 'Manchester', sex: 'male', confirmed: false, goWithFlow: false,
    sleepingPreferences: { ownRoom: 'required', ownBed: true, acceptsSofaBed: false, roomPreferences: ['require-own'], bedPreferences: ['own-bed'], shareWithParticipantIds: [] },
    baggage: [{ id: 'jacob-checked', label: 'Checked bag', weightKg: 23, category: 'checked' }, { id: 'jacob-skis', label: 'Ski bag', weightKg: 21, lengthCm: 190, widthCm: 32, heightCm: 22, category: 'sports' }],
  },
];

const ranges = [
  { id: 'range-a', start: '2027-01-09', end: '2027-01-16' },
  { id: 'range-b', start: '2027-01-23', end: '2027-01-30' },
  { id: 'range-c', start: '2027-02-06', end: '2027-02-13' },
];

const days = (start: string, end: string) => {
  const output: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) { output.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return output;
};

export function buildDemoTrip(id: string, shareToken: string): Trip {
  const availability = ranges.flatMap((candidate, rangeIndex) => days(candidate.start, candidate.end).flatMap((date, dayIndex) =>
    people.filter((_, personIndex) => (dayIndex + personIndex + rangeIndex) % 5 !== 0).map(person => ({ participantId: person.id, date, slot: 'all-day' as const, status: 'available' as const }))));
  return {
    id, shareToken, title: 'Ski trip 2027', subtitle: '', destination: 'Serre Chevalier, France', stage: 'planning', currency: 'GBP',
    dateRange: { start: ranges[0].start, end: ranges[0].end }, availabilityWindow: { start: ranges[0].start, end: ranges[2].end }, availabilityRanges: structuredClone(ranges),
    participants: structuredClone(people), availability,
    transportOptions: [
      { id: 'ryanair-stn', mode: 'flight', status: 'shortlisted', title: 'Stansted to Turin', operator: 'Ryanair', serviceNumber: 'FR 464', origin: 'London Stansted', destination: 'Turin', departureAt: '2027-01-09T14:25', arrivalAt: '2027-01-09T17:20', participantIds: ['oliver', 'alex'], pricePerPerson: 135.98, currency: 'GBP', bookingUrl: 'https://www.ryanair.com/', baggageRules: [{ label: '20 kg checked bag', maxWeightKg: 20, price: 60, currency: 'GBP', sourceUrl: 'https://help.ryanair.com/hc/en-gb/categories/12489112419089-Bag-Rules', checkedAt: '2026-09-28' }, { label: 'Sports equipment', maxWeightKg: 20, price: 45, currency: 'GBP', sourceUrl: 'https://help.ryanair.com/hc/en-gb/categories/12489112419089-Bag-Rules', checkedAt: '2026-09-28' }], votes: { oliver: 'first-choice', alex: 'acceptable' } },
      { id: 'ba-lgw', mode: 'flight', status: 'shortlisted', title: 'Gatwick to Turin', operator: 'British Airways', serviceNumber: 'BA 2576', origin: 'London Gatwick', destination: 'Turin', departureAt: '2027-01-09T12:10', arrivalAt: '2027-01-09T15:05', participantIds: ['conor'], pricePerPerson: 188.48, currency: 'GBP', bookingUrl: 'https://www.britishairways.com/', baggageRules: [{ label: 'Checked bag', maxWeightKg: 23, price: 40, currency: 'GBP', sourceUrl: 'https://www.britishairways.com/content/information/baggage-essentials', checkedAt: '2026-09-28' }], votes: { conor: 'acceptable' } },
      { id: 'easyjet-brs', mode: 'flight', status: 'idea', title: 'Bristol to Geneva', operator: 'easyJet', origin: 'Bristol', destination: 'Geneva', departureAt: '2027-01-09T07:15', arrivalAt: '2027-01-09T10:05', participantIds: ['hanah'], pricePerPerson: 96, currency: 'GBP', bookingUrl: 'https://www.easyjet.com/', baggageRules: [{ label: 'Sports equipment', maxWeightKg: 20, price: 42, currency: 'GBP', sourceUrl: 'https://www.easyjet.com/en/help/baggage/sports-equipment', checkedAt: '2026-09-28' }], votes: { hanah: 'first-choice' } },
      { id: 'man-train', mode: 'train', status: 'idea', title: 'Manchester to London', operator: 'Avanti West Coast', origin: 'Manchester Piccadilly', destination: 'London Euston', departureAt: '2027-01-09T06:03', arrivalAt: '2027-01-09T08:12', participantIds: ['jacob'], pricePerPerson: 68, currency: 'GBP', bookingUrl: 'https://www.avantiwestcoast.co.uk/', baggageRules: [], votes: {} },
      { id: 'alps-transfer', mode: 'transfer', status: 'shortlisted', title: 'Turin to Serre Chevalier', operator: 'Private minibus', origin: 'Turin Airport', destination: 'Serre Chevalier', departureAt: '2027-01-09T18:15', arrivalAt: '2027-01-09T20:45', participantIds: ['oliver', 'alex', 'conor', 'hanah', 'jacob'], pricePerPerson: 52, currency: 'EUR', baggageRules: [], votes: { oliver: 'acceptable', alex: 'acceptable', hanah: 'acceptable' } },
    ],
    accommodationOptions: [
      { id: 'cristal', status: 'shortlisted', name: 'Cristal Lodge', platform: 'Direct', sourceUrl: 'https://www.terresens-hr.co.uk/', location: 'La Salle-les-Alpes', priceTotal: 1126.18, currency: 'GBP', checkIn: '2027-01-09', checkOut: '2027-01-16', walkToPrimarySiteMinutes: 6, siteDistances: [{ site: 'Aravet lift', minutes: 6 }, { site: 'Supermarket', minutes: 9 }, { site: 'Ski school', minutes: 7 }], rooms: [{ id: 'c1', name: 'Bedroom 1', private: true, beds: [{ id: 'cb1', type: 'double', sleeps: 2 }] }, { id: 'c2', name: 'Bedroom 2', private: true, beds: [{ id: 'cb2', type: 'single', sleeps: 1 }, { id: 'cb3', type: 'single', sleeps: 1 }] }, { id: 'c3', name: 'Bedroom 3', private: true, beds: [{ id: 'cb4', type: 'single', sleeps: 1 }] }], votes: { oliver: 'first-choice', alex: 'first-choice', hanah: 'acceptable' }, fitSummary: 'Five sleeping spaces; Jacob gets a private room and nobody needs the sofa.', fitLevel: 'good' },
      { id: 'meleze', status: 'shortlisted', name: 'Chalet Mélèze', platform: 'Airbnb', sourceUrl: 'https://www.airbnb.co.uk/', location: 'Briançon', priceTotal: 920, currency: 'GBP', checkIn: '2027-01-09', checkOut: '2027-01-16', walkToPrimarySiteMinutes: 18, siteDistances: [{ site: 'Prorel lift', minutes: 18 }, { site: 'Old town', minutes: 5 }], rooms: [{ id: 'm1', name: 'Bedroom 1', private: true, beds: [{ id: 'mb1', type: 'double', sleeps: 2 }] }, { id: 'm2', name: 'Bedroom 2', private: true, beds: [{ id: 'mb2', type: 'double', sleeps: 2 }] }, { id: 'm3', name: 'Living room', private: false, beds: [{ id: 'mb3', type: 'sofa-bed', sleeps: 1 }] }], votes: { conor: 'unacceptable', hanah: 'acceptable' }, fitSummary: 'Fits five only if one person uses the living-room sofa bed.', fitLevel: 'compromise' },
      { id: 'aigle', status: 'shortlisted', name: 'Résidence Aigle Bleu', platform: 'Booking.com', sourceUrl: 'https://www.booking.com/', location: 'Briançon', priceTotal: 1390, currency: 'GBP', checkIn: '2027-01-09', checkOut: '2027-01-16', walkToPrimarySiteMinutes: 11, siteDistances: [{ site: 'Prorel lift', minutes: 11 }, { site: 'Train station', minutes: 14 }, { site: 'Supermarket', minutes: 4 }], rooms: [{ id: 'a1', name: 'Bedroom 1', private: true, beds: [{ id: 'ab1', type: 'double', sleeps: 2 }] }, { id: 'a2', name: 'Bedroom 2', private: true, beds: [{ id: 'ab2', type: 'single', sleeps: 1 }] }, { id: 'a3', name: 'Bedroom 3', private: true, beds: [{ id: 'ab3', type: 'single', sleeps: 1 }] }, { id: 'a4', name: 'Bedroom 4', private: true, beds: [{ id: 'ab4', type: 'single', sleeps: 1 }] }], votes: { conor: 'first-choice', jacob: 'first-choice', oliver: 'acceptable' }, fitSummary: 'Everyone has a bed and Jacob can have a private room.', fitLevel: 'good' },
    ],
    activities: [
      { id: 'activity-1', status: 'shortlisted', name: 'Explore Briançon old town', category: 'Sightseeing', location: 'Cité Vauban', date: '2027-01-10', time: '17:30', costPerPerson: 0, currency: 'EUR', votes: { oliver: 'acceptable', alex: 'first-choice' } },
      { id: 'activity-2', status: 'idea', name: 'Group dinner', category: 'Food', location: 'La Salle-les-Alpes', date: '2027-01-12', time: '20:00', costPerPerson: 35, currency: 'EUR', votes: { hanah: 'first-choice', conor: 'acceptable' } },
    ],
  };
}
