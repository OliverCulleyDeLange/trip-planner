import { ApiTripRepository, RevisionConflictError } from '../../lib/trip-planner/api-repository';
import type {
  AccommodationOption, ActivityOption, AvailabilitySlot, AvailabilityStatus, BedType, BaggageItem, GeoCoordinates, Participant,
  Room, TransportMode, TransportOption, Trip, TripExport, TripSession, VoteValue,
} from '../../lib/trip-planner/types';

type View = 'overview' | 'people' | 'availability' | 'transport' | 'stays' | 'activities';

const repository = new ApiTripRepository();
let trip: Trip | undefined;
let session: TripSession | undefined;
let activeView: View = 'overview';
let itineraryPersonId = '';
let toastTimer = 0;
let setupCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let setupDraftStart: string | undefined;
let setupRanges: { id: string; start: string; end: string }[] = [];
let activeDateInput: HTMLInputElement | undefined;
let pickerMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const colours = ['#8cc5a0', '#e4bd88', '#8fb2dc', '#d99da2', '#b7c982', '#b59acb', '#83c6bf'];

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const formValue = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? '');
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character]!);
const money = (value: number, currency: 'GBP' | 'EUR' = 'GBP') => new Intl.NumberFormat('en-GB', {
  style: 'currency', currency, maximumFractionDigits: value % 1 ? 2 : 0,
}).format(value);
const date = (value: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat('en-GB', options).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
const dateOr = (value: string | undefined, fallback = 'Date not set', options?: Intl.DateTimeFormatOptions) => value ? date(value, options) : fallback;
const range = (start: string, end: string) => {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last && dates.length < 93) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};
const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const iconForMode: Record<TransportMode, string> = { flight: '✈', train: '🚆', coach: '🚌', car: '🚗', ferry: '⛴' };
const routeColourForMode: Record<TransportMode, string> = { flight: '#3478c9', train: '#7b5fc7', coach: '#d97706', car: '#397354', ferry: '#168a92' };
const modeLabel: Record<TransportMode, string> = { flight: 'Flight', train: 'Train', coach: 'Coach', car: 'Car', ferry: 'Ferry' };
type MapPoint = string | { id?: string; location: string; label?: string; colour?: string; coupleWith?: string; latitude?: number; longitude?: number };
type MapRoute = { mode: TransportMode; from: Exclude<MapPoint, string>; to: Exclude<MapPoint, string> };
type JourneyMap = { label: string; detail: string; locations: MapPoint[]; routes?: MapRoute[]; sensitive?: boolean };
const geocodingAvailable = true;
const locationAutocompleteTimers = new WeakMap<HTMLInputElement, number>();
const locationAutocompleteControllers = new WeakMap<HTMLInputElement, AbortController>();

function coordinatesFromForm(data: FormData, name: string): GeoCoordinates | undefined {
  const latitudeValue = String(data.get(`${name}Latitude`) ?? '');
  const longitudeValue = String(data.get(`${name}Longitude`) ?? '');
  const latitude = Number(latitudeValue); const longitude = Number(longitudeValue);
  return latitudeValue && longitudeValue && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : undefined;
}

function setLocationInput(input: HTMLInputElement, value = '', coordinates?: GeoCoordinates): void {
  const field = input.closest<HTMLElement>('.tp-location-field');
  input.value = value;
  input.dataset.selectedLocation = coordinates ? value : '';
  input.setAttribute('aria-expanded', 'false');
  const latitude = field?.querySelector<HTMLInputElement>('[data-location-lat]');
  const longitude = field?.querySelector<HTMLInputElement>('[data-location-lon]');
  if (latitude) latitude.value = coordinates?.latitude.toString() ?? '';
  if (longitude) longitude.value = coordinates?.longitude.toString() ?? '';
  const suggestions = field?.querySelector<HTMLElement>('.tp-location-suggestions');
  if (suggestions) { suggestions.hidden = true; suggestions.innerHTML = ''; }
  const help = field?.querySelector<HTMLElement>('.tp-location-help');
  if (help) help.textContent = coordinates ? 'Location selected and ready for the map.' : 'Select a suggestion to save this location to the map.';
}

function setLocationField(form: HTMLFormElement, name: string, value = '', coordinates?: GeoCoordinates): void {
  const input = form.elements.namedItem(name) as HTMLInputElement | null;
  if (input instanceof HTMLInputElement) setLocationInput(input, value, coordinates);
}

function validateForm(form: HTMLFormElement): boolean {
  form.querySelectorAll('.tp-field-error').forEach(error => error.remove());
  let firstInvalid: HTMLElement | undefined;
  form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach(control => {
    if (control.type === 'hidden' && !control.classList.contains('tp-native-date')) return;
    if (control.closest<HTMLElement>('[hidden]')) return;
    let message = '';
    if (control.required && !control.value.trim()) message = 'This field is required.';
    else if (control.value && control.validity.typeMismatch) message = control.type === 'url' ? 'Enter a complete URL, including https://.' : 'Enter a valid value.';
    else if (control.value && (control.validity.rangeUnderflow || control.validity.badInput)) message = 'Enter a valid value.';
    if (!message) return;
    const label = control.closest('label');
    if (!label) return;
    const error = document.createElement('small');
    error.className = 'tp-field-error'; error.textContent = message;
    label.append(error);
    firstInvalid ??= label;
  });
  firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return !firstInvalid;
}

function enhanceForms(): void {
  document.querySelectorAll<HTMLFormElement>('.trip-planner form').forEach(form => {
    form.noValidate = true;
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[required]').forEach(control => {
      const title = control.closest('label')?.querySelector<HTMLElement>(':scope > span');
      if (title && !title.querySelector('.tp-required')) title.insertAdjacentHTML('beforeend', '<b class="tp-required" aria-hidden="true"> *</b>');
    });
  });
  document.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach((input, index) => {
    if (input.classList.contains('tp-native-date')) return;
    input.classList.add('tp-native-date');
    input.id ||= `tp-friendly-date-${index}`;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'tp-friendly-date'; button.dataset.dateFor = input.id;
    input.insertAdjacentElement('afterend', button);
  });
  syncDateButtons();
}

function syncDateButtons(scope: ParentNode = document): void {
  scope.querySelectorAll<HTMLInputElement>('.tp-native-date').forEach(input => {
    const button = document.querySelector<HTMLButtonElement>(`[data-date-for="${input.id}"]`);
    if (!button) return;
    button.textContent = input.value ? date(input.value, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : 'Choose date';
    button.classList.toggle('is-empty', !input.value);
  });
}

function renderSingleMonthPicker(): void {
  const year = pickerMonth.getFullYear(); const month = pickerMonth.getMonth();
  const blankDays = (pickerMonth.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  $('#tp-picker-month').textContent = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(pickerMonth);
  $('#tp-single-month').innerHTML = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `<span class="tp-setup-weekday">${day}</span>`).join('') + Array.from({ length: blankDays }, () => '<span></span>').join('') + Array.from({ length: count }, (_, index) => {
    const value = dateKey(new Date(year, month, index + 1));
    return `<button type="button" data-picker-date="${value}" class="${activeDateInput?.value === value ? 'is-selected' : ''}" aria-label="${date(value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}">${index + 1}</button>`;
  }).join('');
}

function openDatePicker(input: HTMLInputElement): void {
  activeDateInput = input;
  const initial = input.value ? new Date(`${input.value}T12:00:00`) : new Date();
  pickerMonth = new Date(initial.getFullYear(), initial.getMonth(), 1);
  renderSingleMonthPicker();
  $<HTMLDialogElement>('#tp-date-picker-dialog').showModal();
}

function updateTransportFields(): void {
  const form = $<HTMLFormElement>('#tp-transport-form');
  const mode = (form.elements.namedItem('mode') as HTMLSelectElement).value;
  form.querySelectorAll<HTMLElement>('[data-transport-modes]').forEach(field => { field.hidden = !field.dataset.transportModes!.split(' ').includes(mode); });
}

function renderSetupCalendar(): void {
  const calendar = document.querySelector<HTMLElement>('#tp-setup-calendar');
  if (!calendar) return;
  const today = new Date();
  const todayKey = dateKey(today);
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const monthHtml = (offset: number) => {
    const month = new Date(setupCalendarMonth.getFullYear(), setupCalendarMonth.getMonth() + offset, 1);
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const blankDays = (month.getDay() + 6) % 7;
    const dayCount = new Date(year, monthIndex + 1, 0).getDate();
    const blanks = Array.from({ length: blankDays }, () => '<span></span>').join('');
    const days = Array.from({ length: dayCount }, (_, index) => {
      const value = dateKey(new Date(year, monthIndex, index + 1));
      const starts = setupRanges.some(candidate => candidate.start === value);
      const ends = setupRanges.some(candidate => candidate.end === value);
      const inside = setupRanges.some(candidate => value > candidate.start && value < candidate.end);
      const classes = [starts ? 'range-start' : '', ends ? 'range-end' : '', inside ? 'in-range' : '', setupDraftStart === value ? 'is-draft' : '', value === todayKey ? 'is-today' : ''].filter(Boolean).join(' ');
      const selected = starts || ends || inside || setupDraftStart === value;
      return `<button class="tp-setup-day ${classes}" type="button" data-setup-date="${value}" aria-label="${date(value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}" aria-pressed="${selected}" ${value < todayKey ? 'disabled' : ''}><span>${index + 1}</span></button>`;
    }).join('');
    return `<section class="tp-setup-month"><h2>${new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(month)}</h2><div class="tp-setup-month-grid">${weekdays.map(day => `<span class="tp-setup-weekday">${day}</span>`).join('')}${blanks}${days}</div></section>`;
  };
  calendar.innerHTML = monthHtml(0) + monthHtml(1);
  const ranges = $('#tp-setup-ranges');
  ranges.innerHTML = setupRanges.map((candidate, index) => `<span class="tp-setup-range-chip">${date(candidate.start)}–${date(candidate.end, { day: 'numeric', month: 'short', year: 'numeric' })}<button type="button" data-remove-setup-range="${candidate.id}" aria-label="Remove date option ${index + 1}">×</button></span>`).join('');
  $('#tp-setup-calendar-prompt').textContent = setupDraftStart ? `Select an end date for ${date(setupDraftStart, { day: 'numeric', month: 'long' })}` : setupRanges.length ? 'Select another start date or create the trip' : 'Select a start date';
  const submit = document.querySelector<HTMLButtonElement>('#tp-access-form button[type="submit"]');
  if (submit) submit.disabled = setupRanges.length === 0;
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const previous = document.querySelector<HTMLButtonElement>('#tp-setup-prev-month');
  if (previous) previous.disabled = setupCalendarMonth <= currentMonth;
}

function selectSetupDate(value: string): void {
  if (!setupDraftStart) {
    setupDraftStart = value;
  } else {
    const start = value < setupDraftStart ? value : setupDraftStart;
    const end = value < setupDraftStart ? setupDraftStart : value;
    setupRanges.push({ id: `setup-${crypto.randomUUID()}`, start, end });
    setupRanges.sort((a, b) => a.start.localeCompare(b.start));
    setupDraftStart = undefined;
  }
  renderSetupCalendar();
}

function avatar(person: Participant, label = true): string {
  return `<span class="tp-avatar-wrap" title="${escapeHtml(person.name)}"><span class="tp-avatar" style="--person:${person.colour}">${escapeHtml(person.initials)}</span>${label ? `<span>${escapeHtml(person.name)}</span>` : ''}</span>`;
}

function showToast(message: string): void {
  const element = $('#tp-toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { element.hidden = true; }, 2600);
}

async function mutate(action: () => Promise<Trip>, message: string): Promise<void> {
  try {
    $('#tp-saving').textContent = 'Saving…';
    trip = await action();
    render();
    showToast(message);
  } catch (error) {
    if (error instanceof RevisionConflictError && trip) {
      trip = await repository.getTrip(trip.id);
      render();
    }
    showToast(error instanceof Error ? error.message : 'Something went wrong.');
  } finally {
    $('#tp-saving').textContent = '';
  }
}

function sectionHeading(eyebrow: string, heading: string, description: string, action = ''): string {
  return `<div class="tp-section-heading"><div>${eyebrow ? `<p class="tp-eyebrow">${eyebrow}</p>` : ''}<h1>${heading}</h1>${description ? `<p>${description}</p>` : ''}</div>${action}</div>`;
}

function emptyState(icon: string, heading: string, copy: string, button: string, action: string): string {
  return `<section class="tp-empty"><span class="tp-empty-icon">${icon}</span><h2>${heading}</h2><p>${copy}</p><button class="tp-button tp-button-primary" ${action}>${button}</button></section>`;
}

function renderMapPanel(title: string, maps: JourneyMap[]): string {
  if (!maps.length) return '';
  const encoded = (value: unknown) => encodeURIComponent(JSON.stringify(value));
  const modes = [...new Set(maps.flatMap(map => map.routes?.map(route => route.mode) ?? []))];
  const legend = modes.length ? `<div class="tp-map-legend" aria-label="Transport colours">${modes.map(mode => `<span style="--route:${routeColourForMode[mode]}"><i></i>${iconForMode[mode]} ${modeLabel[mode]}</span>`).join('')}</div>` : '';
  return `<section class="tp-map-panel" data-map-panel><div class="tp-panel-head"><div><h2>${escapeHtml(title)}</h2><p class="tp-map-detail">${escapeHtml(maps[0].detail)}</p></div></div><div class="tp-map-canvas" role="region" aria-label="${escapeHtml(title)}" data-map-sensitive="${Boolean(maps[0].sensitive)}" data-map-locations="${encoded(maps[0].locations)}" data-map-routes="${encoded(maps[0].routes ?? [])}"><p class="tp-map-loading">Loading map…</p></div>${legend}<div class="tp-map-switcher">${maps.map((map, index) => `<button class="${index === 0 ? 'active' : ''}" data-map-locations="${encoded(map.locations)}" data-map-routes="${encoded(map.routes ?? [])}" data-map-sensitive="${Boolean(map.sensitive)}" data-map-detail="${escapeHtml(map.detail)}">${escapeHtml(map.label)}</button>`).join('')}</div><a class="tp-geocoder-attribution" href="https://www.geoapify.com/" target="_blank" rel="noopener">Address search by Geoapify</a></section>`;
}

function renderAddressMap(people: Participant[]): string {
  const mappedPeople = people.filter(person => person.origin.trim());
  if (!mappedPeople.length) return '';
  const storageKey = `trip-planner:address-map-hidden:${trip!.id}`;
  let hiddenIds: string[] = [];
  try { hiddenIds = JSON.parse(localStorage.getItem(storageKey) ?? '[]'); } catch { hiddenIds = []; }
  const points = mappedPeople.map(person => {
    const linkedPartner = people.find(candidate => candidate.id === person.sleepingPreferences.shareDoubleWithParticipantId)
      ?? people.find(candidate => candidate.sleepingPreferences.shareDoubleWithParticipantId === person.id);
    const sameAddressPartner = linkedPartner && linkedPartner.origin.trim().toLowerCase() === person.origin.trim().toLowerCase() ? linkedPartner.id : undefined;
    return { id: person.id, location: person.origin, label: person.name, colour: person.colour, coupleWith: sameAddressPartner, latitude: person.originCoordinates?.latitude, longitude: person.originCoordinates?.longitude };
  });
  const visiblePoints = points.filter(point => !hiddenIds.includes(point.id));
  const encoded = (value: unknown) => encodeURIComponent(JSON.stringify(value));
  return `<section class="tp-map-panel tp-address-map" data-map-panel data-address-map data-map-storage-key="${escapeHtml(storageKey)}"><div class="tp-panel-head"><div><h2>Address map</h2><p class="tp-map-detail">${visiblePoints.length}/${points.length} people shown</p></div></div><div class="tp-map-canvas" role="region" aria-label="Address map" data-map-connect="false" data-map-sensitive="true" data-map-locations="${encoded(visiblePoints)}"><p class="tp-map-loading">Loading map…</p></div><div class="tp-map-switcher tp-person-map-toggles">${points.map(point => `<button class="${hiddenIds.includes(point.id) ? '' : 'active'}" type="button" style="--person:${point.colour}" data-map-person-id="${escapeHtml(point.id)}" data-map-person-point="${encoded(point)}" aria-pressed="${!hiddenIds.includes(point.id)}"><i></i>${escapeHtml(point.label!)}</button>`).join('')}</div><a class="tp-geocoder-attribution" href="https://www.geoapify.com/" target="_blank" rel="noopener">Address search by Geoapify</a></section>`;
}

function renderOverview(): string {
  const people = trip!.participants;
  if (itineraryPersonId && !people.some(person => person.id === itineraryPersonId)) itineraryPersonId = '';
  const availabilityDone = people.filter(person => trip!.availability.some(entry => entry.participantId === person.id && entry.status === 'available')).length;
  const pollOptionsReady = trip!.transportOptions.length > 0 && trip!.accommodationOptions.length > 0;
  const voterDone = people.filter(person => (
    trip!.transportOptions.every(option => Boolean(option.votes[person.id])) &&
    trip!.accommodationOptions.every(option => Boolean(option.votes[person.id]))
  )).length;
  const selectedTransport = trip!.transportOptions.filter(option => option.status === 'selected');
  const selectedStay = trip!.accommodationOptions.find(option => option.status === 'selected');
  const selectedActivities = trip!.activities.filter(option => option.status === 'selected');
  const itineraryTransport = selectedTransport.length ? selectedTransport : trip!.transportOptions;
  const itineraryStays = selectedStay ? [selectedStay] : trip!.accommodationOptions;
  const itineraryActivities = selectedActivities.length ? selectedActivities : trip!.activities;
  const selectedItems = [...selectedTransport, ...(selectedStay ? [selectedStay] : [])];
  const booked = selectedItems.filter(option => Boolean(option.bookingReference?.trim())).length;
  const datesLabel = trip!.preferredDateRange
    ? `${date(trip!.preferredDateRange.start, { day: 'numeric', month: 'long' })}–${date(trip!.preferredDateRange.end, { day: 'numeric', month: 'long', year: 'numeric' })}`
    : `${trip!.availabilityRanges.length} candidate date range${trip!.availabilityRanges.length === 1 ? '' : 's'}`;
  const stages = [
    { title: 'Potential dates', detail: `${trip!.availabilityRanges.length} range${trip!.availabilityRanges.length === 1 ? '' : 's'} set`, done: trip!.availabilityRanges.length > 0, view: 'availability' },
    { title: 'Availability poll', detail: `${availabilityDone}/${people.length} people completed`, done: people.length > 0 && availabilityDone === people.length, view: 'availability' },
    { title: 'Preferred dates', detail: trip!.preferredDateRange ? datesLabel : 'Not selected', done: Boolean(trip!.preferredDateRange), view: 'availability' },
    { title: 'Transport and accommodation options', detail: `${trip!.transportOptions.length} transport · ${trip!.accommodationOptions.length} stays`, done: trip!.transportOptions.length > 0 && trip!.accommodationOptions.length > 0, view: 'transport' },
    { title: 'Transport and accommodation poll', detail: pollOptionsReady ? `${voterDone}/${people.length} people voted` : 'Add transport and stays first', done: people.length > 0 && voterDone === people.length && pollOptionsReady, view: 'transport' },
    { title: 'Preferred transport and accommodation', detail: `${selectedTransport.length} transport selected · ${selectedStay ? selectedStay.name : 'no stay selected'}`, done: selectedTransport.length > 0 && Boolean(selectedStay), view: 'transport' },
    { title: 'Booked!', detail: selectedItems.length ? `${booked}/${selectedItems.length} booking references added` : 'No selected bookings', done: selectedItems.length > 1 && booked === selectedItems.length, view: 'transport' },
  ];
  const returnStart = itineraryStays.map(option => option.checkOut).filter(Boolean).sort()[0]
    ?? trip!.preferredDateRange?.end
    ?? trip!.dateRange.end;
  const visibleItineraryTransport = itineraryPersonId ? itineraryTransport.filter(option => option.participantIds.includes(itineraryPersonId)) : itineraryTransport;
  const transportItems = visibleItineraryTransport.map(option => ({ when: option.departureAt, sortWhen: option.departureAt, icon: iconForMode[option.mode], title: option.title, detail: [option.status !== 'selected' ? 'Option' : '', [option.origin, option.destination].filter(Boolean).join(' → ')].filter(Boolean).join(' · '), editAttribute: `data-edit-transport="${option.id}"` }));
  const accommodationItems = itineraryStays.map(option => ({ when: option.checkIn, sortWhen: option.checkIn, icon: '🏠', title: option.name, detail: [option.status !== 'selected' ? 'Option' : '', option.location].filter(Boolean).join(' · '), editAttribute: `data-edit-stay="${option.id}"` }));
  const activityItems = itineraryActivities.map(option => ({ when: option.date ? `${option.date}T${option.time || '12:00'}` : '', sortWhen: option.date ? `${option.date}T${option.time || '12:00'}` : '', icon: '✦', title: option.name, detail: [option.status !== 'selected' ? 'Option' : '', option.location || option.category || ''].filter(Boolean).join(' · '), editAttribute: `data-edit-activity="${option.id}"` }));
  const itineraryGroups = [
    { title: 'Journey there', empty: 'No outbound travel added yet.', items: transportItems.filter(item => !item.when || item.when.slice(0, 10) < returnStart) },
    { title: 'Accommodation', empty: 'No accommodation added yet.', items: accommodationItems },
    { title: 'Activities', empty: 'No activities added yet.', items: activityItems },
    { title: 'Journey back', empty: 'No return travel added yet.', items: transportItems.filter(item => item.when && item.when.slice(0, 10) >= returnStart) },
  ];
  itineraryGroups.forEach(group => group.items.sort((a, b) => (a.sortWhen || '9999').localeCompare(b.sortWhen || '9999')));
  const renderItineraryItem = (item: typeof transportItems[number]) => `<article><span>${item.icon}</span><time>${item.when ? date(item.when, { weekday: 'short', day: 'numeric', month: 'short', hour: item.when.includes('T') ? '2-digit' : undefined, minute: item.when.includes('T') ? '2-digit' : undefined }) : 'Date not set'}</time><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div><button class="tp-edit-button" type="button" ${item.editAttribute} aria-label="Edit ${escapeHtml(item.title)}">Edit</button></article>`;
  const itineraryContent = itineraryGroups.map(group => `<section class="tp-itinerary-group"><h3>${group.title}</h3>${group.items.length ? `<div>${group.items.map(renderItineraryItem).join('')}</div>` : `<p>${group.empty}</p>`}</section>`).join('');
  const itineraryFilters = `<div class="tp-itinerary-filter" aria-label="Filter itinerary by traveller"><button class="${itineraryPersonId ? '' : 'active'}" data-itinerary-person="" aria-pressed="${!itineraryPersonId}">Everyone</button>${people.map(person => `<button class="${itineraryPersonId === person.id ? 'active' : ''}" style="--person:${person.colour}" data-itinerary-person="${person.id}" aria-pressed="${itineraryPersonId === person.id}"><i></i>${escapeHtml(person.name)}</button>`).join('')}</div>`;
  const mapPoint = (location: string | undefined, coordinates?: GeoCoordinates): Exclude<MapPoint, string> | undefined => location?.trim() ? { location: location.trim(), latitude: coordinates?.latitude, longitude: coordinates?.longitude } : undefined;
  const mappedRoutes = itineraryTransport.flatMap(option => {
    const from = mapPoint(option.origin, option.originCoordinates);
    const to = mapPoint(option.destination, option.destinationCoordinates);
    return from && to ? [{ departureAt: option.departureAt, route: { mode: option.mode, from, to } satisfies MapRoute }] : [];
  }).sort((a, b) => (a.departureAt || '9999').localeCompare(b.departureAt || '9999'));
  const transportRoutes = mappedRoutes.map(item => item.route);
  const outboundRoutes = mappedRoutes.filter(item => !item.departureAt || item.departureAt.slice(0, 10) < returnStart).map(item => item.route);
  const inboundRoutes = mappedRoutes.filter(item => item.departureAt && item.departureAt.slice(0, 10) >= returnStart).map(item => item.route);
  const uniqueMapPoints = (points: Exclude<MapPoint, string>[]) => points.filter((point, index) => points.findIndex(candidate => candidate.location.toLowerCase() === point.location.toLowerCase()) === index);
  const routePoints = (routes: MapRoute[]) => uniqueMapPoints(routes.flatMap(route => [route.from, route.to]));
  const outboundLocations = routePoints(outboundRoutes);
  const inboundLocations = routePoints(inboundRoutes);
  const tripLocations = [
    ...transportRoutes.flatMap(route => [route.from, route.to]),
    ...itineraryStays.map(option => mapPoint(option.location, option.locationCoordinates)),
    ...itineraryActivities.map(option => mapPoint(option.location, option.locationCoordinates)),
  ].filter((point): point is Exclude<MapPoint, string> => Boolean(point));
  const uniqueTripLocations = uniqueMapPoints(tripLocations);
  const journeyMaps = [
    { label: 'Outbound', detail: outboundLocations.map(point => point.location).join(' → ') || 'No outbound journey added', locations: outboundLocations, routes: outboundRoutes },
    { label: 'Inbound', detail: inboundLocations.map(point => point.location).join(' → ') || 'No inbound journey added', locations: inboundLocations, routes: inboundRoutes },
    { label: 'Entire trip', detail: uniqueTripLocations.map(point => point.location).join(' → ') || 'No journey added', locations: uniqueTripLocations, routes: transportRoutes },
    ...people.flatMap(person => {
    if (!person.origin.trim()) return [];
    const routes = itineraryTransport
      .filter(option => option.participantIds.includes(person.id))
      .sort((a, b) => (a.departureAt || '9999').localeCompare(b.departureAt || '9999'));
    const personRoutes = routes.map(option => ({ mode: option.mode, from: mapPoint(option.origin, option.originCoordinates), to: mapPoint(option.destination, option.destinationCoordinates) })).filter((route): route is MapRoute => Boolean(route.from && route.to));
    const locations = [mapPoint(person.origin, person.originCoordinates), ...personRoutes.flatMap(route => [route.from, route.to])].filter((point): point is Exclude<MapPoint, string> => Boolean(point));
    const uniqueLocations = locations.filter((point, index) => locations.findIndex(candidate => candidate.location.toLowerCase() === point.location.toLowerCase()) === index);
    return [{ label: person.name, detail: uniqueLocations.map(point => point.location).join(' → '), locations: uniqueLocations, routes: personRoutes, sensitive: true }];
  }),
  ];
  return `${sectionHeading('', 'Overview', '')}<section class="tp-hero-card"><button class="tp-edit-button tp-hero-edit" id="tp-edit-trip" type="button">Edit</button><div><h1>${escapeHtml(trip!.title)}</h1><h2>${escapeHtml(trip!.destination)}</h2><p>${datesLabel}</p></div><div class="tp-avatar-stack">${people.map(person => avatar(person, false)).join('')}</div></section>
    <section class="tp-process"><h2>Trip progress</h2><div>${stages.map((stage, index) => `<button class="tp-process-item ${stage.done ? 'is-done' : ''}" data-view="${stage.view}"><span class="tp-process-check">${stage.done ? '✓' : index + 1}</span><span><strong>${escapeHtml(stage.title)}</strong><small>${escapeHtml(stage.detail)}</small></span><b>›</b></button>`).join('')}</div></section>
    <section class="tp-itinerary"><div class="tp-panel-head"><h2>Itinerary</h2></div>${itineraryFilters}<div class="tp-itinerary-groups">${itineraryContent}</div></section>${renderMapPanel('Journey map', journeyMaps)}`;
}

function renderPeople(): string {
  const people = trip!.participants;
  const paired = new Set<string>();
  const couples: [Participant, Participant][] = [];

  people.forEach(person => {
    if (paired.has(person.id)) return;
    const linkedId = person.sleepingPreferences.shareDoubleWithParticipantId;
    const partner = people.find(candidate => candidate.id === linkedId && candidate.id !== person.id && !paired.has(candidate.id))
      ?? people.find(candidate => candidate.id !== person.id && !paired.has(candidate.id) && candidate.sleepingPreferences.shareDoubleWithParticipantId === person.id);
    if (!partner) return;
    couples.push([person, partner]);
    paired.add(person.id);
    paired.add(partner.id);
  });

  const singles = people.filter(person => !paired.has(person.id));
  const personCard = (person: Participant) => {
    const roomPreferences = person.sleepingPreferences.roomPreferences;
    const roomPreference = roomPreferences.includes('require-own')
      ? 'Needs own room'
      : [roomPreferences.includes('happy-to-share') ? 'Happy to share' : '', roomPreferences.includes('prefer-own') ? 'would prefer own' : ''].filter(Boolean).join('; ') || 'Not specified';
    const linkedPartner = people.find(candidate => candidate.id === person.sleepingPreferences.shareDoubleWithParticipantId)
      ?? people.find(candidate => candidate.sleepingPreferences.shareDoubleWithParticipantId === person.id);
    const bedLabels: Record<string, string> = { 'own-bed': 'own bed', 'sofa-bed': 'sofa bed', 'share-anyone': 'share with anyone', 'share-women': 'share with women', 'share-men': 'share with men' };
    const selectedPeople = person.sleepingPreferences.shareWithParticipantIds.filter(id => id !== linkedPartner?.id).map(id => people.find(candidate => candidate.id === id)?.name).filter(Boolean);
    const bedPreference = [
      ...person.sleepingPreferences.bedPreferences.map(preference => bedLabels[preference]),
      ...(selectedPeople.length ? [`share with ${selectedPeople.join(', ')}`] : []),
      ...(linkedPartner ? [`partner: ${linkedPartner.name}`] : []),
    ].filter(Boolean).join('; ') || 'Not specified';
    return `<article class="tp-person-card"><div class="tp-person-title">${avatar(person)}<button class="tp-edit-button" data-edit-person="${person.id}">Edit</button></div><dl><div><dt>Address</dt><dd>${escapeHtml(person.origin || 'Not set')}</dd></div><div><dt>Room preference</dt><dd>${escapeHtml(roomPreference)}</dd></div><div><dt>Bed preference</dt><dd>${escapeHtml(bedPreference)}</dd></div></dl><div class="tp-bag-chips">${person.baggage.length ? person.baggage.map(item => `<span>${escapeHtml(item.label)}${item.weightKg ? ` · ${item.weightKg} kg` : ''}${item.lengthCm ? ` · ${[item.lengthCm, item.widthCm, item.heightCm].filter(Boolean).join('×')} cm` : ''}</span>`).join('') : '<span class="is-empty">No bags added</span>'}</div></article>`;
  };
  const groupHeading = (label: string, count: number) => `<div class="tp-people-group-title"><h2>${label}</h2><span>${count}</span></div>`;
  const couplesGroup = couples.length ? `<section class="tp-people-group">${groupHeading('Couples', couples.length)}<div class="tp-couples-grid">${couples.map(([first, second]) => `<div class="tp-couple-card">${personCard(first)}<span class="tp-couple-heart" aria-label="Couple">♥</span>${personCard(second)}</div>`).join('')}</div></section>` : '';
  const addPersonCard = '<button class="tp-add-person-card" id="tp-add-person"><span>+</span><strong>Add person</strong></button>';
  const singlesGroup = `<section class="tp-people-group">${groupHeading('Singles', singles.length)}<div class="tp-people-grid">${singles.map(personCard).join('')}${addPersonCard}</div></section>`;
  return `${sectionHeading('', 'People & bags', '')}${couplesGroup}${singlesGroup}${renderAddressMap(people)}`;
}

function statusFor(participantId: string, day: string, slot: AvailabilitySlot): AvailabilityStatus {
  return trip!.availability.find(entry => entry.participantId === participantId && entry.date === day && entry.slot === slot)?.status ?? 'unavailable';
}

function renderAvailability(): string {
  const isAvailable = (participantId: string, day: string) => statusFor(participantId, day, 'all-day') === 'available';
  const rangeControls = (candidate: Trip['availabilityRanges'][number], allowRemove: boolean) => {
    const preferred = trip!.preferredDateRange?.start === candidate.start && trip!.preferredDateRange?.end === candidate.end;
    return `<div class="tp-range-controls"><button class="tp-preferred-chip ${preferred ? 'is-selected' : ''}" data-prefer-range="${candidate.id}" aria-pressed="${preferred}" ${preferred ? 'disabled' : ''}>Preferred</button><button class="tp-range-icon" data-edit-range="${candidate.id}" aria-label="Edit date option" title="Edit">✎</button>${allowRemove ? `<button class="tp-range-icon tp-range-remove" data-remove-range="${candidate.id}" aria-label="Remove date option" title="Remove">×</button>` : ''}</div>`;
  };
  if (trip!.availabilityRanges.length > 1) {
    const rangeAvailable = (participantId: string, start: string, end: string) => trip!.availability.some(entry => entry.participantId === participantId && entry.status === 'available' && entry.date >= start && entry.date <= end);
    const options = trip!.availabilityRanges;
    const poll = `<section class="tp-panel tp-calendar-panel"><div class="tp-calendar-scroll"><div class="tp-range-poll" style="--options:${options.length + 1}"><div class="tp-calendar-corner">Traveller</div>${options.map((candidate, index) => { const everyone = trip!.participants.length > 0 && trip!.participants.every(person => rangeAvailable(person.id, candidate.start, candidate.end)); return `<div class="tp-range-option ${everyone ? 'all-available' : ''}"><small>Option ${index + 1}</small><div class="tp-option-dates"><time><span>Start</span><strong>${date(candidate.start, { day: 'numeric', month: 'short' })}</strong></time><i>→</i><time><span>End</span><strong>${date(candidate.end, { day: 'numeric', month: 'short' })}</strong></time></div>${everyone ? '<b>Everyone ✓</b>' : ''}${rangeControls(candidate, true)}</div>`; }).join('')}<div class="tp-calendar-add-option"><button class="tp-button tp-button-quiet" id="tp-add-range">+ Add date range</button></div>${trip!.participants.map(person => `<div class="tp-calendar-person">${avatar(person)}</div>${options.map(candidate => { const available = rangeAvailable(person.id, candidate.start, candidate.end); return `<button class="tp-availability-cell tp-binary-cell ${available ? 'available' : 'unavailable'}" data-range-start="${candidate.start}" data-range-end="${candidate.end}" data-person="${person.id}" aria-label="${escapeHtml(person.name)}: ${date(candidate.start)} to ${date(candidate.end)} — ${available ? 'available' : 'not available'}"><span>${available ? '✓' : ''}</span></button>`; }).join('')}<div class="tp-calendar-spacer"></div>`).join('')}<div class="tp-calendar-person tp-calendar-add-person"><button id="tp-add-person">+ Add person</button></div><div class="tp-calendar-row-tail" style="grid-column: span ${options.length + 1}"></div></div></div></section>`;
    return `${sectionHeading('', 'Availability', '')}${poll}`;
  }
  const calendars = trip!.availabilityRanges.map((candidate, rangeIndex) => {
    const candidateDays = range(candidate.start, candidate.end);
    const preferred = trip!.preferredDateRange?.start === candidate.start && trip!.preferredDateRange?.end === candidate.end;
    return `<section class="tp-range-section"><div class="tp-range-head"><div><p class="tp-eyebrow">Option ${rangeIndex + 1}${preferred ? ' · Preferred' : ''}</p><h2>${date(candidate.start, { day: 'numeric', month: 'long' })}–${date(candidate.end, { day: 'numeric', month: 'long', year: 'numeric' })}</h2></div><div>${rangeControls(candidate, trip!.availabilityRanges.length > 1)}<button class="tp-button tp-button-quiet" id="tp-add-range">+ Add date range</button></div></div><section class="tp-panel tp-calendar-panel"><div class="tp-calendar-scroll"><div class="tp-calendar" style="--days:${candidateDays.length}"><div class="tp-calendar-corner">Traveller</div>${candidateDays.map(day => { const everyone = trip!.participants.length > 0 && trip!.participants.every(person => isAvailable(person.id, day)); return `<div class="tp-day-head ${everyone ? 'all-available' : ''}"><span>${date(day, { weekday: 'short' })}</span><strong>${date(day, { day: 'numeric' })}</strong>${everyone ? '<b>Everyone ✓</b>' : ''}</div>`; }).join('')}${trip!.participants.map(person => `<div class="tp-calendar-person">${avatar(person)}</div>${candidateDays.map(day => { const available = isAvailable(person.id, day); return `<button class="tp-availability-cell tp-binary-cell ${available ? 'available' : 'unavailable'}" data-date="${day}" data-person="${person.id}" data-slot="all-day" aria-label="${escapeHtml(person.name)}: ${date(day)} — ${available ? 'available' : 'not available'}"><span>${available ? '✓' : ''}</span></button>`; }).join('')}`).join('')}<div class="tp-calendar-person tp-calendar-add-person"><button id="tp-add-person">+ Add person</button></div><div class="tp-calendar-row-tail" style="grid-column: span ${candidateDays.length}"></div></div></div></section></section>`;
  }).join('');
  return `${sectionHeading('', 'Availability', '')}${calendars}`;
}

function baggageRuleFor(option: TransportOption, item: BaggageItem) {
  if (item.category === 'personal' || item.category === 'cabin') return undefined;
  return option.baggageRules.find(rule => item.category === 'ski' || item.category === 'sports' ? /sport/i.test(rule.label) : /checked|bag/i.test(rule.label));
}

function renderTransport(): string {
  const options = [...trip!.transportOptions].sort((a, b) => a.departureAt.localeCompare(b.departureAt));
  const content = options.length ? `<div class="tp-timeline">${options.map(option => {
    const people = option.participantIds.map(id => trip!.participants.find(person => person.id === id)).filter((person): person is Participant => Boolean(person));
    const baggage = people.flatMap(person => person.baggage.map(item => ({ person, item, rule: baggageRuleFor(option, item) })));
    const baggageTotal = baggage.reduce((total, row) => total + (row.rule?.price ?? 0), 0);
    const ownVote = option.votes[session!.participantId];
    const route = option.origin || option.destination ? `<div class="tp-route"><div><strong>${option.departureAt ? date(option.departureAt, { hour: '2-digit', minute: '2-digit' }) : '—'}</strong><span>${escapeHtml(option.origin || 'From not added')}</span></div><i></i><div><strong>${option.arrivalAt ? date(option.arrivalAt, { hour: '2-digit', minute: '2-digit' }) : '—'}</strong><span>${escapeHtml(option.destination || 'To not added')}</span></div></div>` : '';
    return `<article class="tp-transport-card"><div class="tp-mode-icon">${iconForMode[option.mode]}</div><div class="tp-transport-main"><div class="tp-card-topline"><span class="tp-status-pill tp-status-${option.status}">${option.status}</span>${option.operator ? `<span>${escapeHtml(option.operator)}</span>` : ''}</div><p class="tp-transport-date">${dateOr(option.departureAt, 'Date not added', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p><h2>${escapeHtml(option.title)}</h2>${route}<div class="tp-avatar-stack">${people.map(person => avatar(person, false)).join('')}</div>${option.bookingReference ? `<p class="tp-booking-ref">Booking reference: <strong>${escapeHtml(option.bookingReference)}</strong></p>` : ''}</div><div class="tp-cost-box"><small>Per person</small><strong>${option.pricePerPerson ? money(option.pricePerPerson, option.currency) : '—'}</strong><span>${baggageTotal ? `+ ${money(baggageTotal / Math.max(people.length, 1), option.currency)} avg. bags` : option.pricePerPerson ? 'No paid bags matched' : 'Price not added'}</span><button class="tp-edit-button" data-edit-transport="${option.id}">Edit</button></div><div class="tp-option-poll"><div class="tp-vote-buttons"><button data-transport="${option.id}" data-transport-vote="first-choice" class="${ownVote === 'first-choice' ? 'active' : ''}">Love it</button><button data-transport="${option.id}" data-transport-vote="acceptable" class="${ownVote === 'acceptable' ? 'active' : ''}">Works</button><button data-transport="${option.id}" data-transport-vote="unacceptable" class="${ownVote === 'unacceptable' ? 'active' : ''}">No</button></div><button class="tp-button ${option.status === 'selected' ? 'tp-button-quiet' : 'tp-button-primary'}" data-select-transport="${option.id}">${option.status === 'selected' ? 'Unselect' : 'Select option'}</button></div>${option.mode === 'flight' ? `<details class="tp-baggage"><summary>Baggage comparison <span>${baggage.length} item${baggage.length === 1 ? '' : 's'}</span></summary><div class="tp-baggage-rows">${baggage.length ? baggage.map(row => `<div>${avatar(row.person)}<span>${escapeHtml(row.item.label)} · ${row.item.weightKg} kg</span><strong>${row.rule ? money(row.rule.price, row.rule.currency) : 'Included / check'}</strong></div>`).join('') : '<p>Add baggage on the People screen first.</p>'}</div>${option.baggageRules[0] ? `<div class="tp-sources"><a href="${option.baggageRules[0].sourceUrl}" target="_blank" rel="noopener">Official baggage rules ↗</a> · manually checked</div>` : ''}</details>` : ''}</article>`;
  }).join('')}</div>` : emptyState('✈', 'No routes yet', 'Add a flight, train, coach, car or ferry. Assign the people taking it and enter operator baggage prices.', 'Add first transport option', 'id="tp-add-transport"');
  return `${sectionHeading('', 'Transport', '', options.length ? '<button class="tp-button tp-button-primary" id="tp-add-transport">+ Add transport</button>' : '')}${content}`;
}

function countVotes(option: { votes: Record<string, VoteValue> }, vote: VoteValue): number { return Object.values(option.votes).filter(value => value === vote).length; }

function renderStays(): string {
  if (!trip!.accommodationOptions.length) return `${sectionHeading('', 'Stays', '')}${emptyState('🏠', 'No accommodation yet', 'Add a hotel, house, hostel, campsite or any other option.', 'Add first accommodation', 'id="tp-add-stay"')}`;
  return `${sectionHeading('', 'Stays', '', '<button class="tp-button tp-button-primary" id="tp-add-stay">+ Add accommodation</button>')}<div class="tp-stay-grid">${trip!.accommodationOptions.map(option => {
    const ownVote = option.votes[session!.participantId];
    const totalBeds = option.rooms.flatMap(room => room.beds).reduce((total, bed) => total + bed.sleeps, 0);
    return `<article class="tp-stay-card ${option.status === 'selected' ? 'is-selected' : ''}"><div class="tp-stay-image tp-stay-image-${option.fitLevel}"><span>${option.status === 'selected' ? 'Selected stay' : escapeHtml(option.platform || 'Accommodation')}</span><strong>${option.rooms.length}<small> room${option.rooms.length === 1 ? '' : 's'}</small></strong></div><div class="tp-stay-body"><div class="tp-panel-head"><div><h2>${escapeHtml(option.name)}</h2><p>${escapeHtml(option.location || 'Location not added')}</p></div><span class="tp-fit tp-fit-${option.fitLevel}">${option.fitLevel}</span></div><div class="tp-stay-facts"><span><strong>${option.rooms.length || '—'}</strong> rooms</span><span><strong>${totalBeds || '—'}</strong> spaces</span><span><strong>${option.priceTotal ? money(option.priceTotal / Math.max(trip!.participants.length, 1), option.currency) : '—'}</strong> per person</span></div><p class="tp-fit-copy">${escapeHtml(option.fitSummary)}</p>${option.bookingReference ? `<p class="tp-booking-ref">Booking reference: <strong>${escapeHtml(option.bookingReference)}</strong></p>` : ''}${option.siteDistances.length ? `<div class="tp-site-distances">${option.siteDistances.map(item => `<span>${escapeHtml(item.site)} <b>${item.minutes} min</b></span>`).join('')}</div>` : ''}${option.rooms.length ? `<details><summary>Room and bed details</summary><div class="tp-room-list">${option.rooms.map(room => `<div><strong>${escapeHtml(room.name)}</strong><span>${room.beds.map(bed => `${bed.type.replace('-', ' ')} (${bed.sleeps})`).join(', ') || 'Beds not added'}</span></div>`).join('')}</div></details>` : ''}<div class="tp-vote-summary"><span><b>♥</b> ${countVotes(option, 'first-choice')} first choice</span><span>${countVotes(option, 'acceptable')} okay</span><span>${countVotes(option, 'unacceptable')} no</span></div><div class="tp-vote-buttons" role="group" aria-label="Your vote for ${escapeHtml(option.name)}"><button data-accommodation="${option.id}" data-vote="first-choice" class="${ownVote === 'first-choice' ? 'active' : ''}">Love it</button><button data-accommodation="${option.id}" data-vote="acceptable" class="${ownVote === 'acceptable' ? 'active' : ''}">Works</button><button data-accommodation="${option.id}" data-vote="unacceptable" class="${ownVote === 'unacceptable' ? 'active' : ''}">No</button></div><div class="tp-stay-actions">${option.sourceUrl ? `<a href="${option.sourceUrl}" target="_blank" rel="noopener">Listing ↗</a>` : '<span></span>'}<button class="tp-edit-button" data-edit-stay="${option.id}">Edit</button><button class="tp-button tp-button-primary" data-select-stay="${option.id}" ${option.status === 'selected' ? 'disabled' : ''}>${option.status === 'selected' ? 'Selected' : 'Choose'}</button></div></div></article>`;
  }).join('')}</div>`;
}

function renderActivities(): string {
  if (!trip!.activities.length) return `${sectionHeading('', 'Activities', '')}${emptyState('✦', 'No activity ideas yet', 'Suggest anything the group could do, then vote together.', 'Add first activity', 'id="tp-add-activity"')}`;
  return `${sectionHeading('', 'Activities', '', '<button class="tp-button tp-button-primary" id="tp-add-activity">+ Add activity</button>')}<div class="tp-activity-grid">${trip!.activities.map(option => {
    const ownVote = option.votes[session!.participantId];
    return `<article class="tp-activity-card ${option.status === 'selected' ? 'is-selected' : ''}"><div class="tp-panel-head"><div><span class="tp-activity-category">${escapeHtml(option.category || 'Activity')}</span><h2>${escapeHtml(option.name)}</h2><p>${escapeHtml(option.location || 'Location not added')}</p></div><button class="tp-edit-button" data-edit-activity="${option.id}">Edit</button></div><div class="tp-activity-meta">${option.date ? `<span>📅 ${date(option.date, { weekday: 'short', day: 'numeric', month: 'short' })}${option.time ? ` · ${escapeHtml(option.time)}` : ''}</span>` : ''}${option.costPerPerson ? `<span>${money(option.costPerPerson, option.currency)} per person</span>` : ''}</div>${option.notes ? `<p>${escapeHtml(option.notes)}</p>` : ''}${option.sourceUrl ? `<a href="${option.sourceUrl}" target="_blank" rel="noopener">Open link ↗</a>` : ''}<div class="tp-vote-summary"><span><b>♥</b> ${countVotes(option, 'first-choice')}</span><span>${countVotes(option, 'acceptable')} okay</span><span>${countVotes(option, 'unacceptable')} no</span></div><div class="tp-vote-buttons"><button data-activity="${option.id}" data-activity-vote="first-choice" class="${ownVote === 'first-choice' ? 'active' : ''}">Love it</button><button data-activity="${option.id}" data-activity-vote="acceptable" class="${ownVote === 'acceptable' ? 'active' : ''}">Works</button><button data-activity="${option.id}" data-activity-vote="unacceptable" class="${ownVote === 'unacceptable' ? 'active' : ''}">No</button></div><button class="tp-button ${option.status === 'selected' ? 'tp-button-quiet' : 'tp-button-primary'}" data-select-activity="${option.id}">${option.status === 'selected' ? 'Remove from itinerary' : 'Add to itinerary'}</button></article>`;
  }).join('')}</div>`;
}

function render(): void {
  if (!trip || !session) return;
  $('#tp-title').textContent = trip.title;
  $('#tp-subtitle').textContent = `${date(trip.availabilityWindow.start)}–${date(trip.availabilityWindow.end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const views: Record<View, () => string> = { overview: renderOverview, people: renderPeople, availability: renderAvailability, transport: renderTransport, stays: renderStays, activities: renderActivities };
  $('#tp-content').innerHTML = views[activeView]();
  window.dispatchEvent(new CustomEvent('trip-planner:maps-rendered'));
  if (activeView === 'transport') document.querySelectorAll<HTMLButtonElement>('[data-edit-transport]').forEach(button => button.insertAdjacentHTML('afterend', `<button class="tp-danger-action" data-remove-transport="${button.dataset.editTransport}">Delete</button>`));
  if (activeView === 'activities') document.querySelectorAll<HTMLButtonElement>('[data-edit-activity]').forEach(button => button.insertAdjacentHTML('afterend', `<button class="tp-text-button tp-danger" data-remove-activity="${button.dataset.editActivity}">Delete</button>`));
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.setAttribute('aria-current', button.dataset.view === activeView ? 'page' : 'false'));
}

function setView(view: View): void { activeView = view; render(); $('#tp-content').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function closeDialogs(): void { document.querySelectorAll<HTMLDialogElement>('.tp-dialog[open]').forEach(dialog => dialog.close()); }

function openTripDialog(): void {
  const form = $('#tp-trip-form') as HTMLFormElement;
  (form.elements.namedItem('title') as HTMLInputElement).value = trip!.title;
  setLocationField(form, 'destination', trip!.destination, trip!.destinationCoordinates);
  (form.elements.namedItem('windowStart') as HTMLInputElement).value = trip!.availabilityWindow.start;
  (form.elements.namedItem('windowEnd') as HTMLInputElement).value = trip!.availabilityWindow.end;
  (form.elements.namedItem('tripStart') as HTMLInputElement).value = trip!.dateRange.start;
  (form.elements.namedItem('tripEnd') as HTMLInputElement).value = trip!.dateRange.end;
  syncDateButtons(form); form.querySelectorAll('.tp-field-error').forEach(error => error.remove());
  $<HTMLDialogElement>('#tp-trip-dialog').showModal();
}

function addBagRow(item?: BaggageItem): void {
  const category = item?.category === 'personal' ? 'carry-on' : item?.category === 'ski' ? 'sports' : item?.category ?? 'carry-on';
  const size = item?.lengthCm ? [item.lengthCm, item.widthCm, item.heightCm].filter(Boolean).join(' × ') : '';
  $('#tp-bag-list').insertAdjacentHTML('beforeend', `<div class="tp-bag-row"><label><span>Type</span><select name="bagType"><option value="carry-on" ${category === 'carry-on' ? 'selected' : ''}>Carry on</option><option value="cabin" ${category === 'cabin' ? 'selected' : ''}>Cabin</option><option value="checked" ${category === 'checked' ? 'selected' : ''}>Checked</option><option value="sports" ${category === 'sports' ? 'selected' : ''}>Sports</option></select></label><label><span>Weight (kg)</span><input name="bagWeight" type="number" min="0" step="0.1" value="${item?.weightKg || ''}" /></label><label><span>Size L×W×H (cm)</span><input name="bagSize" value="${escapeHtml(size)}" placeholder="55 × 40 × 20" /></label><button type="button" class="tp-icon-button" data-remove-bag aria-label="Remove bag">×</button></div>`);
}

async function requestLocationSuggestions(input: HTMLInputElement, query: string): Promise<void> {
  locationAutocompleteControllers.get(input)?.abort();
  const controller = new AbortController();
  locationAutocompleteControllers.set(input, controller);
  const field = input.closest<HTMLElement>('.tp-location-field');
  const suggestions = field?.querySelector<HTMLElement>('.tp-location-suggestions');
  const help = field?.querySelector<HTMLElement>('.tp-location-help');
  if (!suggestions || !help) return;
  help.textContent = 'Searching…';
  try {
    const response = await fetch(`/api/geocode?type=autocomplete&text=${encodeURIComponent(query)}`, { signal: controller.signal });
    if (!response.ok) throw new Error('Location search failed.');
    const result = await response.json() as { features?: { properties?: { formatted?: string; address_line1?: string; address_line2?: string }; geometry?: { coordinates?: [number, number] } }[] };
    const options = (result.features ?? []).flatMap(feature => {
      const coordinates = feature.geometry?.coordinates; const properties = feature.properties;
      if (!coordinates || !properties?.formatted) return [];
      const payload = encodeURIComponent(JSON.stringify({ location: properties.formatted, longitude: coordinates[0], latitude: coordinates[1] }));
      return [`<button type="button" role="option" data-location-suggestion="${payload}"><strong>${escapeHtml(properties.address_line1 || properties.formatted)}</strong>${properties.address_line2 ? `<small>${escapeHtml(properties.address_line2)}</small>` : ''}</button>`];
    });
    suggestions.innerHTML = options.join('');
    suggestions.hidden = !options.length;
    input.setAttribute('aria-expanded', String(Boolean(options.length)));
    help.textContent = options.length ? 'Choose a location from the suggestions.' : 'No matching locations found.';
  } catch (error) {
    if ((error as Error).name === 'AbortError') return;
    suggestions.hidden = true;
    help.textContent = 'Location suggestions are unavailable; you can still save the location manually.';
  }
}

function openPersonDialog(id?: string): void {
  const form = $('#tp-person-form') as HTMLFormElement;
  form.reset();
  (form.elements.namedItem('id') as HTMLInputElement).value = '';
  const person = trip!.participants.find(candidate => candidate.id === id);
  form.querySelector('h2')!.textContent = person ? 'Edit person' : 'Add person';
  const share = form.elements.namedItem('shareWith') as HTMLSelectElement;
  share.innerHTML = '<option value="">None</option>' + trip!.participants.filter(candidate => candidate.id !== id).map(candidate => `<option value="${candidate.id}">${escapeHtml(candidate.name)}</option>`).join('');
  $('#tp-share-person-checks').innerHTML = trip!.participants.filter(candidate => candidate.id !== id).map(candidate => `<label><input name="sharePerson" value="${candidate.id}" data-sex="${candidate.sex}" type="checkbox" /><span>${escapeHtml(candidate.name)}</span></label>`).join('');
  $('#tp-bag-list').innerHTML = '';
  setLocationField(form, 'origin');
  if (person) {
    (form.elements.namedItem('id') as HTMLInputElement).value = person.id;
    (form.elements.namedItem('name') as HTMLInputElement).value = person.name;
    setLocationField(form, 'origin', person.origin, person.originCoordinates);
    (form.elements.namedItem('sex') as HTMLSelectElement).value = person.sex;
    share.value = person.sleepingPreferences.shareDoubleWithParticipantId ?? '';
    form.querySelectorAll<HTMLInputElement>('[name="roomPreference"]').forEach(input => { input.checked = person.sleepingPreferences.roomPreferences.includes(input.value as never); });
    form.querySelectorAll<HTMLInputElement>('[name="bedPreference"]').forEach(input => { input.checked = person.sleepingPreferences.bedPreferences.includes(input.value as never); });
    form.querySelectorAll<HTMLInputElement>('[name="sharePerson"]').forEach(input => { input.checked = person.sleepingPreferences.shareWithParticipantIds.includes(input.value); });
    person.baggage.forEach(addBagRow);
  }
  form.querySelectorAll('.tp-field-error').forEach(error => error.remove());
  $<HTMLDialogElement>('#tp-person-dialog').showModal();
}

function openRangeDialog(id?: string): void {
  const form = $('#tp-range-form') as HTMLFormElement;
  form.reset();
  const candidate = trip!.availabilityRanges.find(range => range.id === id);
  (form.elements.namedItem('id') as HTMLInputElement).value = candidate?.id ?? '';
  (form.elements.namedItem('start') as HTMLInputElement).value = candidate?.start ?? trip!.availabilityRanges.at(-1)!.end;
  (form.elements.namedItem('end') as HTMLInputElement).value = candidate?.end ?? trip!.availabilityRanges.at(-1)!.end;
  syncDateButtons(form); form.querySelectorAll('.tp-field-error').forEach(error => error.remove());
  $<HTMLDialogElement>('#tp-range-dialog').showModal();
}

function openTransportDialog(id?: string): void {
  const form = $('#tp-transport-form') as HTMLFormElement;
  form.reset();
  let hidden = form.querySelector<HTMLInputElement>('input[name="id"]');
  if (!hidden) { hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.name = 'id'; form.prepend(hidden); }
  hidden.value = '';
  const option = trip!.transportOptions.find(candidate => candidate.id === id);
  setLocationField(form, 'origin');
  setLocationField(form, 'destination');
  $('#tp-person-checks').innerHTML = trip!.participants.map(person => `<label><input type="checkbox" name="participants" value="${person.id}" ${!option || option.participantIds.includes(person.id) ? 'checked' : ''} />${avatar(person)}</label>`).join('');
  if (option) {
    hidden.value = option.id;
    for (const [name, value] of Object.entries({ title: option.title, mode: option.mode, operator: option.operator, price: option.pricePerPerson || '', origin: option.origin, destination: option.destination, departureDate: option.departureAt.slice(0, 10), departureTime: option.departureAt.slice(11, 16), arrivalDate: option.arrivalAt.slice(0, 10), arrivalTime: option.arrivalAt.slice(11, 16), checkedPrice: option.baggageRules.find(rule => /checked/i.test(rule.label))?.price ?? '', sportsPrice: option.baggageRules.find(rule => /sport/i.test(rule.label))?.price ?? '', checkedMax: option.baggageRules.find(rule => /checked/i.test(rule.label))?.maxWeightKg ?? '', sportsMax: option.baggageRules.find(rule => /sport/i.test(rule.label))?.maxWeightKg ?? '', baggageUrl: option.baggageRules[0]?.sourceUrl ?? '', bookingReference: option.bookingReference ?? '' })) (form.elements.namedItem(name) as HTMLInputElement).value = String(value);
    setLocationField(form, 'origin', option.origin, option.originCoordinates);
    setLocationField(form, 'destination', option.destination, option.destinationCoordinates);
  }
  updateTransportFields(); syncDateButtons(form); form.querySelectorAll('.tp-field-error').forEach(error => error.remove());
  $<HTMLDialogElement>('#tp-transport-dialog').showModal();
}

function addBedEditor(roomElement: HTMLElement, bed?: Room['beds'][number]): void {
  const type = bed?.type ?? 'single';
  roomElement.querySelector<HTMLElement>('[data-bed-list]')!.insertAdjacentHTML('beforeend', `<div class="tp-bed-editor-row" data-bed-id="${escapeHtml(bed?.id ?? `bed-${crypto.randomUUID()}`)}"><label><span>Bed type</span><select name="bedType">${(['single', 'double', 'king', 'bunk', 'sofa-bed'] as BedType[]).map(option => `<option value="${option}" ${option === type ? 'selected' : ''}>${option.replace('-', ' ')}</option>`).join('')}</select></label><label><span>Sleeps</span><input name="bedSleeps" type="number" min="1" value="${bed?.sleeps ?? (type === 'single' || type === 'sofa-bed' ? 1 : 2)}" /></label><button class="tp-icon-button" type="button" data-remove-bed aria-label="Remove bed">×</button></div>`);
}

function addRoomEditor(room?: Room): void {
  const id = room?.id ?? `room-${crypto.randomUUID()}`;
  $('#tp-room-editor').insertAdjacentHTML('beforeend', `<section class="tp-room-editor-card" data-room-id="${escapeHtml(id)}"><div class="tp-structured-row"><label><span>Room name</span><input name="roomName" value="${escapeHtml(room?.name ?? '')}" placeholder="Bedroom 1" /></label><label class="tp-private-room"><input name="roomPrivate" type="checkbox" ${room?.private !== false ? 'checked' : ''} /> Private room</label><button class="tp-icon-button" type="button" data-remove-room aria-label="Remove room">×</button></div><div class="tp-bed-editor" data-bed-list></div><button class="tp-text-button" type="button" data-add-bed>+ Add bed</button></section>`);
  const element = $('#tp-room-editor').lastElementChild as HTMLElement;
  room?.beds.forEach(bed => addBedEditor(element, bed));
}

function addTravelTimeEditor(item?: { site: string; minutes: number; coordinates?: GeoCoordinates }): void {
  $('#tp-travel-time-editor').insertAdjacentHTML('beforeend', `<div class="tp-travel-time-row"><label class="tp-location-field"><span>Place</span><input name="travelPlace" value="${escapeHtml(item?.site ?? '')}" placeholder="Main activity, station, town centre…" autocomplete="off" aria-autocomplete="list" aria-expanded="false" data-location-input data-selected-location="${item?.coordinates ? escapeHtml(item.site) : ''}" /><input type="hidden" data-location-lat value="${item?.coordinates?.latitude ?? ''}" /><input type="hidden" data-location-lon value="${item?.coordinates?.longitude ?? ''}" /><span class="tp-location-suggestions" role="listbox" hidden></span><small class="tp-location-help">Select a suggestion to save this location to the map.</small></label><label><span>Minutes</span><input name="travelMinutes" type="number" min="0" value="${item?.minutes || ''}" /></label><button class="tp-icon-button" type="button" data-remove-travel-time aria-label="Remove travel time">×</button></div>`);
}

function openStayDialog(id?: string): void {
  const form = $('#tp-stay-form') as HTMLFormElement;
  form.reset();
  $('#tp-room-editor').innerHTML = '';
  $('#tp-travel-time-editor').innerHTML = '';
  const option = trip!.accommodationOptions.find(candidate => candidate.id === id);
  setLocationField(form, 'location');
  form.querySelector('h2')!.textContent = option ? 'Edit accommodation' : 'Add accommodation';
  if (option) {
    for (const [name, value] of Object.entries({ id: option.id, name: option.name, location: option.location, price: option.priceTotal || '', checkIn: option.checkIn, checkOut: option.checkOut, url: option.sourceUrl, notes: option.notes ?? '', bookingReference: option.bookingReference ?? '' })) (form.elements.namedItem(name) as HTMLInputElement).value = String(value);
    setLocationField(form, 'location', option.location, option.locationCoordinates);
    option.rooms.forEach(addRoomEditor);
    const travelTimes = [...option.siteDistances];
    if (option.walkToPrimarySiteMinutes && !travelTimes.some(item => /main activity/i.test(item.site))) travelTimes.unshift({ site: 'Main activity', minutes: option.walkToPrimarySiteMinutes });
    travelTimes.forEach(addTravelTimeEditor);
  } else {
    (form.elements.namedItem('checkIn') as HTMLInputElement).value = trip!.dateRange.start;
    (form.elements.namedItem('checkOut') as HTMLInputElement).value = trip!.dateRange.end;
  }
  syncDateButtons(form); form.querySelectorAll('.tp-field-error').forEach(error => error.remove());
  $<HTMLDialogElement>('#tp-stay-dialog').showModal();
}

function openActivityDialog(id?: string): void {
  const form = $<HTMLFormElement>('#tp-activity-form');
  form.reset();
  (form.elements.namedItem('id') as HTMLInputElement).value = '';
  const option = trip!.activities.find(candidate => candidate.id === id);
  setLocationField(form, 'location');
  form.querySelector('h2')!.textContent = option ? 'Edit activity' : 'Add activity';
  if (option) {
    for (const [name, value] of Object.entries({ id: option.id, name: option.name, category: option.category ?? '', location: option.location ?? '', cost: option.costPerPerson || '', date: option.date ?? '', time: option.time ?? '', url: option.sourceUrl ?? '', notes: option.notes ?? '' })) (form.elements.namedItem(name) as HTMLInputElement).value = String(value);
    setLocationField(form, 'location', option.location ?? '', option.locationCoordinates);
  }
  syncDateButtons(form); form.querySelectorAll('.tp-field-error').forEach(error => error.remove());
  $<HTMLDialogElement>('#tp-activity-dialog').showModal();
}

async function savePerson(form: HTMLFormElement): Promise<void> {
  if (!validateForm(form)) return;
  const data = new FormData(form);
  const id = String(data.get('id') || `person-${crypto.randomUUID()}`);
  const existing = trip!.participants.find(person => person.id === id);
  const bags: BaggageItem[] = [];
  const dimensions = (value: string) => value.split(/[x×,]/).map(part => Number(part.trim()));
  form.querySelectorAll<HTMLElement>('.tp-bag-row').forEach((row, index) => {
    const category = (row.querySelector<HTMLSelectElement>('[name="bagType"]')?.value ?? 'carry-on') as BaggageItem['category'];
    const weightKg = Number(row.querySelector<HTMLInputElement>('[name="bagWeight"]')?.value) || 0;
    const [lengthCm, widthCm, heightCm] = dimensions(row.querySelector<HTMLInputElement>('[name="bagSize"]')?.value ?? '');
    const labels: Record<string, string> = { 'carry-on': 'Carry on', cabin: 'Cabin bag', checked: 'Checked bag', sports: 'Sports bag' };
    bags.push({ id: existing?.baggage[index]?.id ?? `${id}-bag-${crypto.randomUUID()}`, category, label: labels[category] ?? 'Bag', weightKg, lengthCm: lengthCm || undefined, widthCm: widthCm || undefined, heightCm: heightCm || undefined });
  });
  const roomPreferences = data.getAll('roomPreference').map(String) as Participant['sleepingPreferences']['roomPreferences'];
  const bedPreferences = data.getAll('bedPreference').map(String) as Participant['sleepingPreferences']['bedPreferences'];
  const ownRoom = roomPreferences.includes('require-own') ? 'required' : roomPreferences.includes('prefer-own') ? 'preferred' : 'not-needed';
  const partnerId = String(data.get('shareWith')) || undefined;
  const shareWithParticipantIds = data.getAll('sharePerson').map(String);
  if (partnerId && !shareWithParticipantIds.includes(partnerId)) shareWithParticipantIds.push(partnerId);
  const originCoordinates = coordinatesFromForm(data, 'origin');
  const person: Participant = { id, name: String(data.get('name')).trim(), initials: String(data.get('name')).trim().slice(0, 1).toUpperCase(), colour: existing?.colour ?? colours[trip!.participants.length % colours.length], origin: String(data.get('origin')).trim(), originCoordinates, sex: String(data.get('sex')) as Participant['sex'], confirmed: existing?.confirmed ?? false, goWithFlow: false, sleepingPreferences: { ownRoom, ownBed: bedPreferences.includes('own-bed'), shareDoubleWithParticipantId: partnerId, acceptsSofaBed: bedPreferences.includes('sofa-bed'), roomPreferences, bedPreferences, shareWithParticipantIds }, baggage: bags };
  closeDialogs();
  await mutate(() => repository.saveParticipant(trip!.id, person), existing ? 'Person updated.' : 'Person added.');
}

async function saveTransport(form: HTMLFormElement): Promise<void> {
  if (!validateForm(form)) return;
  const data = new FormData(form); const url = String(data.get('baggageUrl')); const rules: TransportOption['baggageRules'] = [];
  if (Number(data.get('checkedPrice'))) rules.push({ label: 'Checked bag', maxWeightKg: Number(data.get('checkedMax')) || undefined, price: Number(data.get('checkedPrice')), currency: trip!.currency, sourceUrl: url, checkedAt: new Date().toISOString().slice(0, 10) });
  if (Number(data.get('sportsPrice'))) rules.push({ label: 'Sports equipment', maxWeightKg: Number(data.get('sportsMax')) || undefined, price: Number(data.get('sportsPrice')), currency: trip!.currency, sourceUrl: url, checkedAt: new Date().toISOString().slice(0, 10) });
  const id = String(data.get('id') || `transport-${crypto.randomUUID()}`); const existing = trip!.transportOptions.find(option => option.id === id);
  const combineDateTime = (day: FormDataEntryValue | null, time: FormDataEntryValue | null) => String(day || '') ? `${String(day)}T${String(time || '00:00')}` : '';
  const option: TransportOption = { id, mode: String(data.get('mode')) as TransportMode, status: existing?.status ?? 'idea', title: String(data.get('title')), operator: String(data.get('operator') || ''), origin: String(data.get('origin') || ''), originCoordinates: coordinatesFromForm(data, 'origin'), destination: String(data.get('destination') || ''), destinationCoordinates: coordinatesFromForm(data, 'destination'), departureAt: combineDateTime(data.get('departureDate'), data.get('departureTime')), arrivalAt: combineDateTime(data.get('arrivalDate'), data.get('arrivalTime')), participantIds: data.getAll('participants').map(String), pricePerPerson: Number(data.get('price')) || 0, currency: trip!.currency, baggageRules: rules, votes: existing?.votes ?? {}, bookingReference: String(data.get('bookingReference')) || undefined };
  closeDialogs(); await mutate(() => repository.saveTransportOption(trip!.id, option), 'Transport option saved.');
}

async function saveStay(form: HTMLFormElement): Promise<void> {
  if (!validateForm(form)) return;
  const data = new FormData(form); const id = String(data.get('id') || `stay-${crypto.randomUUID()}`); const existing = trip!.accommodationOptions.find(option => option.id === id);
  const rooms: Room[] = [...form.querySelectorAll<HTMLElement>('[data-room-id]')].map((roomElement, roomIndex) => ({
    id: roomElement.dataset.roomId!,
    name: roomElement.querySelector<HTMLInputElement>('[name="roomName"]')!.value.trim() || `Room ${roomIndex + 1}`,
    private: roomElement.querySelector<HTMLInputElement>('[name="roomPrivate"]')!.checked,
    beds: [...roomElement.querySelectorAll<HTMLElement>('[data-bed-id]')].map(bedElement => ({ id: bedElement.dataset.bedId!, type: bedElement.querySelector<HTMLSelectElement>('[name="bedType"]')!.value as BedType, sleeps: Number(bedElement.querySelector<HTMLInputElement>('[name="bedSleeps"]')!.value) || 1 })),
  }));
  const spaces = rooms.flatMap(room => room.beds).reduce((total, bed) => total + bed.sleeps, 0); const hasSofa = rooms.some(room => room.beds.some(bed => bed.type === 'sofa-bed')); const fitLevel = !rooms.length ? 'compromise' : spaces < trip!.participants.length ? 'invalid' : hasSofa ? 'compromise' : 'good';
  const siteDistances = [...form.querySelectorAll<HTMLElement>('.tp-travel-time-row')].map(row => {
    const site = row.querySelector<HTMLInputElement>('[name="travelPlace"]')!.value.trim();
    const latitudeValue = row.querySelector<HTMLInputElement>('[data-location-lat]')?.value ?? '';
    const longitudeValue = row.querySelector<HTMLInputElement>('[data-location-lon]')?.value ?? '';
    const latitude = Number(latitudeValue); const longitude = Number(longitudeValue);
    const coordinates = latitudeValue && longitudeValue && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : undefined;
    return { site, minutes: Number(row.querySelector<HTMLInputElement>('[name="travelMinutes"]')!.value) || 0, coordinates };
  }).filter(item => item.site);
  const sourceUrl = String(data.get('url') || '');
  let platform = '';
  try { platform = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, '') : ''; } catch { platform = ''; }
  const fitSummary = !rooms.length ? 'Room and bed details have not been added yet.' : spaces < trip!.participants.length ? `${spaces} sleeping spaces for ${trip!.participants.length} people — this does not fit the whole group.` : hasSofa ? 'Fits the group, but uses a sofa bed. Check this against everyone’s preferences.' : `Fits all ${trip!.participants.length} travellers without using a sofa bed.`;
  const option: AccommodationOption = { id, status: existing?.status ?? 'shortlisted', name: String(data.get('name')), platform, sourceUrl, location: String(data.get('location') || ''), locationCoordinates: coordinatesFromForm(data, 'location'), priceTotal: Number(data.get('price')) || 0, currency: trip!.currency, checkIn: String(data.get('checkIn') || ''), checkOut: String(data.get('checkOut') || ''), walkToPrimarySiteMinutes: siteDistances.find(item => /main activity/i.test(item.site))?.minutes ?? 0, siteDistances, rooms, votes: existing?.votes ?? {}, fitSummary, fitLevel, notes: String(data.get('notes')), bookingReference: String(data.get('bookingReference')) || undefined };
  closeDialogs(); await mutate(() => repository.saveAccommodationOption(trip!.id, option), 'Accommodation saved.');
}

async function saveActivity(form: HTMLFormElement): Promise<void> {
  if (!validateForm(form)) return;
  const data = new FormData(form);
  const id = String(data.get('id') || `activity-${crypto.randomUUID()}`);
  const existing = trip!.activities.find(option => option.id === id);
  const option: ActivityOption = { id, status: existing?.status ?? 'idea', name: String(data.get('name')).trim(), category: String(data.get('category') || '') || undefined, location: String(data.get('location') || '') || undefined, locationCoordinates: coordinatesFromForm(data, 'location'), date: String(data.get('date') || '') || undefined, time: String(data.get('time') || '') || undefined, sourceUrl: String(data.get('url') || '') || undefined, costPerPerson: Number(data.get('cost')) || undefined, currency: trip!.currency, notes: String(data.get('notes') || '') || undefined, votes: existing?.votes ?? {} };
  closeDialogs(); await mutate(() => repository.saveActivityOption(trip!.id, option), 'Activity saved.');
}

function showTrip(result: { trip: Trip; session: TripSession }): void {
  trip = result.trip;
  session = result.session;
  itineraryPersonId = '';
  history.replaceState({}, '', `${location.pathname}?trip=${trip.id}`);
  $<HTMLDialogElement>('#tp-join-dialog').close();
  $('#tp-access').hidden = true;
  $('#tp-app').hidden = false;
  render();
}

function requestTripIdentity(loadedTrip: Trip): void {
  trip = loadedTrip;
  $('#tp-access-title').textContent = loadedTrip.title;
  const dialog = $<HTMLDialogElement>('#tp-join-dialog');
  if (!dialog.open) dialog.showModal();
}

function exportCurrentTrip(): void {
  if (!trip) return;
  const exported: TripExport = { schemaVersion: 1, exportedAt: new Date().toISOString(), trip };
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const filename = trip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';
  link.href = url; link.download = `${filename}-trip-planner.json`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast('Trip exported.');
}

async function importTripFile(file: File): Promise<void> {
  const parsed = JSON.parse(await file.text()) as TripExport;
  showTrip(await repository.importTrip(parsed));
  showToast('Trip imported.');
}

export function mountTripPlanner(): void {
  const setup = $('#tp-access-form') as HTMLFormElement;
  enhanceForms();
  renderSetupCalendar();
  setup.addEventListener('submit', async event => {
    event.preventDefault(); const button = setup.querySelector<HTMLButtonElement>('button[type="submit"]')!; const error = $('#tp-access-error'); button.disabled = true; button.textContent = 'Creating…'; error.hidden = true;
    try {
      if (!validateForm(setup)) throw new Error('Check the highlighted fields.');
      if (!setupRanges.length) throw new Error('Select at least one potential date range.');
      const setupData = new FormData(setup);
      const result = await repository.createTrip({ displayName: formValue(setup, 'name'), title: formValue(setup, 'title'), destination: formValue(setup, 'destination'), destinationCoordinates: coordinatesFromForm(setupData, 'destination'), availabilityRanges: setupRanges.map(({ start, end }) => ({ start, end })) });
      showTrip(result);
    } catch (caught) { error.textContent = caught instanceof Error ? caught.message : 'Could not create the trip.'; error.hidden = false; }
    finally { button.disabled = false; button.textContent = 'Create blank trip'; }
  });

  $('#tp-load-demo').addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    const error = $('#tp-access-error');
    button.disabled = true; button.textContent = 'Loading…'; error.hidden = true;
    try {
      const result = await repository.createDemoTrip();
      showTrip(result);
    } catch (caught) { error.textContent = caught instanceof Error ? caught.message : 'Could not load the demo trip.'; error.hidden = false; }
    finally { button.disabled = false; button.textContent = 'Load detailed demo trip'; }
  });

  $<HTMLFormElement>('#tp-join-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const error = form.querySelector<HTMLElement>('[data-join-error]')!;
    error.hidden = true; button.disabled = true; button.textContent = 'Joining…';
    try {
      if (!validateForm(form) || !trip) throw new Error('Enter your name to join the trip.');
      showTrip(await repository.accessTrip({ tripId: trip.id, displayName: formValue(form, 'name') }));
    } catch (caught) {
      if (caught instanceof RevisionConflictError && trip) trip = await repository.getTrip(trip.id);
      error.textContent = caught instanceof Error ? caught.message : 'Could not join the trip.';
      error.hidden = false;
    } finally { button.disabled = false; button.textContent = 'Join trip'; }
  });

  $('#tp-export').addEventListener('click', exportCurrentTrip);
  $('#tp-import').addEventListener('click', () => $<HTMLInputElement>('#tp-import-file').click());
  $<HTMLInputElement>('#tp-import-file').addEventListener('change', async event => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    try { await importTripFile(file); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Could not import this trip.'); }
  });

  $('#trip-planner-root').addEventListener('input', event => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-location-input]');
    if (!input?.form) return;
    const field = input.closest<HTMLElement>('.tp-location-field');
    const suggestions = field?.querySelector<HTMLElement>('.tp-location-suggestions');
    if (input.value !== input.dataset.selectedLocation) {
      const field = input.closest<HTMLElement>('.tp-location-field');
      const latitude = field?.querySelector<HTMLInputElement>('[data-location-lat]');
      const longitude = field?.querySelector<HTMLInputElement>('[data-location-lon]');
      if (latitude) latitude.value = '';
      if (longitude) longitude.value = '';
    }
    const previousTimer = locationAutocompleteTimers.get(input);
    if (previousTimer) clearTimeout(previousTimer);
    locationAutocompleteControllers.get(input)?.abort();
    if (suggestions) suggestions.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    if (!geocodingAvailable || input.value.trim().length < 3) return;
    const timer = window.setTimeout(() => { void requestLocationSuggestions(input, input.value.trim()); }, 350);
    locationAutocompleteTimers.set(input, timer);
  });

  $('#trip-planner-root').addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const locationSuggestion = target.closest<HTMLButtonElement>('[data-location-suggestion]');
    if (locationSuggestion) {
      const result = JSON.parse(decodeURIComponent(locationSuggestion.dataset.locationSuggestion!)) as { location: string; latitude: number; longitude: number };
      const field = locationSuggestion.closest<HTMLElement>('.tp-location-field');
      const input = field?.querySelector<HTMLInputElement>('[data-location-input]');
      if (!input) return;
      setLocationInput(input, result.location, { latitude: result.latitude, longitude: result.longitude });
      return;
    }
    const dateButton = target.closest<HTMLButtonElement>('[data-date-for]'); if (dateButton?.dataset.dateFor) { const input = document.getElementById(dateButton.dataset.dateFor) as HTMLInputElement; openDatePicker(input); return; }
    const pickerDate = target.closest<HTMLButtonElement>('[data-picker-date]'); if (pickerDate?.dataset.pickerDate && activeDateInput) { activeDateInput.value = pickerDate.dataset.pickerDate; activeDateInput.dispatchEvent(new Event('change', { bubbles: true })); syncDateButtons(); $<HTMLDialogElement>('#tp-date-picker-dialog').close(); return; }
    if (target.closest('#tp-picker-prev')) { pickerMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1); renderSingleMonthPicker(); return; }
    if (target.closest('#tp-picker-next')) { pickerMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1); renderSingleMonthPicker(); return; }
    if (target.closest('#tp-picker-clear') && activeDateInput) { activeDateInput.value = ''; syncDateButtons(); $<HTMLDialogElement>('#tp-date-picker-dialog').close(); return; }
    if (target.closest('#tp-picker-cancel')) { $<HTMLDialogElement>('#tp-date-picker-dialog').close(); return; }
    const itineraryPerson = target.closest<HTMLButtonElement>('[data-itinerary-person]'); if (itineraryPerson) { itineraryPersonId = itineraryPerson.dataset.itineraryPerson ?? ''; render(); return; }
    const setupDate = target.closest<HTMLButtonElement>('[data-setup-date]'); if (setupDate?.dataset.setupDate) { selectSetupDate(setupDate.dataset.setupDate); return; }
    const removeSetupRange = target.closest<HTMLButtonElement>('[data-remove-setup-range]'); if (removeSetupRange) { setupRanges = setupRanges.filter(candidate => candidate.id !== removeSetupRange.dataset.removeSetupRange); renderSetupCalendar(); return; }
    if (target.closest('#tp-setup-prev-month')) { setupCalendarMonth = new Date(setupCalendarMonth.getFullYear(), setupCalendarMonth.getMonth() - 1, 1); renderSetupCalendar(); return; }
    if (target.closest('#tp-setup-next-month')) { setupCalendarMonth = new Date(setupCalendarMonth.getFullYear(), setupCalendarMonth.getMonth() + 1, 1); renderSetupCalendar(); return; }
    const view = target.closest<HTMLElement>('[data-view]'); if (view?.dataset.view) return setView(view.dataset.view as View);
    const rangeCell = target.closest<HTMLButtonElement>('[data-range-start]'); if (rangeCell) { const currentlyAvailable = trip!.availability.some(entry => entry.participantId === rangeCell.dataset.person && entry.status === 'available' && entry.date >= rangeCell.dataset.rangeStart! && entry.date <= rangeCell.dataset.rangeEnd!); void mutate(() => repository.setRangeAvailability(trip!.id, rangeCell.dataset.person!, rangeCell.dataset.rangeStart!, rangeCell.dataset.rangeEnd!, currentlyAvailable ? 'unavailable' : 'available'), `${trip!.participants.find(person => person.id === rangeCell.dataset.person)?.name} updated.`); return; }
    const cell = target.closest<HTMLButtonElement>('[data-date]'); if (cell) { const slot = cell.dataset.slot as AvailabilitySlot; const current = statusFor(cell.dataset.person!, cell.dataset.date!, slot); const next: AvailabilityStatus = current === 'available' ? 'unavailable' : 'available'; void mutate(() => repository.setAvailability(trip!.id, cell.dataset.person!, cell.dataset.date!, slot, next), `${trip!.participants.find(person => person.id === cell.dataset.person)?.name} marked ${next}.`); return; }
    const vote = target.closest<HTMLButtonElement>('[data-vote]'); if (vote) { void mutate(() => repository.voteForAccommodation(trip!.id, vote.dataset.accommodation!, session!.participantId, vote.dataset.vote as VoteValue), 'Vote saved.'); return; }
    const transportVote = target.closest<HTMLButtonElement>('[data-transport-vote]'); if (transportVote) { void mutate(() => repository.voteForTransport(trip!.id, transportVote.dataset.transport!, session!.participantId, transportVote.dataset.transportVote as VoteValue), 'Vote saved.'); return; }
    const select = target.closest<HTMLButtonElement>('[data-select-stay]'); if (select) { void mutate(() => repository.selectAccommodation(trip!.id, select.dataset.selectStay!), 'Stay selected.'); return; }
    const selectTransport = target.closest<HTMLButtonElement>('[data-select-transport]'); if (selectTransport) { void mutate(() => repository.selectTransport(trip!.id, selectTransport.dataset.selectTransport!), 'Transport selection updated.'); return; }
    const activityVote = target.closest<HTMLButtonElement>('[data-activity-vote]'); if (activityVote) { void mutate(() => repository.voteForActivity(trip!.id, activityVote.dataset.activity!, session!.participantId, activityVote.dataset.activityVote as VoteValue), 'Vote saved.'); return; }
    const selectActivity = target.closest<HTMLButtonElement>('[data-select-activity]'); if (selectActivity) { void mutate(() => repository.selectActivity(trip!.id, selectActivity.dataset.selectActivity!), 'Itinerary updated.'); return; }
    if (target.closest('#tp-edit-trip')) return openTripDialog();
    if (target.closest('#tp-add-person')) return openPersonDialog();
    if (target.closest('#tp-add-bag')) { addBagRow(); return; }
    const removeBag = target.closest<HTMLElement>('[data-remove-bag]'); if (removeBag) { removeBag.closest('.tp-bag-row')?.remove(); return; }
    if (target.closest('#tp-add-room')) { addRoomEditor(); return; }
    const addBed = target.closest<HTMLElement>('[data-add-bed]'); if (addBed) { addBedEditor(addBed.closest<HTMLElement>('[data-room-id]')!); return; }
    const removeBed = target.closest<HTMLElement>('[data-remove-bed]'); if (removeBed) { removeBed.closest('[data-bed-id]')?.remove(); return; }
    const removeRoom = target.closest<HTMLElement>('[data-remove-room]'); if (removeRoom) { removeRoom.closest('[data-room-id]')?.remove(); return; }
    if (target.closest('#tp-add-travel-time')) { addTravelTimeEditor(); return; }
    const removeTravelTime = target.closest<HTMLElement>('[data-remove-travel-time]'); if (removeTravelTime) { removeTravelTime.closest('.tp-travel-time-row')?.remove(); return; }
    const editPerson = target.closest<HTMLElement>('[data-edit-person]'); if (editPerson) return openPersonDialog(editPerson.dataset.editPerson);
    if (target.closest('#tp-add-range')) return openRangeDialog();
    const editRange = target.closest<HTMLElement>('[data-edit-range]'); if (editRange) return openRangeDialog(editRange.dataset.editRange);
    const removeRange = target.closest<HTMLElement>('[data-remove-range]'); if (removeRange) { void mutate(() => repository.removeAvailabilityRange(trip!.id, removeRange.dataset.removeRange!), 'Date range removed.'); return; }
    const preferRange = target.closest<HTMLElement>('[data-prefer-range]'); if (preferRange) { const candidate = trip!.availabilityRanges.find(range => range.id === preferRange.dataset.preferRange)!; void mutate(() => repository.selectPreferredDates(trip!.id, { start: candidate.start, end: candidate.end }), 'Preferred dates selected.'); return; }
    if (target.closest('#tp-add-transport')) return openTransportDialog();
    const editTransport = target.closest<HTMLElement>('[data-edit-transport]'); if (editTransport) return openTransportDialog(editTransport.dataset.editTransport);
    const removeTransport = target.closest<HTMLElement>('[data-remove-transport]'); if (removeTransport) { if (window.confirm('Delete this transport option?')) void mutate(() => repository.removeTransportOption(trip!.id, removeTransport.dataset.removeTransport!), 'Transport option deleted.'); return; }
    if (target.closest('#tp-add-stay')) return openStayDialog();
    const editStay = target.closest<HTMLElement>('[data-edit-stay]'); if (editStay) return openStayDialog(editStay.dataset.editStay);
    if (target.closest('#tp-add-activity')) return openActivityDialog();
    const editActivity = target.closest<HTMLElement>('[data-edit-activity]'); if (editActivity) return openActivityDialog(editActivity.dataset.editActivity);
    const removeActivity = target.closest<HTMLElement>('[data-remove-activity]'); if (removeActivity) { if (window.confirm('Delete this activity?')) void mutate(() => repository.removeActivityOption(trip!.id, removeActivity.dataset.removeActivity!), 'Activity deleted.'); return; }
    if (target.closest('[data-close-dialog]')) closeDialogs();
  });

  $<HTMLSelectElement>('#tp-transport-form [name="mode"]').addEventListener('change', updateTransportFields);
  $('#tp-stay-form').addEventListener('change', event => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>('[name="bedType"]');
    if (!select) return;
    const sleeps = select.closest<HTMLElement>('[data-bed-id]')?.querySelector<HTMLInputElement>('[name="bedSleeps"]');
    if (sleeps) sleeps.value = select.value === 'single' || select.value === 'sofa-bed' ? '1' : '2';
  });
  $('#tp-room-preferences').addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (input.name !== 'roomPreference' || !input.checked) return;
    const form = input.form!;
    if (input.value === 'require-own') form.querySelectorAll<HTMLInputElement>('[name="roomPreference"]:not([value="require-own"])').forEach(option => { option.checked = false; });
    else (form.querySelector<HTMLInputElement>('[name="roomPreference"][value="require-own"]')!).checked = false;
  });
  $('#tp-bed-preferences').addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (input.name !== 'bedPreference') return;
    const form = input.form!;
    const anyone = form.querySelector<HTMLInputElement>('[name="bedPreference"][value="share-anyone"]')!;
    const women = form.querySelector<HTMLInputElement>('[name="bedPreference"][value="share-women"]')!;
    const men = form.querySelector<HTMLInputElement>('[name="bedPreference"][value="share-men"]')!;
    const personOptions = [...form.querySelectorAll<HTMLInputElement>('[name="sharePerson"]')];
    if (input === anyone) {
      women.checked = anyone.checked; men.checked = anyone.checked;
      personOptions.forEach(option => { option.checked = anyone.checked; });
    } else if (input === women || input === men) {
      const selectedSex = input === women ? 'female' : 'male';
      personOptions.filter(option => option.dataset.sex === selectedSex).forEach(option => { option.checked = input.checked; });
      anyone.checked = women.checked && men.checked;
    }
  });

  $('#tp-share').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); showToast('Trip link copied.'); } catch { showToast('Copy the URL from the address bar.'); } });
  ($('#tp-person-form') as HTMLFormElement).addEventListener('submit', event => { event.preventDefault(); void savePerson(event.currentTarget as HTMLFormElement); });
  ($('#tp-range-form') as HTMLFormElement).addEventListener('submit', event => { event.preventDefault(); const form = event.currentTarget as HTMLFormElement; if (!validateForm(form)) return; const id = formValue(form, 'id') || `range-${crypto.randomUUID()}`; closeDialogs(); void mutate(() => repository.saveAvailabilityRange(trip!.id, { id, start: formValue(form, 'start'), end: formValue(form, 'end') }), 'Candidate date range saved.'); });
  ($('#tp-transport-form') as HTMLFormElement).addEventListener('submit', event => { event.preventDefault(); void saveTransport(event.currentTarget as HTMLFormElement); });
  ($('#tp-stay-form') as HTMLFormElement).addEventListener('submit', event => { event.preventDefault(); void saveStay(event.currentTarget as HTMLFormElement); });
  ($('#tp-activity-form') as HTMLFormElement).addEventListener('submit', event => { event.preventDefault(); void saveActivity(event.currentTarget as HTMLFormElement); });
  ($('#tp-trip-form') as HTMLFormElement).addEventListener('submit', event => { event.preventDefault(); const form = event.currentTarget as HTMLFormElement; if (!validateForm(form)) return; const data = new FormData(form); closeDialogs(); void mutate(() => repository.updateTrip(trip!.id, { title: formValue(form, 'title'), destination: formValue(form, 'destination'), destinationCoordinates: coordinatesFromForm(data, 'destination'), availabilityWindow: { start: formValue(form, 'windowStart'), end: formValue(form, 'windowEnd') }, dateRange: { start: formValue(form, 'tripStart'), end: formValue(form, 'tripEnd') } }), 'Trip details updated.'); });

  const savedToken = new URLSearchParams(location.search).get('trip');
  if (savedToken) {
    const title = $('#tp-access-title');
    title.textContent = 'Loading saved trip…';
    void repository.restoreTrip(savedToken).then(result => {
      if (result?.session) showTrip({ trip: result.trip, session: result.session });
      else if (result) requestTripIdentity(result.trip);
      else {
        title.textContent = 'Create a trip';
        const error = $('#tp-access-error');
        error.textContent = 'This trip does not exist or the link is incomplete.';
        error.hidden = false;
      }
    }).catch(() => {
      title.textContent = 'Create a trip';
      const error = $('#tp-access-error');
      error.textContent = 'The saved trip could not be loaded.';
      error.hidden = false;
    });
  }
}
