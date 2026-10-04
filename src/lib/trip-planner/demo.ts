import type { Participant, Trip } from './types';

const people: Participant[] = [
  {
    id: 'oliver', name: 'Adam', initials: 'A', colour: '#8cc5a0', origin: 'Cambridge', originCoordinates: { latitude: 52.2053, longitude: 0.1218 }, sex: 'male', confirmed: true, goWithFlow: false,
    sleepingPreferences: { ownRoom: 'not-needed', ownBed: false, shareDoubleWithParticipantId: 'jacob', acceptsSofaBed: false, roomPreferences: ['happy-to-share'], bedPreferences: [], shareWithParticipantIds: ['jacob'] },
    baggage: [{ id: 'oliver-cabin', label: 'Cabin bag', weightKg: 8, lengthCm: 55, widthCm: 40, heightCm: 20, category: 'cabin' }, { id: 'oliver-skis', label: 'Ski bag', weightKg: 19, lengthCm: 185, widthCm: 30, heightCm: 20, category: 'sports' }],
  },
  {
    id: 'alex', name: 'Bob', initials: 'B', colour: '#e4bd88', origin: 'London Stansted', originCoordinates: { latitude: 51.886, longitude: 0.2389 }, sex: 'male', confirmed: true, goWithFlow: false,
    sleepingPreferences: { ownRoom: 'not-needed', ownBed: true, acceptsSofaBed: false, roomPreferences: ['happy-to-share'], bedPreferences: ['own-bed'], shareWithParticipantIds: [] },
    baggage: [{ id: 'alex-cabin', label: 'Cabin bag', weightKg: 7, lengthCm: 55, widthCm: 40, heightCm: 20, category: 'cabin' }],
  },
  {
    id: 'conor', name: 'Charlie', initials: 'C', colour: '#8fb2dc', origin: 'London Gatwick', originCoordinates: { latitude: 51.1537, longitude: -0.1821 }, sex: 'male', confirmed: true, goWithFlow: false,
    sleepingPreferences: { ownRoom: 'preferred', ownBed: true, acceptsSofaBed: false, roomPreferences: ['happy-to-share', 'prefer-own'], bedPreferences: ['own-bed'], shareWithParticipantIds: [] },
    baggage: [{ id: 'conor-checked', label: 'Checked bag', weightKg: 20, category: 'checked' }, { id: 'conor-skis', label: 'Snowboard bag', weightKg: 18, lengthCm: 170, widthCm: 35, heightCm: 20, category: 'sports' }],
  },
  {
    id: 'hanah', name: 'Dave', initials: 'D', colour: '#d99da2', origin: 'Bristol Airport', originCoordinates: { latitude: 51.3827, longitude: -2.7191 }, sex: 'male', confirmed: true, goWithFlow: false,
    sleepingPreferences: { ownRoom: 'not-needed', ownBed: true, acceptsSofaBed: false, roomPreferences: ['happy-to-share'], bedPreferences: ['own-bed'], shareWithParticipantIds: [] },
    baggage: [{ id: 'hanah-cabin', label: 'Cabin bag', weightKg: 10, category: 'cabin' }, { id: 'hanah-skis', label: 'Ski bag', weightKg: 20, lengthCm: 180, widthCm: 30, heightCm: 20, category: 'sports' }],
  },
  {
    id: 'jacob', name: 'Eve', initials: 'E', colour: '#83c6bf', origin: 'Cambridge', originCoordinates: { latitude: 52.2053, longitude: 0.1218 }, sex: 'female', confirmed: false, goWithFlow: false,
    sleepingPreferences: { ownRoom: 'not-needed', ownBed: false, shareDoubleWithParticipantId: 'oliver', acceptsSofaBed: false, roomPreferences: ['happy-to-share'], bedPreferences: [], shareWithParticipantIds: ['oliver'] },
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

export function buildDemoTrip(id: string): Trip {
  const availability = ranges.flatMap((candidate, rangeIndex) => days(candidate.start, candidate.end).flatMap(date =>
    people.filter((_, personIndex) => rangeIndex === 0
      || (rangeIndex === 1 && ![0, 2].includes(personIndex))
      || (rangeIndex === 2 && ![1, 3, 4].includes(personIndex)))
      .map(person => ({ participantId: person.id, date, slot: 'all-day' as const, status: 'available' as const }))));
  const now = new Date().toISOString();
  const trip: Trip = {
    id, revision: 0, createdAt: now, updatedAt: now, title: 'Ski trip 2027', subtitle: '', destination: 'Serre Chevalier, France', stage: 'planning', currency: 'GBP',
    dateRange: { start: ranges[0].start, end: ranges[0].end }, availabilityWindow: { start: ranges[0].start, end: ranges[2].end }, availabilityRanges: structuredClone(ranges),
    participants: structuredClone(people), availability,
    transportOptions: [
      { id: 'ryanair-stn', mode: 'flight', status: 'shortlisted', title: 'Stansted to Turin', operator: 'Ryanair', serviceNumber: 'FR 464', origin: 'London Stansted', destination: 'Turin Airport', departureAt: '2027-01-09T14:25', arrivalAt: '2027-01-09T17:20', participantIds: ['oliver', 'jacob', 'alex'], pricePerPerson: 135.98, currency: 'GBP', bookingUrl: 'https://www.ryanair.com/', baggageRules: [{ label: '20 kg checked bag', maxWeightKg: 20, price: 60, currency: 'GBP', sourceUrl: 'https://help.ryanair.com/hc/en-gb/categories/12489112419089-Bag-Rules', checkedAt: '2026-09-28' }, { label: 'Sports equipment', maxWeightKg: 20, price: 45, currency: 'GBP', sourceUrl: 'https://help.ryanair.com/hc/en-gb/categories/12489112419089-Bag-Rules', checkedAt: '2026-09-28' }], votes: { oliver: 'first-choice', jacob: 'first-choice', alex: 'acceptable' } },
      { id: 'ba-lgw', mode: 'flight', status: 'shortlisted', title: 'Gatwick to Turin', operator: 'British Airways', serviceNumber: 'BA 2576', origin: 'London Gatwick', destination: 'Turin Airport', departureAt: '2027-01-09T12:10', arrivalAt: '2027-01-09T15:05', participantIds: ['conor'], pricePerPerson: 188.48, currency: 'GBP', bookingUrl: 'https://www.britishairways.com/', baggageRules: [{ label: 'Checked bag', maxWeightKg: 23, price: 40, currency: 'GBP', sourceUrl: 'https://www.britishairways.com/content/information/baggage-essentials', checkedAt: '2026-09-28' }], votes: { conor: 'acceptable' } },
      { id: 'easyjet-brs', mode: 'flight', status: 'idea', title: 'Bristol to Geneva', operator: 'easyJet', origin: 'Bristol', destination: 'Geneva Airport', departureAt: '2027-01-09T07:15', arrivalAt: '2027-01-09T10:05', participantIds: ['hanah'], pricePerPerson: 96, currency: 'GBP', bookingUrl: 'https://www.easyjet.com/', baggageRules: [{ label: 'Sports equipment', maxWeightKg: 20, price: 42, currency: 'GBP', sourceUrl: 'https://www.easyjet.com/en/help/baggage/sports-equipment', checkedAt: '2026-09-28' }], votes: { hanah: 'first-choice' } },
      { id: 'geneva-outbound-transfer', mode: 'coach', status: 'shortlisted', title: 'Geneva to Serre Chevalier', operator: 'Shared mountain shuttle', origin: 'Geneva Airport', destination: 'Serre Chevalier', departureAt: '2027-01-09T11:00', arrivalAt: '2027-01-09T14:30', participantIds: ['hanah'], pricePerPerson: 68, currency: 'EUR', baggageRules: [], votes: { hanah: 'first-choice' } },
      { id: 'alps-transfer', mode: 'coach', status: 'shortlisted', title: 'Turin to Serre Chevalier', operator: 'Private minibus', origin: 'Turin Airport', destination: 'Serre Chevalier', departureAt: '2027-01-09T18:15', arrivalAt: '2027-01-09T20:45', participantIds: ['oliver', 'alex', 'conor', 'jacob'], pricePerPerson: 52, currency: 'EUR', baggageRules: [], votes: { oliver: 'acceptable', alex: 'acceptable', conor: 'acceptable', jacob: 'acceptable' } },
      { id: 'turin-return-transfer', mode: 'coach', status: 'shortlisted', title: 'Serre Chevalier to Turin', operator: 'Private minibus', origin: 'Serre Chevalier', destination: 'Turin Airport', departureAt: '2027-01-16T06:00', arrivalAt: '2027-01-16T08:30', participantIds: ['oliver', 'alex', 'conor', 'jacob'], pricePerPerson: 52, currency: 'EUR', baggageRules: [], votes: { oliver: 'acceptable', alex: 'acceptable', conor: 'acceptable', jacob: 'acceptable' } },
      { id: 'geneva-return-transfer', mode: 'coach', status: 'shortlisted', title: 'Serre Chevalier to Geneva', operator: 'Shared mountain shuttle', origin: 'Serre Chevalier', destination: 'Geneva Airport', departureAt: '2027-01-16T06:15', arrivalAt: '2027-01-16T09:30', participantIds: ['hanah'], pricePerPerson: 68, currency: 'EUR', baggageRules: [], votes: { hanah: 'first-choice' } },
      { id: 'ba-lgw-return', mode: 'flight', status: 'shortlisted', title: 'Turin to Gatwick', operator: 'British Airways', serviceNumber: 'BA 2577', origin: 'Turin Airport', destination: 'London Gatwick', departureAt: '2027-01-16T10:45', arrivalAt: '2027-01-16T11:40', participantIds: ['conor'], pricePerPerson: 176, currency: 'GBP', bookingUrl: 'https://www.britishairways.com/', baggageRules: [{ label: 'Checked bag', maxWeightKg: 23, price: 40, currency: 'GBP', sourceUrl: 'https://www.britishairways.com/content/information/baggage-essentials', checkedAt: '2026-09-28' }], votes: { conor: 'acceptable' } },
      { id: 'easyjet-brs-return', mode: 'flight', status: 'shortlisted', title: 'Geneva to Bristol', operator: 'easyJet', origin: 'Geneva Airport', destination: 'Bristol', departureAt: '2027-01-16T11:20', arrivalAt: '2027-01-16T12:15', participantIds: ['hanah'], pricePerPerson: 102, currency: 'GBP', bookingUrl: 'https://www.easyjet.com/', baggageRules: [{ label: 'Sports equipment', maxWeightKg: 20, price: 42, currency: 'GBP', sourceUrl: 'https://www.easyjet.com/en/help/baggage/sports-equipment', checkedAt: '2026-09-28' }], votes: { hanah: 'first-choice' } },
      { id: 'ryanair-stn-return', mode: 'flight', status: 'shortlisted', title: 'Turin to Stansted', operator: 'Ryanair', serviceNumber: 'FR 465', origin: 'Turin Airport', destination: 'London Stansted', departureAt: '2027-01-16T11:20', arrivalAt: '2027-01-16T12:15', participantIds: ['oliver', 'jacob', 'alex'], pricePerPerson: 128, currency: 'GBP', bookingUrl: 'https://www.ryanair.com/', baggageRules: [{ label: '20 kg checked bag', maxWeightKg: 20, price: 60, currency: 'GBP', sourceUrl: 'https://help.ryanair.com/hc/en-gb/categories/12489112419089-Bag-Rules', checkedAt: '2026-09-28' }, { label: 'Sports equipment', maxWeightKg: 20, price: 45, currency: 'GBP', sourceUrl: 'https://help.ryanair.com/hc/en-gb/categories/12489112419089-Bag-Rules', checkedAt: '2026-09-28' }], votes: { oliver: 'first-choice', jacob: 'first-choice', alex: 'acceptable' } },
    ],
    accommodationOptions: [
      { id: 'cristal', status: 'shortlisted', name: 'Cristal Lodge', platform: 'Direct', sourceUrl: 'https://www.terresens-hr.co.uk/', location: 'La Salle-les-Alpes', priceTotal: 1126.18, currency: 'GBP', checkIn: '2027-01-09', checkOut: '2027-01-16', walkToPrimarySiteMinutes: 6, siteDistances: [{ site: 'Aravet lift', minutes: 6 }, { site: 'Supermarket', minutes: 9 }, { site: 'Ski school', minutes: 7 }], rooms: [{ id: 'c1', name: 'Bedroom 1', private: true, beds: [{ id: 'cb1', type: 'double', sleeps: 2 }] }, { id: 'c2', name: 'Bedroom 2', private: true, beds: [{ id: 'cb2', type: 'single', sleeps: 1 }, { id: 'cb3', type: 'single', sleeps: 1 }] }, { id: 'c3', name: 'Bedroom 3', private: true, beds: [{ id: 'cb4', type: 'single', sleeps: 1 }] }], votes: { oliver: 'first-choice', alex: 'first-choice', hanah: 'acceptable' }, fitSummary: 'Five sleeping spaces, including a double for Adam and Eve.', fitLevel: 'good' },
      { id: 'meleze', status: 'shortlisted', name: 'Chalet Mélèze', platform: 'Airbnb', sourceUrl: 'https://www.airbnb.co.uk/', location: 'Briançon', priceTotal: 920, currency: 'GBP', checkIn: '2027-01-09', checkOut: '2027-01-16', walkToPrimarySiteMinutes: 18, siteDistances: [{ site: 'Prorel lift', minutes: 18 }, { site: 'Old town', minutes: 5 }], rooms: [{ id: 'm1', name: 'Bedroom 1', private: true, beds: [{ id: 'mb1', type: 'double', sleeps: 2 }] }, { id: 'm2', name: 'Bedroom 2', private: true, beds: [{ id: 'mb2', type: 'double', sleeps: 2 }] }, { id: 'm3', name: 'Living room', private: false, beds: [{ id: 'mb3', type: 'sofa-bed', sleeps: 1 }] }], votes: { conor: 'unacceptable', hanah: 'acceptable' }, fitSummary: 'Fits five only if one person uses the living-room sofa bed.', fitLevel: 'compromise' },
      { id: 'aigle', status: 'shortlisted', name: 'Résidence Aigle Bleu', platform: 'Booking.com', sourceUrl: 'https://www.booking.com/', location: 'Briançon', priceTotal: 1390, currency: 'GBP', checkIn: '2027-01-09', checkOut: '2027-01-16', walkToPrimarySiteMinutes: 11, siteDistances: [{ site: 'Prorel lift', minutes: 11 }, { site: 'Train station', minutes: 14 }, { site: 'Supermarket', minutes: 4 }], rooms: [{ id: 'a1', name: 'Bedroom 1', private: true, beds: [{ id: 'ab1', type: 'double', sleeps: 2 }] }, { id: 'a2', name: 'Bedroom 2', private: true, beds: [{ id: 'ab2', type: 'single', sleeps: 1 }] }, { id: 'a3', name: 'Bedroom 3', private: true, beds: [{ id: 'ab3', type: 'single', sleeps: 1 }] }, { id: 'a4', name: 'Bedroom 4', private: true, beds: [{ id: 'ab4', type: 'single', sleeps: 1 }] }], votes: { conor: 'first-choice', jacob: 'first-choice', oliver: 'acceptable' }, fitSummary: 'Everyone has a bed, including a double for Adam and Eve.', fitLevel: 'good' },
    ],
    activities: [
      { id: 'activity-1', status: 'shortlisted', name: 'Après-ski at La Grotte', category: 'Après-ski', location: 'Villeneuve, Serre Chevalier', locationCoordinates: { latitude: 44.9419, longitude: 6.5592 }, date: '2027-01-10', time: '16:30', costPerPerson: 18, currency: 'EUR', votes: { oliver: 'acceptable', alex: 'first-choice', hanah: 'acceptable', jacob: 'first-choice' } },
      { id: 'activity-2', status: 'idea', name: 'Group dinner', category: 'Food', location: 'La Salle-les-Alpes', locationCoordinates: { latitude: 44.9447, longitude: 6.5717 }, date: '2027-01-12', time: '20:00', costPerPerson: 35, currency: 'EUR', votes: { hanah: 'first-choice', conor: 'acceptable' } },
    ],
  };
  trip.destinationCoordinates = { latitude: 44.9447, longitude: 6.5717 };
  const coordinatesByLocation = {
    'Bristol Airport': { latitude: 51.3827, longitude: -2.7191 },
    'Geneva Airport': { latitude: 46.2381, longitude: 6.109 },
    'Serre Chevalier': { latitude: 44.9447, longitude: 6.5717 },
    'London Gatwick': { latitude: 51.1537, longitude: -0.1821 },
    'Turin Airport': { latitude: 45.2008, longitude: 7.6497 },
    'London Stansted': { latitude: 51.886, longitude: 0.2389 },
  } as const;
  trip.transportOptions.forEach(option => {
    if (option.origin === 'Bristol') option.origin = 'Bristol Airport';
    if (option.destination === 'Bristol') option.destination = 'Bristol Airport';
    option.originCoordinates = coordinatesByLocation[option.origin as keyof typeof coordinatesByLocation];
    option.destinationCoordinates = coordinatesByLocation[option.destination as keyof typeof coordinatesByLocation];
  });
  const stayCoordinates = {
    'La Salle-les-Alpes': { latitude: 44.9447, longitude: 6.5717 },
    'Briançon': { latitude: 44.8994, longitude: 6.6433 },
  } as const;
  trip.accommodationOptions.forEach(option => {
    option.locationCoordinates = stayCoordinates[option.location as keyof typeof stayCoordinates];
  });
  trip.stage = 'booked';
  trip.preferredDateRange = structuredClone(trip.dateRange);
  trip.participants.forEach(person => { person.confirmed = true; });
  const bookedTransportReferences: Record<string, string> = {
    'ryanair-stn': 'DEMO-FR464',
    'ba-lgw': 'DEMO-BA2576',
    'easyjet-brs': 'DEMO-EZY6142',
    'man-train': 'DEMO-AWC603',
    'ba-lhr': 'DEMO-BA2594',
    'geneva-outbound-transfer': 'DEMO-GVA-OUT',
    'alps-transfer': 'DEMO-ALPS-OUT',
    'turin-return-transfer': 'DEMO-ALPS-IN',
    'geneva-return-transfer': 'DEMO-GVA-IN',
    'ba-lgw-return': 'DEMO-BA2577',
    'easyjet-brs-return': 'DEMO-EZY6143',
    'ryanair-stn-return': 'DEMO-FR465',
    'ba-lhr-return': 'DEMO-BA2595',
    'man-train-return': 'DEMO-AWC1513',
  };
  trip.transportOptions.forEach(option => {
    option.status = 'booked';
    option.bookingReference = bookedTransportReferences[option.id];
    option.participantIds.forEach(participantId => { option.votes[participantId] ??= 'acceptable'; });
  });
  trip.accommodationOptions[0].status = 'booked';
  trip.accommodationOptions[0].bookingReference = 'DEMO-CRISTAL';
  trip.accommodationOptions.forEach(option => { option.participantIds = people.map(person => person.id); });
  trip.accommodationOptions.forEach(option => {
    option.participantIds?.forEach(participantId => { option.votes[participantId] ??= 'acceptable'; });
  });
  trip.activities.forEach(activity => { activity.status = 'booked'; });
  trip.activities[0].participantIds = ['oliver', 'alex', 'hanah', 'jacob'];
  trip.activities[1].participantIds = people.map(person => person.id);
  trip.activities.forEach(option => {
    option.participantIds?.forEach(participantId => { option.votes[participantId] ??= 'acceptable'; });
  });
  return trip;
}
