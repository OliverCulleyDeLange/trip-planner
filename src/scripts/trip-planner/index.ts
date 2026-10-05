import { ApiTripRepository, RevisionConflictError, type TripResult } from '../../lib/trip-planner/api-repository';
import type {
  AccommodationOption, ActivityOption, AvailabilitySlot, AvailabilityStatus, BedType, BaggageItem, GeoCoordinates, Participant,
  Room, TransportMode, TransportOption, Trip, TripAccessState, TripExport, TripPermission, TripSession, VoteValue,
} from '../../lib/trip-planner/types';

type View = 'overview' | 'people' | 'availability' | 'transport' | 'stays' | 'activities';
type AccountState = { user: { email: string; name: string }; tripSession?: TripSession };

const repository = new ApiTripRepository();
const appBase = import.meta.env.BASE_URL.replace(/\/$/, '');
const tripUrl = (tripId: string) => `${appBase}/trips/${encodeURIComponent(tripId)}`;
let trip: Trip | undefined;
let session: TripSession | undefined;
let account: AccountState | undefined;
let tripAccess: TripAccessState | undefined;
let canEdit = false;
let activeView: View = 'overview';
let itineraryPersonId = '';
let itineraryLayout: 'list' | 'calendar' = localStorage.getItem('trip-planner:itinerary-layout') === 'calendar' ? 'calendar' : 'list';
let planningPersonId = '';
let toastTimer = 0;
let personDeletionPending = false;
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
const demoEditSelector = [
  '#tp-edit-trip', '#tp-add-person', '#tp-add-range', '#tp-add-transport', '[data-add-transport]', '#tp-add-stay', '#tp-add-activity',
  '[data-edit-person]', '[data-remove-person]', '[data-edit-range]', '[data-remove-range]', '[data-prefer-range]', '[data-edit-transport]', '[data-remove-transport]',
  '[data-edit-stay]', '[data-remove-stay]', '[data-edit-activity]', '[data-remove-activity]', '[data-select-stay]', '[data-select-transport]', '[data-select-activity]',
  '[data-range-start]', '[data-date]', '[data-vote]', '[data-transport-vote]', '[data-activity-vote]', '.tp-completion button', '[data-restrict-access]',
].join(', ');

async function loadAccount(tripId?: string): Promise<AccountState | undefined> {
  try {
    const query = tripId ? `?trip=${encodeURIComponent(tripId)}` : '';
    const response = await fetch(`${appBase}/api/account/session${query}`, { credentials: 'same-origin', redirect: 'manual' });
    if (!response.ok || response.type === 'opaqueredirect') return undefined;
    return await response.json() as AccountState;
  } catch {
    return undefined;
  }
}

function applyAccountDefaults(): void {
  if (!account) return;
  const name = $<HTMLInputElement>('#tp-name');
  if (!name.value) name.value = account.user.name;
}

function coordinatesFromForm(data: FormData, name: string): GeoCoordinates | undefined {
  const latitudeValue = String(data.get(`${name}Latitude`) ?? '');
  const longitudeValue = String(data.get(`${name}Longitude`) ?? '');
  const latitude = Number(latitudeValue); const longitude = Number(longitudeValue);
  return latitudeValue && longitudeValue && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : undefined;
}

function setLocationInput(input: HTMLInputElement, value = '', coordinates?: GeoCoordinates): void {
  const field = input.closest<HTMLElement>('.tp-location-field');
  dismissLocationSuggestions(input);
  input.value = value;
  input.dataset.selectedLocation = coordinates ? value : '';
  const latitude = field?.querySelector<HTMLInputElement>('[data-location-lat]');
  const longitude = field?.querySelector<HTMLInputElement>('[data-location-lon]');
  if (latitude) latitude.value = coordinates?.latitude.toString() ?? '';
  if (longitude) longitude.value = coordinates?.longitude.toString() ?? '';
  const help = field?.querySelector<HTMLElement>('.tp-location-help');
  if (help) help.textContent = coordinates ? 'Location selected and ready for the map.' : 'Select a suggestion to save this location to the map.';
}

function dismissLocationSuggestions(input: HTMLInputElement): void {
  const timer = locationAutocompleteTimers.get(input);
  if (timer) clearTimeout(timer);
  locationAutocompleteTimers.delete(input);
  locationAutocompleteControllers.get(input)?.abort();
  locationAutocompleteControllers.delete(input);
  const suggestions = input.closest<HTMLElement>('.tp-location-field')?.querySelector<HTMLElement>('.tp-location-suggestions');
  if (suggestions) { suggestions.hidden = true; suggestions.innerHTML = ''; }
  input.setAttribute('aria-expanded', 'false');
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
  updateTransportCapacityWarning();
}

function updateTransportCapacityWarning(): void {
  const form = document.querySelector<HTMLFormElement>('#tp-transport-form');
  const warning = document.querySelector<HTMLElement>('#tp-transport-capacity-warning');
  if (!form || !warning) return;
  const mode = (form.elements.namedItem('mode') as HTMLSelectElement).value;
  const seats = Number((form.elements.namedItem('seats') as HTMLInputElement).value);
  const travellers = form.querySelectorAll<HTMLInputElement>('[name="participants"]:checked').length;
  const overCapacity = mode === 'car' && seats > 0 && travellers > seats;
  warning.hidden = !overCapacity;
  warning.textContent = overCapacity ? `${travellers} travellers are selected, but this car only has ${seats} seat${seats === 1 ? '' : 's'}.` : '';
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

function groupCouples(people: Participant[]): Participant[][] {
  const included = new Set(people.map(person => person.id));
  const grouped = new Set<string>();
  return people.flatMap(person => {
    if (grouped.has(person.id)) return [];
    const partner = trip!.participants.find(candidate => candidate.id === person.sleepingPreferences.shareDoubleWithParticipantId && included.has(candidate.id))
      ?? people.find(candidate => candidate.id !== person.id && candidate.sleepingPreferences.shareDoubleWithParticipantId === person.id);
    grouped.add(person.id);
    if (!partner || grouped.has(partner.id)) return [[person]];
    grouped.add(partner.id);
    return [[person, partner]];
  });
}

function renderPersonChips(people: Participant[], className = ''): string {
  if (!people.length) return '';
  return `<div class="tp-person-chip-row ${className}" aria-label="People involved">${groupCouples(people).map(group => {
    const label = group.map(person => person.name).join(' & ');
    return `<span class="tp-person-name-chip${group.length > 1 ? ' is-couple' : ''}" title="${escapeHtml(label)}"><span class="tp-person-chip-avatars">${group.map(person => `<i style="--person:${person.colour}">${escapeHtml(person.initials)}</i>`).join('')}</span><b>${escapeHtml(label)}</b></span>`;
  }).join('')}</div>`;
}

function isRelevantTo(option: { participantIds?: string[] }, personId: string): boolean {
  return !personId || option.participantIds === undefined || option.participantIds.includes(personId);
}

function renderPlanningPersonFilter(label: string): string {
  if (planningPersonId && !trip!.participants.some(person => person.id === planningPersonId)) planningPersonId = '';
  return `<div class="tp-itinerary-filter tp-planning-filter" aria-label="Filter ${label} by traveller"><button class="${planningPersonId ? '' : 'active'}" data-planning-person="" aria-pressed="${!planningPersonId}">Everyone</button>${trip!.participants.map(person => `<button class="${planningPersonId === person.id ? 'active' : ''}" style="--person:${person.colour}" data-planning-person="${person.id}" aria-pressed="${planningPersonId === person.id}"><i></i>${escapeHtml(person.name)}${person.id === session?.participantId ? ' (me)' : ''}</button>`).join('')}</div>`;
}

function renderParticipantChecks(container: HTMLElement, selectedIds?: string[]): void {
  const selected = selectedIds ?? trip!.participants.map(person => person.id);
  container.innerHTML = trip!.participants.map(person => `<label><input type="checkbox" name="participants" value="${person.id}" ${selected.includes(person.id) ? 'checked' : ''} />${avatar(person)}</label>`).join('');
}

function showToast(message: string): void {
  const element = $('#tp-toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { element.hidden = true; }, 2600);
}

function showDemoReadOnlyMessage(): void {
  const dialog = $<HTMLDialogElement>('#tp-demo-read-only-dialog');
  if (!dialog.open) dialog.showModal();
}

async function mutate(action: () => Promise<Trip>, message: string): Promise<void> {
  if (trip?.id === 'demo') {
    showDemoReadOnlyMessage();
    return;
  }
  try {
    $('#tp-saving').textContent = 'Saving…';
    trip = await action();
    if (session && !trip.participants.some(person => person.id === session!.participantId)) {
      const replacement = trip.participants[0];
      if (replacement) session = { tripId: trip.id, participantId: replacement.id, displayName: replacement.name };
    }
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
  return `<section class="tp-card-section tp-map-section" data-map-panel><div class="tp-card-section-heading"><h2>${escapeHtml(title)}</h2><p class="tp-map-detail">${escapeHtml(maps[0].detail)}</p></div><div class="tp-map-panel"><div class="tp-map-canvas" role="region" aria-label="${escapeHtml(title)}" data-map-sensitive="${Boolean(maps[0].sensitive)}" data-map-locations="${encoded(maps[0].locations)}" data-map-routes="${encoded(maps[0].routes ?? [])}"><p class="tp-map-loading">Loading map…</p></div>${legend}<div class="tp-map-switcher">${maps.map((map, index) => `<button class="${index === 0 ? 'active' : ''}" data-map-locations="${encoded(map.locations)}" data-map-routes="${encoded(map.routes ?? [])}" data-map-sensitive="${Boolean(map.sensitive)}" data-map-detail="${escapeHtml(map.detail)}">${escapeHtml(map.label)}</button>`).join('')}</div><a class="tp-geocoder-attribution" href="https://www.geoapify.com/" target="_blank" rel="noopener">Address search by Geoapify</a></div></section>`;
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
  return `<section class="tp-card-section tp-map-section tp-address-map" data-map-panel data-address-map data-map-storage-key="${escapeHtml(storageKey)}"><div class="tp-card-section-heading"><h2>Address map</h2><p class="tp-map-detail">${visiblePoints.length}/${points.length} people shown</p></div><div class="tp-map-panel"><div class="tp-map-canvas" role="region" aria-label="Address map" data-map-connect="false" data-map-sensitive="true" data-map-locations="${encoded(visiblePoints)}"><p class="tp-map-loading">Loading map…</p></div><div class="tp-map-switcher tp-person-map-toggles">${points.map(point => `<button class="${hiddenIds.includes(point.id) ? '' : 'active'}" type="button" style="--person:${point.colour}" data-map-person-id="${escapeHtml(point.id)}" data-map-person-point="${encoded(point)}" aria-pressed="${!hiddenIds.includes(point.id)}"><i></i>${escapeHtml(point.label!)}</button>`).join('')}</div><a class="tp-geocoder-attribution" href="https://www.geoapify.com/" target="_blank" rel="noopener">Address search by Geoapify</a></div></section>`;
}

function renderOverview(): string {
  const people = trip!.participants;
  if (itineraryPersonId && !people.some(person => person.id === itineraryPersonId)) itineraryPersonId = '';
  const availabilityDone = people.filter(person => trip!.availability.some(entry => entry.participantId === person.id && entry.status === 'available')).length;
  const isItineraryChoice = (status: TransportOption['status']) => status === 'selected' || status === 'booked';
  const isBooked = (option: { status: TransportOption['status']; bookingReference?: string }) => option.status === 'booked' || Boolean(option.bookingReference?.trim());
  const selectedTransport = trip!.transportOptions.filter(option => isItineraryChoice(option.status));
  const selectedStay = trip!.accommodationOptions.find(option => isItineraryChoice(option.status));
  const selectedActivities = trip!.activities.filter(option => isItineraryChoice(option.status));
  const itineraryTransport = trip!.transportOptions.filter(option => isItineraryChoice(option.status));
  const itineraryStays = trip!.accommodationOptions.filter(option => isItineraryChoice(option.status));
  const itineraryActivities = trip!.activities.filter(option => isItineraryChoice(option.status));
  const pollProgress = (options: { votes: Record<string, VoteValue>; participantIds?: string[] }[]) => {
    const eligiblePeople = options.length ? people.filter(person => options.some(option => isRelevantTo(option, person.id))) : people;
    const completed = eligiblePeople.filter(person => {
      const relevantOptions = options.filter(option => isRelevantTo(option, person.id));
      return relevantOptions.length > 0 && relevantOptions.every(option => Boolean(option.votes[person.id]));
    }).length;
    return { completed, total: eligiblePeople.length, done: options.length > 0 && eligiblePeople.length > 0 && completed === eligiblePeople.length };
  };
  const transportPoll = pollProgress(trip!.transportOptions);
  const accommodationPoll = pollProgress(trip!.accommodationOptions);
  const activityPoll = pollProgress(trip!.activities);
  const datesLabel = trip!.preferredDateRange
    ? `${date(trip!.preferredDateRange.start, { day: 'numeric', month: 'long' })}–${date(trip!.preferredDateRange.end, { day: 'numeric', month: 'long', year: 'numeric' })}`
    : `${trip!.availabilityRanges.length} candidate date range${trip!.availabilityRanges.length === 1 ? '' : 's'}`;
  const progressRows = [
    { title: 'Dates', view: 'availability', milestones: [
      { label: 'Potential dates added', done: trip!.availabilityRanges.length > 0 },
      { label: `Polling complete (${availabilityDone}/${people.length} completed)`, done: people.length > 0 && availabilityDone === people.length },
      { label: 'Dates locked in', done: Boolean(trip!.preferredDateRange) },
    ] },
    { title: 'Transport', view: 'transport', milestones: [
      { label: 'Options added', done: trip!.transportOptions.length > 0 },
      { label: `Polling complete (${transportPoll.completed}/${transportPoll.total} completed)`, done: transportPoll.done },
      { label: 'Transport booked', done: selectedTransport.length > 0 && selectedTransport.every(isBooked) },
    ] },
    { title: 'Accommodation', view: 'stays', milestones: [
      { label: 'Options added', done: trip!.accommodationOptions.length > 0 },
      { label: `Polling complete (${accommodationPoll.completed}/${accommodationPoll.total} completed)`, done: accommodationPoll.done },
      { label: 'Accommodation booked', done: Boolean(selectedStay && isBooked(selectedStay)) },
    ] },
    { title: 'Activities', view: 'activities', milestones: [
      { label: 'Ideas added', done: trip!.activities.length > 0 },
      { label: `Polling complete (${activityPoll.completed}/${activityPoll.total} completed)`, done: activityPoll.done },
      { label: 'Activities confirmed', done: selectedActivities.length > 0 },
    ] },
  ];
  const returnStart = itineraryStays.map(option => option.checkOut).filter(Boolean).sort()[0]
    ?? trip!.preferredDateRange?.end
    ?? trip!.dateRange.end;
  const visibleItineraryTransport = itineraryPersonId ? itineraryTransport.filter(option => option.participantIds.includes(itineraryPersonId)) : itineraryTransport;
  const peopleFor = (participantIds?: string[]) => participantIds === undefined ? people : people.filter(person => participantIds.includes(person.id));
  const transportItems = visibleItineraryTransport.map(option => ({ kind: 'transport' as const, when: option.departureAt, endWhen: option.arrivalAt, sortWhen: option.departureAt, icon: iconForMode[option.mode], title: option.title, booked: isBooked(option), detail: [isBooked(option) ? 'Booked' : 'Selected', [option.origin, option.destination].filter(Boolean).join(' → ')].filter(Boolean).join(' · '), people: peopleFor(option.participantIds), editAttribute: `data-edit-transport="${option.id}"` }));
  const accommodationItems = itineraryStays.filter(option => isRelevantTo(option, itineraryPersonId)).map(option => ({ kind: 'stay' as const, when: option.checkIn, endWhen: option.checkOut, sortWhen: option.checkIn, icon: '🏠', title: option.name, booked: isBooked(option), detail: [isBooked(option) ? 'Booked' : 'Selected', option.location].filter(Boolean).join(' · '), people: peopleFor(option.participantIds), editAttribute: `data-edit-stay="${option.id}"` }));
  const activityItems = itineraryActivities.filter(option => isRelevantTo(option, itineraryPersonId)).map(option => ({ kind: 'activity' as const, when: option.date ? `${option.date}T${option.time || '12:00'}` : '', sortWhen: option.date ? `${option.date}T${option.time || '12:00'}` : '', icon: '✦', title: option.name, booked: option.status === 'booked', detail: [option.status === 'booked' ? 'Booked' : 'Confirmed', option.location || option.category || ''].filter(Boolean).join(' · '), people: peopleFor(option.participantIds), editAttribute: `data-edit-activity="${option.id}"` }));
  const itineraryGroups = [
    { title: 'Journey there', empty: 'No outbound travel added yet.', items: transportItems.filter(item => !item.when || item.when.slice(0, 10) < returnStart) },
    { title: 'Accommodation', empty: 'No accommodation added yet.', items: accommodationItems },
    { title: 'Activities', empty: 'No activities added yet.', items: activityItems },
    { title: 'Journey back', empty: 'No return travel added yet.', items: transportItems.filter(item => item.when && item.when.slice(0, 10) >= returnStart) },
  ];
  itineraryGroups.forEach(group => group.items.sort((a, b) => (a.sortWhen || '9999').localeCompare(b.sortWhen || '9999')));
  type ItineraryItem = (typeof transportItems | typeof accommodationItems | typeof activityItems)[number];
  const renderItineraryItem = (item: ItineraryItem) => {
    const bookingStatus = item.booked ? 'Booked' : 'Selected, not booked';
    return `<article><span>${item.icon}</span><time>${item.when ? date(item.when, { weekday: 'short', day: 'numeric', month: 'short', hour: item.when.includes('T') ? '2-digit' : undefined, minute: item.when.includes('T') ? '2-digit' : undefined }) : 'Date not set'}</time><div><span class="tp-itinerary-title"><strong>${escapeHtml(item.title)}</strong><span class="tp-confirmation ${item.booked ? 'is-confirmed' : 'is-pending'}" role="img" tabindex="0" aria-label="${bookingStatus}" data-tooltip="${bookingStatus}" title="${bookingStatus}">${item.booked ? '✓' : '○'}</span></span><small>${escapeHtml(item.detail)}</small>${renderPersonChips(item.people)}</div><button class="tp-action-button tp-action-edit" type="button" ${item.editAttribute} aria-label="Edit ${escapeHtml(item.title)}">Edit</button></article>`;
  };
  const itineraryList = itineraryGroups.map(group => `<section class="tp-itinerary-group"><h3>${group.title}</h3>${group.items.length ? `<div>${group.items.map(renderItineraryItem).join('')}</div>` : `<p>${group.empty}</p>`}</section>`).join('');
  const calendarDates = range(trip!.preferredDateRange?.start ?? trip!.dateRange.start, trip!.preferredDateRange?.end ?? trip!.dateRange.end);
  const calendarEvents = [...transportItems, ...activityItems].filter(item => item.when?.includes('T'));
  const minutesFromMidnight = (value: string) => Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
  const rawCalendarEvents = calendarEvents.flatMap(item => {
    const dayIndex = calendarDates.indexOf(item.when.slice(0, 10));
    if (dayIndex < 0) return [];
    const start = minutesFromMidnight(item.when);
    const explicitEnd = 'endWhen' in item && item.endWhen?.slice(0, 10) === item.when.slice(0, 10) ? minutesFromMidnight(item.endWhen) : undefined;
    return [{ item, dayIndex, start, end: Math.max(explicitEnd ?? start + 90, start + 30), lane: 0, lanes: 1 }];
  });
  calendarDates.forEach((_, dayIndex) => {
    const dayEvents = rawCalendarEvents.filter(event => event.dayIndex === dayIndex).sort((a, b) => a.start - b.start || a.end - b.end);
    let cluster: typeof dayEvents = [];
    let clusterEnd = -1;
    const placeCluster = () => {
      const laneEnds: number[] = [];
      cluster.forEach(event => {
        const availableLane = laneEnds.findIndex(end => end <= event.start);
        event.lane = availableLane < 0 ? laneEnds.length : availableLane;
        laneEnds[event.lane] = event.end;
      });
      cluster.forEach(event => { event.lanes = laneEnds.length; });
    };
    dayEvents.forEach(event => {
      if (cluster.length && event.start >= clusterEnd) { placeCluster(); cluster = []; }
      cluster.push(event);
      clusterEnd = Math.max(clusterEnd, event.end);
    });
    if (cluster.length) placeCluster();
  });
  const earliestMinute = rawCalendarEvents.length ? Math.min(...rawCalendarEvents.map(event => event.start)) : 8 * 60;
  const latestMinute = rawCalendarEvents.length ? Math.max(...rawCalendarEvents.map(event => event.end)) : 20 * 60;
  const startHour = Math.max(0, Math.floor(earliestMinute / 60) - 1);
  const endHour = Math.min(24, Math.ceil(latestMinute / 60) + 1);
  const hourHeight = 56;
  const scheduleHeight = (endHour - startHour) * hourHeight;
  const hourLabels = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
  const minimumEventWidth = 92;
  const defaultDayWidth = 180;
  const dayLaneCounts = calendarDates.map((_, dayIndex) => Math.max(1, ...rawCalendarEvents.filter(event => event.dayIndex === dayIndex).map(event => event.lanes)));
  const dayWidths = dayLaneCounts.map(lanes => lanes > 2 ? lanes * minimumEventWidth : defaultDayWidth);
  const dayStarts = dayWidths.map((_, index) => dayWidths.slice(0, index).reduce((total, width) => total + width, 0));
  const dayColumns = dayWidths.map(width => `${width}px`).join(' ');
  const stayBars = accommodationItems.flatMap((item, row) => {
    const startIndex = Math.max(0, calendarDates.indexOf(item.when));
    const checkoutIndex = calendarDates.indexOf(item.endWhen);
    const endIndex = checkoutIndex < 0 ? calendarDates.length : Math.max(startIndex + 1, checkoutIndex);
    const span = Math.max(1, endIndex - startIndex);
    return [`<button class="tp-itinerary-stay-bar" style="grid-column:${startIndex + 1} / span ${span};grid-row:${row + 1}" ${item.editAttribute} title="${escapeHtml(item.detail)}"><span>${item.icon}</span><strong>${escapeHtml(item.title)}</strong><small>${date(item.when, { day: 'numeric', month: 'short' })}–${date(item.endWhen, { day: 'numeric', month: 'short' })}</small></button>`];
  }).join('');
  const timedEvents = rawCalendarEvents.map(event => {
    const laneWidth = dayWidths[event.dayIndex] / event.lanes;
    const left = dayStarts[event.dayIndex] + event.lane * laneWidth;
    const width = laneWidth - 6;
    const top = (event.start - startHour * 60) / 60 * hourHeight;
    const height = Math.max(38, (event.end - event.start) / 60 * hourHeight);
    const endLabel = `${String(Math.floor(event.end / 60) % 24).padStart(2, '0')}:${String(event.end % 60).padStart(2, '0')}`;
    const densityClass = event.lanes > 2 ? ' is-dense' : event.lanes > 1 ? ' is-compact' : '';
    return `<button class="tp-itinerary-timed-event tp-calendar-${event.item.kind}${densityClass}" style="left:${left + 3}px;width:${width}px;top:${top}px;height:${height}px" ${event.item.editAttribute} aria-label="Edit ${escapeHtml(event.item.title)}"><span>${event.item.icon} ${date(event.item.when, { hour: '2-digit', minute: '2-digit' })}–${endLabel}</span><strong>${escapeHtml(event.item.title)}</strong><small>${escapeHtml(event.item.detail.replace(/^(Booked|Selected|Confirmed) · /, ''))}</small>${height >= 82 ? renderPersonChips(event.item.people) : ''}</button>`;
  }).join('');
  const itineraryCalendar = `<div class="tp-itinerary-calendar-scroll"><div class="tp-itinerary-schedule" style="--hour-height:${hourHeight}px;grid-template-columns:58px ${dayColumns}"><div class="tp-schedule-corner"></div>${calendarDates.map(day => `<div class="tp-schedule-day-head"><span>${date(day, { weekday: 'short' })}</span><strong>${date(day, { day: 'numeric', month: 'short' })}</strong></div>`).join('')}<div class="tp-schedule-all-day-label">Stay</div><div class="tp-schedule-all-day" style="grid-template-columns:${dayColumns}">${stayBars || '<span class="tp-schedule-empty">No accommodation</span>'}</div><div class="tp-schedule-time-axis" style="height:${scheduleHeight}px">${hourLabels.map(hour => `<span style="top:${(hour - startHour) * hourHeight}px">${String(hour).padStart(2, '0')}:00</span>`).join('')}</div><div class="tp-schedule-time-grid" style="height:${scheduleHeight}px"><div class="tp-schedule-day-lines" style="grid-template-columns:${dayColumns}">${calendarDates.map(() => '<i></i>').join('')}</div>${timedEvents}</div></div></div>`;
  const itineraryContent = itineraryLayout === 'calendar' ? itineraryCalendar : `<div class="tp-itinerary-groups">${itineraryList}</div>`;
  const itineraryFilters = `<div class="tp-itinerary-toolbar"><div class="tp-itinerary-filter" aria-label="Filter itinerary by traveller"><button class="${itineraryPersonId ? '' : 'active'}" data-itinerary-person="" aria-pressed="${!itineraryPersonId}">Everyone</button>${people.map(person => `<button class="${itineraryPersonId === person.id ? 'active' : ''}" style="--person:${person.colour}" data-itinerary-person="${person.id}" aria-pressed="${itineraryPersonId === person.id}"><i></i>${escapeHtml(person.name)}</button>`).join('')}</div><div class="tp-itinerary-layout-toggle" aria-label="Itinerary view"><button class="${itineraryLayout === 'list' ? 'active' : ''}" data-itinerary-layout="list" aria-pressed="${itineraryLayout === 'list'}">☷ List</button><button class="${itineraryLayout === 'calendar' ? 'active' : ''}" data-itinerary-layout="calendar" aria-pressed="${itineraryLayout === 'calendar'}">▦ Calendar</button></div></div>`;
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
  return `${sectionHeading('', 'Overview', '')}<section class="tp-hero-card"><button class="tp-action-button tp-action-edit tp-hero-edit" id="tp-edit-trip" type="button">Edit</button><div class="tp-hero-copy"><h1>${escapeHtml(trip!.title)}</h1><h2>${escapeHtml(trip!.destination)}</h2><p>${datesLabel}</p></div><div class="tp-hero-people">${renderPersonChips(people, 'tp-person-chip-row-on-dark')}</div></section>
    <section class="tp-process"><h2>Trip progress</h2><div>${progressRows.map(row => `<button class="tp-progress-row" data-view="${row.view}"><strong>${escapeHtml(row.title)}</strong><span class="tp-progress-milestones">${row.milestones.map(milestone => `<span class="tp-progress-milestone ${milestone.done ? 'is-done' : ''}"><i>${milestone.done ? '✓' : ''}</i><small>${escapeHtml(milestone.label)}</small></span>`).join('')}</span><b>›</b></button>`).join('')}</div></section>
    <section class="tp-card-section"><h2>Itinerary</h2><div class="tp-itinerary">${itineraryFilters}${itineraryContent}</div></section>${renderMapPanel('Journey map', journeyMaps)}`;
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
    const bedLabels: Record<string, string> = { 'own-bed': 'own bed', 'share-anyone': 'share with anyone', 'share-women': 'share with women', 'share-men': 'share with men' };
    const selectedPeople = person.sleepingPreferences.shareWithParticipantIds.filter(id => id !== linkedPartner?.id).map(id => people.find(candidate => candidate.id === id)?.name).filter(Boolean);
    const bedPreference = [
      ...person.sleepingPreferences.bedPreferences.map(preference => bedLabels[preference]),
      ...(selectedPeople.length ? [`share with ${selectedPeople.join(', ')}`] : []),
      ...(linkedPartner ? [`partner: ${linkedPartner.name}`] : []),
    ].filter(Boolean).join('; ') || 'Not specified';
    return `<article class="tp-person-card"><div class="tp-person-title">${avatar(person)}<div class="tp-card-actions"><button class="tp-action-button tp-action-edit" type="button" data-edit-person="${person.id}">Edit</button>${people.length > 1 ? `<button class="tp-action-button tp-action-delete" type="button" data-remove-person="${person.id}">Delete</button>` : ''}</div></div><dl><div><dt>Address</dt><dd>${escapeHtml(person.origin || 'Not set')}</dd></div><div><dt>Room preference</dt><dd>${escapeHtml(roomPreference)}</dd></div><div><dt>Bed preference</dt><dd>${escapeHtml(bedPreference)}</dd></div></dl><div class="tp-bag-chips">${person.baggage.length ? person.baggage.map(item => `<span>${escapeHtml(item.label)}${item.weightKg ? ` · ${item.weightKg} kg` : ''}${item.lengthCm ? ` · ${[item.lengthCm, item.widthCm, item.heightCm].filter(Boolean).join('×')} cm` : ''}</span>`).join('') : '<span class="is-empty">No bags added</span>'}</div></article>`;
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
  const rangeEditControls = (candidate: Trip['availabilityRanges'][number], allowRemove: boolean) =>
    `<div class="tp-range-controls"><button class="tp-action-button tp-action-edit" data-edit-range="${candidate.id}" aria-label="Edit date option">Edit</button>${allowRemove ? `<button class="tp-action-button tp-action-delete" data-remove-range="${candidate.id}" aria-label="Delete date option">Delete</button>` : ''}</div>`;
  const rangeLockControl = (candidate: Trip['availabilityRanges'][number]) => {
    const preferred = trip!.preferredDateRange?.start === candidate.start && trip!.preferredDateRange?.end === candidate.end;
    return `<button class="tp-preferred-chip ${preferred ? 'is-selected' : ''}" data-prefer-range="${candidate.id}" aria-pressed="${preferred}" ${preferred ? 'disabled' : ''}>${preferred ? 'Dates locked in' : 'Lock in dates'}</button>`;
  };
  if (trip!.availabilityRanges.length > 1) {
    const rangeAvailable = (participantId: string, start: string, end: string) => trip!.availability.some(entry => entry.participantId === participantId && entry.status === 'available' && entry.date >= start && entry.date <= end);
    const options = trip!.availabilityRanges;
    const poll = `<section class="tp-panel tp-calendar-panel"><div class="tp-calendar-scroll"><div class="tp-range-poll" style="--options:${options.length + 1}"><div class="tp-calendar-corner">Traveller</div>${options.map((candidate, index) => { const everyone = trip!.participants.length > 0 && trip!.participants.every(person => rangeAvailable(person.id, candidate.start, candidate.end)); return `<div class="tp-range-option ${everyone ? 'all-available' : ''}"><small>Option ${index + 1}</small><div class="tp-option-dates"><time><span>Start</span><strong>${date(candidate.start, { day: 'numeric', month: 'short' })}</strong></time><i>→</i><time><span>End</span><strong>${date(candidate.end, { day: 'numeric', month: 'short' })}</strong></time></div>${everyone ? '<b>Everyone ✓</b>' : ''}${rangeEditControls(candidate, true)}</div>`; }).join('')}<div class="tp-calendar-add-option"><button class="tp-button tp-button-quiet" id="tp-add-range">+ Add date range</button></div>${trip!.participants.map(person => `<div class="tp-calendar-person">${avatar(person)}</div>${options.map(candidate => { const available = rangeAvailable(person.id, candidate.start, candidate.end); return `<button class="tp-availability-cell tp-binary-cell ${available ? 'available' : 'unavailable'}" data-range-start="${candidate.start}" data-range-end="${candidate.end}" data-person="${person.id}" aria-label="${escapeHtml(person.name)}: ${date(candidate.start)} to ${date(candidate.end)} — ${available ? 'available' : 'not available'}"><span>${available ? '✓' : ''}</span></button>`; }).join('')}<div class="tp-calendar-spacer"></div>`).join('')}<div class="tp-calendar-person tp-calendar-add-person"><button id="tp-add-person">+ Add person</button></div>${options.map(candidate => `<div class="tp-range-lock-cell">${rangeLockControl(candidate)}</div>`).join('')}<div class="tp-calendar-spacer"></div></div></div></section>`;
    return `${sectionHeading('', 'Availability', '')}${poll}`;
  }
  const calendars = trip!.availabilityRanges.map((candidate, rangeIndex) => {
    const candidateDays = range(candidate.start, candidate.end);
    const preferred = trip!.preferredDateRange?.start === candidate.start && trip!.preferredDateRange?.end === candidate.end;
    return `<section class="tp-range-section"><div class="tp-range-head"><div><p class="tp-eyebrow">Option ${rangeIndex + 1}${preferred ? ' · Locked in' : ''}</p><h2>${date(candidate.start, { day: 'numeric', month: 'long' })}–${date(candidate.end, { day: 'numeric', month: 'long', year: 'numeric' })}</h2></div><div>${rangeEditControls(candidate, trip!.availabilityRanges.length > 1)}<button class="tp-button tp-button-quiet" id="tp-add-range">+ Add date range</button></div></div><section class="tp-panel tp-calendar-panel"><div class="tp-calendar-scroll"><div class="tp-calendar" style="--days:${candidateDays.length}"><div class="tp-calendar-corner">Traveller</div>${candidateDays.map(day => { const everyone = trip!.participants.length > 0 && trip!.participants.every(person => isAvailable(person.id, day)); return `<div class="tp-day-head ${everyone ? 'all-available' : ''}"><span>${date(day, { weekday: 'short' })}</span><strong>${date(day, { day: 'numeric' })}</strong>${everyone ? '<b>Everyone ✓</b>' : ''}</div>`; }).join('')}${trip!.participants.map(person => `<div class="tp-calendar-person">${avatar(person)}</div>${candidateDays.map(day => { const available = isAvailable(person.id, day); return `<button class="tp-availability-cell tp-binary-cell ${available ? 'available' : 'unavailable'}" data-date="${day}" data-person="${person.id}" data-slot="all-day" aria-label="${escapeHtml(person.name)}: ${date(day)} — ${available ? 'available' : 'not available'}"><span>${available ? '✓' : ''}</span></button>`; }).join('')}`).join('')}<div class="tp-calendar-person tp-calendar-add-person"><button id="tp-add-person">+ Add person</button></div><div class="tp-calendar-row-tail" style="grid-column: span ${candidateDays.length}"></div></div></div><div class="tp-range-footer">${rangeLockControl(candidate)}</div></section></section>`;
  }).join('');
  return `${sectionHeading('', 'Availability', '')}${calendars}`;
}

function baggageRuleFor(option: TransportOption, item: BaggageItem) {
  if (item.category === 'personal' || item.category === 'cabin') return undefined;
  return option.baggageRules.find(rule => item.category === 'ski' || item.category === 'sports' ? /sport/i.test(rule.label) : /checked|bag/i.test(rule.label));
}

function renderTransport(): string {
  const allOptions = [...trip!.transportOptions].sort((a, b) => a.departureAt.localeCompare(b.departureAt));
  const options = allOptions.filter(option => isRelevantTo(option, planningPersonId));
  const content = options.length ? `<div class="tp-timeline">${options.map(option => {
    const people = option.participantIds.map(id => trip!.participants.find(person => person.id === id)).filter((person): person is Participant => Boolean(person));
    const baggage = people.flatMap(person => person.baggage.map(item => ({ person, item, rule: baggageRuleFor(option, item) })));
    const baggageTotal = baggage.reduce((total, row) => total + (row.rule?.price ?? 0), 0);
    const ownVote = option.votes[session!.participantId];
    const route = option.origin || option.destination ? `<div class="tp-route"><div><strong>${option.departureAt ? date(option.departureAt, { hour: '2-digit', minute: '2-digit' }) : '—'}</strong><span>${escapeHtml(option.origin || 'From not added')}</span></div><i></i><div><strong>${option.arrivalAt ? date(option.arrivalAt, { hour: '2-digit', minute: '2-digit' }) : '—'}</strong><span>${escapeHtml(option.destination || 'To not added')}</span></div></div>` : '';
    const priceDetail = baggageTotal ? `+ ${money(baggageTotal / Math.max(people.length, 1), option.currency)} average baggage` : option.pricePerPerson ? 'No paid bags matched' : 'Price not added';
    const capacityWarning = option.mode === 'car' && option.seats && people.length > option.seats
      ? `<p class="tp-capacity-warning">${people.length} travellers for ${option.seats} seats — this car is over capacity.</p>`
      : option.mode === 'car' && option.seats ? `<p class="tp-seat-count">${option.seats} seat${option.seats === 1 ? '' : 's'}</p>` : '';
    const actions = `<div class="tp-option-actions"><button class="tp-button ${option.status === 'selected' ? 'tp-button-quiet' : 'tp-button-primary'}" data-select-transport="${option.id}">${option.status === 'selected' ? 'Unselect' : 'Select option'}</button><button class="tp-action-button tp-action-edit" data-edit-transport="${option.id}">Edit</button><button class="tp-action-button tp-action-delete" data-remove-transport="${option.id}">Delete</button></div>`;
    return `<article class="tp-transport-card"><div class="tp-mode-icon">${iconForMode[option.mode]}</div><div class="tp-transport-main"><div class="tp-card-topline"><span class="tp-status-pill tp-status-${option.status}">${option.status}</span>${option.operator ? `<span>${escapeHtml(option.operator)}</span>` : ''}</div><p class="tp-transport-date">${dateOr(option.departureAt, 'Date not added', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p><div class="tp-transport-heading"><h2>${escapeHtml(option.title)}</h2><div class="tp-transport-price"><strong>${option.pricePerPerson ? money(option.pricePerPerson, option.currency) : '—'}</strong><span>per person · ${priceDetail}</span></div></div>${route}${capacityWarning}${renderPersonChips(people)}${option.bookingReference ? `<p class="tp-booking-ref">Booking reference: <strong>${escapeHtml(option.bookingReference)}</strong></p>` : ''}</div><div class="tp-option-poll">${renderVoteChart(option)}<div class="tp-vote-buttons"><button data-transport="${option.id}" data-transport-vote="first-choice" class="${ownVote === 'first-choice' ? 'active' : ''}">Love it</button><button data-transport="${option.id}" data-transport-vote="acceptable" class="${ownVote === 'acceptable' ? 'active' : ''}">Works</button><button data-transport="${option.id}" data-transport-vote="unacceptable" class="${ownVote === 'unacceptable' ? 'active' : ''}">No</button></div>${actions}</div>${option.mode === 'flight' ? `<details class="tp-baggage"><summary>Baggage comparison <span>${baggage.length} item${baggage.length === 1 ? '' : 's'}</span></summary><div class="tp-baggage-rows">${baggage.length ? baggage.map(row => `<div>${avatar(row.person)}<span>${escapeHtml(row.item.label)} · ${row.item.weightKg} kg</span><strong>${row.rule ? money(row.rule.price, row.rule.currency) : 'Included / check'}</strong></div>`).join('') : '<p>Add baggage on the People screen first.</p>'}</div>${option.baggageRules[0] ? `<div class="tp-sources"><a href="${option.baggageRules[0].sourceUrl}" target="_blank" rel="noopener">Official baggage rules ↗</a> · manually checked</div>` : ''}</details>` : ''}</article>`;
  }).join('')}</div>` : allOptions.length ? '<section class="tp-filter-empty"><p>No transport options involve this traveller.</p></section>' : emptyState('✈', 'No routes yet', 'Add a flight, train, coach, car or ferry. Assign the people taking it and enter operator baggage prices.', 'Add first transport option', 'id="tp-add-transport"');
  const addButton = '<button class="tp-button tp-button-primary" data-add-transport>+ Add transport</button>';
  return `${sectionHeading('', 'Transport', '', allOptions.length ? addButton : '')}${allOptions.length ? renderPlanningPersonFilter('transport') : ''}${content}${allOptions.length ? `<div class="tp-page-add-action">${addButton}</div>` : ''}`;
}

function countVotes(option: { votes: Record<string, VoteValue> }, vote: VoteValue): number { return Object.values(option.votes).filter(value => value === vote).length; }

function renderVoteChart(option: { votes: Record<string, VoteValue> }): string {
  const results = [
    { key: 'first-choice' as const, label: 'Love it', className: 'is-love' },
    { key: 'acceptable' as const, label: 'Works', className: 'is-works' },
    { key: 'unacceptable' as const, label: 'No', className: 'is-no' },
  ].map(result => ({ ...result, count: countVotes(option, result.key) }));
  const total = results.reduce((sum, result) => sum + result.count, 0);
  const summary = results.map(result => `${result.label}: ${result.count}`).join(', ');
  return `<div class="tp-vote-chart" role="img" aria-label="Votes — ${summary}"><div class="tp-vote-bar">${results.map(result => `<span class="${result.className}" style="--votes:${total ? result.count / total : 0}" title="${result.label}: ${result.count}"></span>`).join('')}</div><div class="tp-vote-legend">${results.map(result => `<span class="${result.className}"><i></i>${result.label}<b>${result.count}</b></span>`).join('')}</div></div>`;
}

function allowsDoubleShare(person: Participant, other: Participant): boolean {
  const preferences = person.sleepingPreferences;
  if (person.goWithFlow || preferences.shareWithParticipantIds.includes(other.id)) return true;
  if (preferences.bedPreferences.includes('share-anyone')) return true;
  if (other.sex === 'female' && preferences.bedPreferences.includes('share-women')) return true;
  if (other.sex === 'male' && preferences.bedPreferences.includes('share-men')) return true;
  return false;
}

function needsPrivateRoom(person: Participant): boolean {
  return person.sleepingPreferences.ownRoom === 'required'
    || person.sleepingPreferences.roomPreferences.includes('require-own');
}

function canShareDouble(first: Participant, second: Participant): boolean {
  return !needsPrivateRoom(first) && !needsPrivateRoom(second)
    && allowsDoubleShare(first, second) && allowsDoubleShare(second, first);
}

function assignPeopleToBeds(rooms: Room[], people: Participant[]): Map<string, Participant[]> {
  const bedAssignments = new Map(rooms.flatMap(room => room.beds).map(bed => [bed.id, [] as Participant[]]));
  const assignedPeople = new Set<string>();
  const doubleBeds = rooms.flatMap(room => room.beds).filter(bed => bed.type === 'double' || bed.type === 'king');

  for (const person of people) {
    if (assignedPeople.has(person.id)) continue;
    const partner = people.find(candidate => candidate.id === person.sleepingPreferences.shareDoubleWithParticipantId)
      ?? people.find(candidate => candidate.sleepingPreferences.shareDoubleWithParticipantId === person.id);
    const bed = partner && !assignedPeople.has(partner.id)
      ? doubleBeds.find(candidate => !(bedAssignments.get(candidate.id)?.length))
      : undefined;
    if (!partner || !bed) continue;
    bedAssignments.set(bed.id, [person, partner]);
    assignedPeople.add(person.id);
    assignedPeople.add(partner.id);
  }

  for (const bed of doubleBeds.filter(candidate => !(bedAssignments.get(candidate.id)?.length))) {
    const availablePeople = people.filter(person => !assignedPeople.has(person.id));
    let pair: [Participant, Participant] | undefined;
    for (let firstIndex = 0; firstIndex < availablePeople.length && !pair; firstIndex += 1) {
      const first = availablePeople[firstIndex]!;
      const second = availablePeople.slice(firstIndex + 1).find(candidate => canShareDouble(first, candidate));
      if (second) pair = [first, second];
    }
    if (!pair) continue;
    bedAssignments.set(bed.id, pair);
    assignedPeople.add(pair[0].id);
    assignedPeople.add(pair[1].id);
  }

  const remainingPeople = people.filter(person => !assignedPeople.has(person.id)).sort((a, b) => {
    const priority = (person: Participant) => person.sleepingPreferences.ownRoom === 'required' ? 2 : 0;
    return priority(b) - priority(a);
  });
  for (const person of remainingPeople) {
    const availableBeds = rooms.flatMap(room => room.beds.map(bed => ({ bed, room })))
      .filter(({ bed, room }) => {
        if (bedAssignments.get(bed.id)?.length) return false;
        const roomOccupants = room.beds.flatMap(candidate => bedAssignments.get(candidate.id) ?? []);
        if (roomOccupants.some(needsPrivateRoom)) return false;
        if (needsPrivateRoom(person) && roomOccupants.length) return false;
        return true;
      })
      .sort((a, b) => {
        const suitability = ({ bed, room }: { bed: Room['beds'][number]; room: Room }) =>
          (bed.type === 'sofa-bed' ? -4 : 0)
          + (person.sleepingPreferences.ownRoom === 'required' && room.beds.length === 1 ? 3 : 0);
        return suitability(b) - suitability(a);
      });
    const nextBed = availableBeds[0]?.bed;
    if (!nextBed) continue;
    bedAssignments.set(nextBed.id, [person]);
    assignedPeople.add(person.id);
  }

  return bedAssignments;
}

function unassignedBedReason(person: Participant, rooms: Room[], assignments: Map<string, Participant[]>): string {
  const bedRows = rooms.flatMap(room => room.beds.map(bed => ({ bed, room, occupants: assignments.get(bed.id) ?? [] })));
  const spareDoubles = bedRows.filter(({ bed, occupants }) => (bed.type === 'double' || bed.type === 'king') && occupants.length > 0 && occupants.length < bed.sleeps);
  if (spareDoubles.length) {
    const occupantNames = [...new Set(spareDoubles.flatMap(({ occupants }) => occupants.map(occupant => occupant.name)))];
    if (needsPrivateRoom(person)) return `${person.name} needs a private room; the remaining ${spareDoubles.length === 1 ? 'space is' : 'spaces are'} in an occupied double bed.`;
    const hasSharingPreference = person.goWithFlow
      || person.sleepingPreferences.shareWithParticipantIds.length > 0
      || person.sleepingPreferences.bedPreferences.some(preference => preference.startsWith('share-'));
    if (!hasSharingPreference) return `${person.name} wants their own bed; the remaining ${spareDoubles.length === 1 ? 'space is' : 'spaces are'} in an occupied double bed.`;
    return `${person.name} and ${occupantNames.join(' / ')} do not have mutually compatible double-sharing preferences, so the remaining ${spareDoubles.length === 1 ? 'space cannot' : 'spaces cannot'} be used.`;
  }
  const unusedSofaBeds = bedRows.filter(({ bed, occupants }) => bed.type === 'sofa-bed' && !occupants.length);
  if (unusedSofaBeds.length) return `Only a sofa bed remains for ${person.name}; check their room and sharing requirements.`;
  const declaredSpaces = bedRows.reduce((total, { bed }) => total + bed.sleeps, 0);
  const assignedSpaces = bedRows.reduce((total, { occupants }) => total + occupants.length, 0);
  if (declaredSpaces > assignedSpaces) return `${person.name} is unassigned because the remaining advertised sleeping space does not match their preferences.`;
  return `No sleeping space remains for ${person.name}.`;
}

function renderRoomPlan(rooms: Room[], people: Participant[]): string {
  const assignments = assignPeopleToBeds(rooms, people);
  const assignedIds = new Set([...assignments.values()].flat().map(person => person.id));
  const unassigned = people.filter(person => !assignedIds.has(person.id));
  const roomCards = rooms.map(room => `<section class="tp-room-plan"><div class="tp-room-plan-title"><strong>${escapeHtml(room.name)}</strong><small>${room.private ? 'Private room' : 'Shared space'}</small></div><div class="tp-room-beds">${room.beds.length ? room.beds.map(bed => {
    const occupants = assignments.get(bed.id) ?? [];
    const bedLabel = bed.type.replace('-', ' ');
    const bedDescription = bedLabel.endsWith('bed') ? bedLabel : `${bedLabel} bed`;
    const occupantNames = occupants.length ? occupants.map(person => person.name).join(' and ') : 'Unassigned';
    const sizeClass = bed.type === 'double' || bed.type === 'king' ? 'is-double' : 'is-single';
    return `<span class="tp-bed"><span class="tp-bed-icon ${sizeClass}" role="img" aria-label="${escapeHtml(`${bedDescription}: ${occupantNames}`)}" title="${escapeHtml(occupantNames)}"><span class="tp-bed-people">${occupants.map(person => `<i style="--person:${person.colour}">${escapeHtml(person.initials)}</i>`).join('')}</span></span><small>${escapeHtml(bedLabel)}</small></span>`;
  }).join('') : '<span class="tp-no-beds">No beds added</span>'}</div></section>`).join('');
  const warning = unassigned.length ? `<div class="tp-room-plan-warning"><strong>Bed assignment issue</strong>${unassigned.map(person => `<p>${escapeHtml(unassignedBedReason(person, rooms, assignments))}</p>`).join('')}</div>` : '';
  return `<div class="tp-room-plan-list"><p class="tp-room-plan-intro">Suggested room plan based on sleeping preferences</p>${roomCards}${warning}</div>`;
}

function renderStays(): string {
  if (!trip!.accommodationOptions.length) return `${sectionHeading('', 'Stays', '')}${emptyState('🏠', 'No accommodation yet', 'Add a hotel, house, hostel, campsite or any other option.', 'Add first accommodation', 'id="tp-add-stay"')}`;
  const options = trip!.accommodationOptions.filter(option => isRelevantTo(option, planningPersonId));
  const content = options.length ? `<div class="tp-stay-grid">${options.map(option => {
    const ownVote = option.votes[session!.participantId];
    const relevantPeople = option.participantIds === undefined ? trip!.participants : trip!.participants.filter(person => option.participantIds!.includes(person.id));
    const pricePerPerson = option.priceTotal ? money(option.priceTotal / Math.max(relevantPeople.length, 1), option.currency) : '—';
    const roomPlan = option.rooms.length ? renderRoomPlan(option.rooms, relevantPeople) : '';
    const listingButton = option.sourceUrl ? `<a class="tp-listing-icon" href="${option.sourceUrl}" target="_blank" rel="noopener" aria-label="Open listing for ${escapeHtml(option.name)}" title="Open listing">↗</a>` : '';
    const chooseButton = option.status === 'selected' ? '' : `<button class="tp-button tp-button-primary tp-stay-choose" data-select-stay="${option.id}">Choose</button>`;
    return `<article class="tp-stay-card ${option.status === 'selected' ? 'is-selected' : ''}"><div class="tp-stay-image tp-stay-image-${option.fitLevel}"><div class="tp-stay-header-actions"><button class="tp-action-button tp-action-edit" type="button" data-edit-stay="${option.id}">Edit</button><button class="tp-action-button tp-action-delete" type="button" data-remove-stay="${option.id}">Delete</button></div><span>${option.status === 'selected' ? 'Selected stay' : escapeHtml(option.platform || 'Accommodation')}</span><strong class="tp-stay-price">${pricePerPerson}<small>per person</small></strong></div><div class="tp-stay-body"><div class="tp-panel-head"><div class="tp-stay-heading"><div class="tp-stay-title-row"><h2>${escapeHtml(option.name)}</h2>${listingButton}</div><p>${escapeHtml(option.location || 'Location not added')}</p></div><span class="tp-fit tp-fit-${option.fitLevel}">${option.fitLevel}</span></div>${roomPlan}${renderPersonChips(relevantPeople)}<p class="tp-fit-copy">${escapeHtml(option.fitSummary)}</p>${option.bookingReference ? `<p class="tp-booking-ref">Booking reference: <strong>${escapeHtml(option.bookingReference)}</strong></p>` : ''}${option.siteDistances.length ? `<div class="tp-site-distances">${option.siteDistances.map(item => `<span>${escapeHtml(item.site)} <b>${item.minutes} min</b></span>`).join('')}</div>` : ''}${renderVoteChart(option)}<div class="tp-vote-buttons" role="group" aria-label="Your vote for ${escapeHtml(option.name)}"><button data-accommodation="${option.id}" data-vote="first-choice" class="${ownVote === 'first-choice' ? 'active' : ''}">Love it</button><button data-accommodation="${option.id}" data-vote="acceptable" class="${ownVote === 'acceptable' ? 'active' : ''}">Works</button><button data-accommodation="${option.id}" data-vote="unacceptable" class="${ownVote === 'unacceptable' ? 'active' : ''}">No</button></div>${chooseButton}</div></article>`;
  }).join('')}</div>` : '<section class="tp-filter-empty"><p>No accommodation options involve this traveller.</p></section>';
  return `${sectionHeading('', 'Stays', '', '<button class="tp-button tp-button-primary" id="tp-add-stay">+ Add accommodation</button>')}${renderPlanningPersonFilter('accommodation')}${content}`;
}

function renderActivities(): string {
  if (!trip!.activities.length) return `${sectionHeading('', 'Activities', '')}${emptyState('✦', 'No activity ideas yet', 'Suggest anything the group could do, then vote together.', 'Add first activity', 'id="tp-add-activity"')}`;
  const options = trip!.activities.filter(option => isRelevantTo(option, planningPersonId));
  const content = options.length ? `<div class="tp-activity-grid">${options.map(option => {
    const ownVote = option.votes[session!.participantId];
    const relevantPeople = option.participantIds === undefined ? trip!.participants : trip!.participants.filter(person => option.participantIds!.includes(person.id));
    return `<article class="tp-activity-card ${option.status === 'selected' ? 'is-selected' : ''}"><div class="tp-panel-head"><div><span class="tp-activity-category">${escapeHtml(option.category || 'Activity')}</span><h2>${escapeHtml(option.name)}</h2><p>${escapeHtml(option.location || 'Location not added')}</p></div><div class="tp-card-actions"><button class="tp-action-button tp-action-edit" data-edit-activity="${option.id}">Edit</button><button class="tp-action-button tp-action-delete" data-remove-activity="${option.id}">Delete</button></div></div><div class="tp-activity-meta">${option.date ? `<span>📅 ${date(option.date, { weekday: 'short', day: 'numeric', month: 'short' })}${option.time ? ` · ${escapeHtml(option.time)}` : ''}</span>` : ''}${option.costPerPerson ? `<span>${money(option.costPerPerson, option.currency)} per person</span>` : ''}</div>${renderPersonChips(relevantPeople)}${option.notes ? `<p>${escapeHtml(option.notes)}</p>` : ''}${option.sourceUrl ? `<a href="${option.sourceUrl}" target="_blank" rel="noopener">Open link ↗</a>` : ''}${renderVoteChart(option)}<div class="tp-vote-buttons"><button data-activity="${option.id}" data-activity-vote="first-choice" class="${ownVote === 'first-choice' ? 'active' : ''}">Love it</button><button data-activity="${option.id}" data-activity-vote="acceptable" class="${ownVote === 'acceptable' ? 'active' : ''}">Works</button><button data-activity="${option.id}" data-activity-vote="unacceptable" class="${ownVote === 'unacceptable' ? 'active' : ''}">No</button></div><button class="tp-button ${option.status === 'selected' ? 'tp-button-quiet' : 'tp-button-primary'}" data-select-activity="${option.id}">${option.status === 'selected' ? 'Remove from itinerary' : 'Add to itinerary'}</button></article>`;
  }).join('')}</div>` : '<section class="tp-filter-empty"><p>No activities involve this traveller.</p></section>';
  return `${sectionHeading('', 'Activities', '', '<button class="tp-button tp-button-primary" id="tp-add-activity">+ Add activity</button>')}${renderPlanningPersonFilter('activities')}${content}`;
}

function render(): void {
  if (!trip || !session) return;
  $('#tp-app').classList.toggle('tp-read-only', !canEdit && trip.id !== 'demo');
  $('#tp-title').textContent = trip.title;
  $('#tp-subtitle').textContent = `${date(trip.availabilityWindow.start)}–${date(trip.availabilityWindow.end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const views: Record<View, () => string> = { overview: renderOverview, people: renderPeople, availability: renderAvailability, transport: renderTransport, stays: renderStays, activities: renderActivities };
  $('#tp-content').innerHTML = views[activeView]();
  window.dispatchEvent(new CustomEvent('trip-planner:maps-rendered'));
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.setAttribute('aria-current', button.dataset.view === activeView ? 'page' : 'false'));
}

function setView(view: View): void { activeView = view; render(); $('#tp-content').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function closeDialogs(): void { document.querySelectorAll<HTMLDialogElement>('.tp-dialog[open]').forEach(dialog => dialog.close()); }

function openDeletePersonDialog(person: Participant): void {
  const dialog = $<HTMLDialogElement>('#tp-delete-person-dialog');
  dialog.dataset.personId = person.id;
  $('#tp-delete-person-name').textContent = person.name;
  if (!dialog.open) dialog.showModal();
}

async function confirmPersonDeletion(): Promise<void> {
  if (personDeletionPending) return;
  const dialog = $<HTMLDialogElement>('#tp-delete-person-dialog');
  const person = trip?.participants.find(candidate => candidate.id === dialog.dataset.personId);
  if (!person || !trip) return;
  const button = $<HTMLButtonElement>('#tp-confirm-delete-person');
  personDeletionPending = true;
  button.disabled = true;
  dialog.close();
  delete dialog.dataset.personId;
  try {
    await mutate(() => repository.removeParticipant(trip!.id, person.id), `${person.name} deleted.`);
  } finally {
    personDeletionPending = false;
    button.disabled = false;
  }
}

function addPermissionRow(permission?: TripPermission): void {
  $('#tp-permission-list').insertAdjacentHTML('beforeend', `<div class="tp-permission-row"><input type="email" name="permissionEmail" placeholder="friend@example.com" value="${escapeHtml(permission?.email ?? '')}" /><select name="permissionRole"><option value="viewer" ${permission?.role === 'viewer' ? 'selected' : ''}>Viewer</option><option value="editor" ${permission?.role === 'editor' ? 'selected' : ''}>Editor</option></select><button class="tp-icon-button" type="button" data-remove-permission aria-label="Remove permission">×</button></div>`);
}

function renderTripAccessSettings(): void {
  $('#tp-trip-access-settings').hidden = true;
}

async function saveAccessSettings(): Promise<void> {
  if (!trip) return;
  const form = $<HTMLFormElement>('#tp-trip-form');
  const mode = (form.elements.namedItem('accessMode') as RadioNodeList).value as 'public-link' | 'restricted';
  const rows = [...form.querySelectorAll<HTMLElement>('.tp-permission-row')];
  const permissions = rows.map(row => ({
    email: row.querySelector<HTMLInputElement>('[name="permissionEmail"]')!.value,
    role: row.querySelector<HTMLSelectElement>('[name="permissionRole"]')!.value as 'viewer' | 'editor',
  })).filter(permission => permission.email.trim());
  const error = $('#tp-access-settings-error');
  error.hidden = true;
  try {
    tripAccess = await repository.saveTripAccess(trip.id, mode, permissions);
    canEdit = tripAccess.canEdit;
    renderTripAccessSettings(); render();
    showToast('Trip access updated.');
  } catch (caught) {
    error.textContent = caught instanceof Error ? caught.message : 'Could not update trip access.';
    error.hidden = false;
  }
}

function openTripDialog(showAccess = false): void {
  const form = $('#tp-trip-form') as HTMLFormElement;
  (form.elements.namedItem('title') as HTMLInputElement).value = trip!.title;
  setLocationField(form, 'destination', trip!.destination, trip!.destinationCoordinates);
  renderTripAccessSettings();
  syncDateButtons(form); form.querySelectorAll('.tp-field-error').forEach(error => error.remove());
  $<HTMLDialogElement>('#tp-trip-dialog').showModal();
  if (showAccess) window.setTimeout(() => $('#tp-trip-access-settings').scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
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
    const response = await fetch(`${appBase}/api/geocode?type=autocomplete&text=${encodeURIComponent(query)}`, { signal: controller.signal });
    if (!response.ok) throw new Error('Location search failed.');
    const result = await response.json() as { features?: { properties?: { formatted?: string; address_line1?: string; address_line2?: string }; geometry?: { coordinates?: [number, number] } }[] };
    if (locationAutocompleteControllers.get(input) !== controller || input.value.trim() !== query) return;
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
    if (locationAutocompleteControllers.get(input) !== controller) return;
    suggestions.hidden = true;
    suggestions.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    help.textContent = 'Location suggestions are unavailable; you can still save the location manually.';
  } finally {
    if (locationAutocompleteControllers.get(input) === controller) locationAutocompleteControllers.delete(input);
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
  form.querySelector('h2')!.textContent = option ? 'Edit transport' : 'Add transport';
  form.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent = option ? 'Save option' : 'Add option';
  setLocationField(form, 'origin');
  setLocationField(form, 'destination');
  renderParticipantChecks($('#tp-person-checks'), option?.participantIds);
  if (option) {
    hidden.value = option.id;
    for (const [name, value] of Object.entries({ title: option.title, mode: option.mode, operator: option.operator, seats: option.seats ?? '', price: option.pricePerPerson || '', origin: option.origin, destination: option.destination, departureDate: option.departureAt.slice(0, 10), departureTime: option.departureAt.slice(11, 16), arrivalDate: option.arrivalAt.slice(0, 10), arrivalTime: option.arrivalAt.slice(11, 16), checkedPrice: option.baggageRules.find(rule => /checked/i.test(rule.label))?.price ?? '', sportsPrice: option.baggageRules.find(rule => /sport/i.test(rule.label))?.price ?? '', checkedMax: option.baggageRules.find(rule => /checked/i.test(rule.label))?.maxWeightKg ?? '', sportsMax: option.baggageRules.find(rule => /sport/i.test(rule.label))?.maxWeightKg ?? '', baggageUrl: option.baggageRules[0]?.sourceUrl ?? '', bookingReference: option.bookingReference ?? '' })) (form.elements.namedItem(name) as HTMLInputElement).value = String(value);
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
  renderParticipantChecks($('#tp-stay-person-checks'), option?.participantIds);
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
  renderParticipantChecks($('#tp-activity-person-checks'), option?.participantIds);
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
  const person: Participant = { id, name: String(data.get('name')).trim(), initials: String(data.get('name')).trim().slice(0, 1).toUpperCase(), colour: existing?.colour ?? colours[trip!.participants.length % colours.length], origin: String(data.get('origin')).trim(), originCoordinates, sex: String(data.get('sex')) as Participant['sex'], confirmed: existing?.confirmed ?? false, goWithFlow: false, sleepingPreferences: { ownRoom, ownBed: bedPreferences.includes('own-bed'), shareDoubleWithParticipantId: partnerId, acceptsSofaBed: false, roomPreferences, bedPreferences, shareWithParticipantIds }, baggage: bags };
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
  const mode = String(data.get('mode')) as TransportMode;
  const option: TransportOption = { id, mode, status: existing?.status ?? 'idea', title: String(data.get('title')), operator: String(data.get('operator') || ''), origin: String(data.get('origin') || ''), originCoordinates: coordinatesFromForm(data, 'origin'), destination: String(data.get('destination') || ''), destinationCoordinates: coordinatesFromForm(data, 'destination'), departureAt: combineDateTime(data.get('departureDate'), data.get('departureTime')), arrivalAt: combineDateTime(data.get('arrivalDate'), data.get('arrivalTime')), participantIds: data.getAll('participants').map(String), seats: mode === 'car' ? Number(data.get('seats')) || undefined : undefined, pricePerPerson: Number(data.get('price')) || 0, currency: trip!.currency, baggageRules: rules, votes: existing?.votes ?? {}, bookingReference: String(data.get('bookingReference')) || undefined };
  closeDialogs(); await mutate(() => repository.saveTransportOption(trip!.id, option), 'Transport option saved.');
}

async function saveStay(form: HTMLFormElement): Promise<void> {
  if (!validateForm(form)) return;
  const data = new FormData(form); const id = String(data.get('id') || `stay-${crypto.randomUUID()}`); const existing = trip!.accommodationOptions.find(option => option.id === id);
  const participantIds = data.getAll('participants').map(String);
  const rooms: Room[] = [...form.querySelectorAll<HTMLElement>('[data-room-id]')].map((roomElement, roomIndex) => ({
    id: roomElement.dataset.roomId!,
    name: roomElement.querySelector<HTMLInputElement>('[name="roomName"]')!.value.trim() || `Room ${roomIndex + 1}`,
    private: roomElement.querySelector<HTMLInputElement>('[name="roomPrivate"]')!.checked,
    beds: [...roomElement.querySelectorAll<HTMLElement>('[data-bed-id]')].map(bedElement => ({ id: bedElement.dataset.bedId!, type: bedElement.querySelector<HTMLSelectElement>('[name="bedType"]')!.value as BedType, sleeps: Number(bedElement.querySelector<HTMLInputElement>('[name="bedSleeps"]')!.value) || 1 })),
  }));
  const travellerCount = participantIds.length || trip!.participants.length;
  const spaces = rooms.flatMap(room => room.beds).reduce((total, bed) => total + bed.sleeps, 0); const hasSofa = rooms.some(room => room.beds.some(bed => bed.type === 'sofa-bed')); const fitLevel = !rooms.length ? 'compromise' : spaces < travellerCount ? 'invalid' : hasSofa ? 'compromise' : 'good';
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
  const fitSummary = !rooms.length ? 'Room and bed details have not been added yet.' : spaces < travellerCount ? `${spaces} sleeping spaces for ${travellerCount} people — this does not fit the relevant group.` : hasSofa ? 'Fits the relevant group, but uses a sofa bed. Check this against everyone’s preferences.' : `Fits all ${travellerCount} relevant travellers without using a sofa bed.`;
  const option: AccommodationOption = { id, status: existing?.status ?? 'shortlisted', participantIds, name: String(data.get('name')), platform, sourceUrl, location: String(data.get('location') || ''), locationCoordinates: coordinatesFromForm(data, 'location'), priceTotal: Number(data.get('price')) || 0, currency: trip!.currency, checkIn: String(data.get('checkIn') || ''), checkOut: String(data.get('checkOut') || ''), walkToPrimarySiteMinutes: siteDistances.find(item => /main activity/i.test(item.site))?.minutes ?? 0, siteDistances, rooms, votes: existing?.votes ?? {}, fitSummary, fitLevel, notes: String(data.get('notes')), bookingReference: String(data.get('bookingReference')) || undefined };
  closeDialogs(); await mutate(() => repository.saveAccommodationOption(trip!.id, option), 'Accommodation saved.');
}

async function saveActivity(form: HTMLFormElement): Promise<void> {
  if (!validateForm(form)) return;
  const data = new FormData(form);
  const id = String(data.get('id') || `activity-${crypto.randomUUID()}`);
  const existing = trip!.activities.find(option => option.id === id);
  const option: ActivityOption = { id, status: existing?.status ?? 'idea', participantIds: data.getAll('participants').map(String), name: String(data.get('name')).trim(), category: String(data.get('category') || '') || undefined, location: String(data.get('location') || '') || undefined, locationCoordinates: coordinatesFromForm(data, 'location'), date: String(data.get('date') || '') || undefined, time: String(data.get('time') || '') || undefined, sourceUrl: String(data.get('url') || '') || undefined, costPerPerson: Number(data.get('cost')) || undefined, currency: trip!.currency, notes: String(data.get('notes') || '') || undefined, votes: existing?.votes ?? {} };
  closeDialogs(); await mutate(() => repository.saveActivityOption(trip!.id, option), 'Activity saved.');
}

function showTrip(result: TripResult & { session: TripSession }): void {
  trip = result.trip;
  const sessionPerson = result.trip.participants.find(person => person.id === result.session.participantId) ?? result.trip.participants[0];
  session = sessionPerson ? { tripId: result.trip.id, participantId: sessionPerson.id, displayName: sessionPerson.name } : result.session;
  tripAccess = result.access ?? repository.getTripAccess(result.trip.id) ?? { mode: 'public-link', hasOwner: false, permissions: [], role: 'public', canView: true, canEdit: true, canManage: false };
  canEdit = result.trip.id === 'demo' ? false : tripAccess.canEdit;
  itineraryPersonId = '';
  $<HTMLDialogElement>('#tp-join-dialog').close();
  const readOnlyPill = $('#tp-read-only-pill');
  readOnlyPill.textContent = trip.id === 'demo' ? 'Demo · View only' : 'View only';
  readOnlyPill.hidden = canEdit;
  render();
}

function requestTripIdentity(loadedTrip: Trip): void {
  trip = loadedTrip;
  if (loadedTrip.id === 'demo' || !canEdit) {
    showTrip({ trip: loadedTrip, session: { tripId: loadedTrip.id, participantId: '', displayName: 'Guest' } });
    return;
  }
  const dialog = $<HTMLDialogElement>('#tp-join-dialog');
  if (!dialog.open) dialog.showModal();
}

function exportCurrentTrip(): void {
  if (!trip) return;
  $<HTMLDetailsElement>('#tp-settings-menu').open = false;
  const exported: TripExport = { schemaVersion: 1, exportedAt: new Date().toISOString(), trip };
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const filename = trip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';
  link.href = url; link.download = `${filename}-trip-planner.json`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast('Trip exported.');
}

async function importTripFile(file: File): Promise<string> {
  const parsed = JSON.parse(await file.text()) as TripExport;
  return (await repository.importTrip(parsed)).trip.id;
}

export async function mountTripPlanner(): Promise<void> {
  const root = $('#trip-planner-root');
  const page = root.dataset.page;

  if (page === 'home') {
    const setup = $('#tp-access-form') as HTMLFormElement;
    account = await loadAccount();
    canEdit = true;
    applyAccountDefaults();
    enhanceForms();
    renderSetupCalendar();
    setup.addEventListener('submit', async event => {
      event.preventDefault(); const button = setup.querySelector<HTMLButtonElement>('button[type="submit"]')!; const error = $('#tp-access-error'); button.disabled = true; button.textContent = 'Creating…'; error.hidden = true;
      try {
        if (!validateForm(setup)) throw new Error('Check the highlighted fields.');
        if (!setupRanges.length) throw new Error('Select at least one potential date range.');
        const setupData = new FormData(setup);
        const result = await repository.createTrip({ displayName: formValue(setup, 'name'), title: formValue(setup, 'title'), destination: formValue(setup, 'destination'), destinationCoordinates: coordinatesFromForm(setupData, 'destination'), availabilityRanges: setupRanges.map(({ start, end }) => ({ start, end })) });
        location.assign(tripUrl(result.trip.id));
      } catch (caught) { error.textContent = caught instanceof Error ? caught.message : 'Could not create the trip.'; error.hidden = false; }
      finally { button.disabled = false; button.textContent = 'Create trip'; }
    });
    $('#tp-import').addEventListener('click', () => $<HTMLInputElement>('#tp-import-file').click());
    $<HTMLInputElement>('#tp-import-file').addEventListener('change', async event => {
      const input = event.currentTarget as HTMLInputElement;
      const file = input.files?.[0]; input.value = '';
      if (!file) return;
      try { location.assign(tripUrl(await importTripFile(file))); }
      catch (error) { showToast(error instanceof Error ? error.message : 'Could not import this trip.'); }
    });
    root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      const setupDate = target.closest<HTMLButtonElement>('[data-setup-date]'); if (setupDate?.dataset.setupDate) { selectSetupDate(setupDate.dataset.setupDate); return; }
      const removeSetupRange = target.closest<HTMLButtonElement>('[data-remove-setup-range]'); if (removeSetupRange) { setupRanges = setupRanges.filter(candidate => candidate.id !== removeSetupRange.dataset.removeSetupRange); renderSetupCalendar(); return; }
      if (target.closest('#tp-setup-prev-month')) { setupCalendarMonth = new Date(setupCalendarMonth.getFullYear(), setupCalendarMonth.getMonth() - 1, 1); renderSetupCalendar(); return; }
      if (target.closest('#tp-setup-next-month')) { setupCalendarMonth = new Date(setupCalendarMonth.getFullYear(), setupCalendarMonth.getMonth() + 1, 1); renderSetupCalendar(); }
    });
    return;
  }

  const savedToken = root.dataset.tripId;
  account = await loadAccount(savedToken);
  canEdit = true;
  enhanceForms();

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

  $('#trip-planner-root').addEventListener('input', event => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-location-input]');
    if (!input?.form) return;
    const field = input.closest<HTMLElement>('.tp-location-field');
    if (input.value !== input.dataset.selectedLocation) {
      const latitude = field?.querySelector<HTMLInputElement>('[data-location-lat]');
      const longitude = field?.querySelector<HTMLInputElement>('[data-location-lon]');
      if (latitude) latitude.value = '';
      if (longitude) longitude.value = '';
    }
    dismissLocationSuggestions(input);
    if (!geocodingAvailable || input.value.trim().length < 3) return;
    const timer = window.setTimeout(() => {
      locationAutocompleteTimers.delete(input);
      void requestLocationSuggestions(input, input.value.trim());
    }, 350);
    locationAutocompleteTimers.set(input, timer);
  });

  $('#trip-planner-root').addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-location-input]');
    const suggestions = input?.closest<HTMLElement>('.tp-location-field')?.querySelector<HTMLElement>('.tp-location-suggestions');
    if (!input || !suggestions || (suggestions.hidden && !locationAutocompleteTimers.has(input) && !locationAutocompleteControllers.has(input))) return;
    event.preventDefault();
    event.stopPropagation();
    dismissLocationSuggestions(input);
  });

  $('#trip-planner-root').addEventListener('click', event => {
    const target = event.target as HTMLElement;
    if (trip?.id === 'demo' && target.closest(demoEditSelector)) {
      event.preventDefault();
      showDemoReadOnlyMessage();
      return;
    }
    if (target.closest('#tp-add-permission')) { addPermissionRow(); return; }
    if (target.closest('#tp-save-access')) { void saveAccessSettings(); return; }
    const removePermission = target.closest<HTMLButtonElement>('[data-remove-permission]');
    if (removePermission) { removePermission.closest('.tp-permission-row')?.remove(); return; }
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
    const itineraryLayoutButton = target.closest<HTMLButtonElement>('[data-itinerary-layout]'); if (itineraryLayoutButton) { itineraryLayout = itineraryLayoutButton.dataset.itineraryLayout === 'calendar' ? 'calendar' : 'list'; localStorage.setItem('trip-planner:itinerary-layout', itineraryLayout); render(); return; }
    const planningPerson = target.closest<HTMLButtonElement>('[data-planning-person]'); if (planningPerson) { planningPersonId = planningPerson.dataset.planningPerson ?? ''; render(); return; }
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
    if (target.closest('[data-restrict-access]')) return openTripDialog(true);
    if (target.closest('#tp-edit-trip')) return openTripDialog();
    if (target.closest('#tp-add-person')) return openPersonDialog();
    if (target.closest('#tp-clear-transport-people')) {
      $<HTMLFormElement>('#tp-transport-form').querySelectorAll<HTMLInputElement>('[name="participants"]').forEach(input => { input.checked = false; });
      updateTransportCapacityWarning();
      return;
    }
    if (target.closest('#tp-add-bag')) { addBagRow(); return; }
    const removeBag = target.closest<HTMLElement>('[data-remove-bag]'); if (removeBag) { removeBag.closest('.tp-bag-row')?.remove(); return; }
    if (target.closest('#tp-add-room')) { addRoomEditor(); return; }
    const addBed = target.closest<HTMLElement>('[data-add-bed]'); if (addBed) { addBedEditor(addBed.closest<HTMLElement>('[data-room-id]')!); return; }
    const removeBed = target.closest<HTMLElement>('[data-remove-bed]'); if (removeBed) { removeBed.closest('[data-bed-id]')?.remove(); return; }
    const removeRoom = target.closest<HTMLElement>('[data-remove-room]'); if (removeRoom) { removeRoom.closest('[data-room-id]')?.remove(); return; }
    if (target.closest('#tp-add-travel-time')) { addTravelTimeEditor(); return; }
    const removeTravelTime = target.closest<HTMLElement>('[data-remove-travel-time]'); if (removeTravelTime) { removeTravelTime.closest('.tp-travel-time-row')?.remove(); return; }
    const editPerson = target.closest<HTMLElement>('[data-edit-person]'); if (editPerson) return openPersonDialog(editPerson.dataset.editPerson);
    const removePerson = target.closest<HTMLElement>('[data-remove-person]'); if (removePerson) { const person = trip!.participants.find(candidate => candidate.id === removePerson.dataset.removePerson); if (person) openDeletePersonDialog(person); return; }
    if (target.closest('#tp-confirm-delete-person')) { void confirmPersonDeletion(); return; }
    if (target.closest('#tp-add-range')) return openRangeDialog();
    const editRange = target.closest<HTMLElement>('[data-edit-range]'); if (editRange) return openRangeDialog(editRange.dataset.editRange);
    const removeRange = target.closest<HTMLElement>('[data-remove-range]'); if (removeRange) { void mutate(() => repository.removeAvailabilityRange(trip!.id, removeRange.dataset.removeRange!), 'Date range removed.'); return; }
    const preferRange = target.closest<HTMLElement>('[data-prefer-range]'); if (preferRange) { const candidate = trip!.availabilityRanges.find(range => range.id === preferRange.dataset.preferRange)!; void mutate(() => repository.selectPreferredDates(trip!.id, { start: candidate.start, end: candidate.end }), 'Dates locked in.'); return; }
    if (target.closest('#tp-add-transport, [data-add-transport]')) return openTransportDialog();
    const editTransport = target.closest<HTMLElement>('[data-edit-transport]'); if (editTransport) return openTransportDialog(editTransport.dataset.editTransport);
    const removeTransport = target.closest<HTMLElement>('[data-remove-transport]'); if (removeTransport) { if (window.confirm('Delete this transport option?')) void mutate(() => repository.removeTransportOption(trip!.id, removeTransport.dataset.removeTransport!), 'Transport option deleted.'); return; }
    if (target.closest('#tp-add-stay')) return openStayDialog();
    const editStay = target.closest<HTMLElement>('[data-edit-stay]'); if (editStay) return openStayDialog(editStay.dataset.editStay);
    const removeStay = target.closest<HTMLElement>('[data-remove-stay]'); if (removeStay) { if (window.confirm('Delete this accommodation option?')) void mutate(() => repository.removeAccommodationOption(trip!.id, removeStay.dataset.removeStay!), 'Accommodation deleted.'); return; }
    if (target.closest('#tp-add-activity')) return openActivityDialog();
    const editActivity = target.closest<HTMLElement>('[data-edit-activity]'); if (editActivity) return openActivityDialog(editActivity.dataset.editActivity);
    const removeActivity = target.closest<HTMLElement>('[data-remove-activity]'); if (removeActivity) { if (window.confirm('Delete this activity?')) void mutate(() => repository.removeActivityOption(trip!.id, removeActivity.dataset.removeActivity!), 'Activity deleted.'); return; }
    if (target.closest('[data-close-dialog]')) closeDialogs();
  });

  $<HTMLSelectElement>('#tp-transport-form [name="mode"]').addEventListener('change', updateTransportFields);
  $<HTMLFormElement>('#tp-transport-form').addEventListener('input', event => {
    const target = event.target as HTMLInputElement;
    if (target.name === 'seats' || target.name === 'participants') updateTransportCapacityWarning();
  });
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
    if (input === anyone) {
      women.checked = anyone.checked; men.checked = anyone.checked;
    } else if (input === women || input === men) {
      anyone.checked = women.checked && men.checked;
    }
  });

  $('#tp-share').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); showToast('Trip link copied.'); } catch { showToast('Copy the URL from the address bar.'); } });
  ($('#tp-person-form') as HTMLFormElement).addEventListener('submit', event => { event.preventDefault(); void savePerson(event.currentTarget as HTMLFormElement); });
  ($('#tp-range-form') as HTMLFormElement).addEventListener('submit', event => { event.preventDefault(); const form = event.currentTarget as HTMLFormElement; if (!validateForm(form)) return; const id = formValue(form, 'id') || `range-${crypto.randomUUID()}`; closeDialogs(); void mutate(() => repository.saveAvailabilityRange(trip!.id, { id, start: formValue(form, 'start'), end: formValue(form, 'end') }), 'Candidate date range saved.'); });
  ($('#tp-transport-form') as HTMLFormElement).addEventListener('submit', event => { event.preventDefault(); void saveTransport(event.currentTarget as HTMLFormElement); });
  ($('#tp-stay-form') as HTMLFormElement).addEventListener('submit', event => { event.preventDefault(); void saveStay(event.currentTarget as HTMLFormElement); });
  ($('#tp-activity-form') as HTMLFormElement).addEventListener('submit', event => { event.preventDefault(); void saveActivity(event.currentTarget as HTMLFormElement); });
  ($('#tp-trip-form') as HTMLFormElement).addEventListener('submit', event => { event.preventDefault(); const form = event.currentTarget as HTMLFormElement; if (!validateForm(form)) return; const data = new FormData(form); closeDialogs(); void mutate(() => repository.updateTrip(trip!.id, { title: formValue(form, 'title'), destination: formValue(form, 'destination'), destinationCoordinates: coordinatesFromForm(data, 'destination'), availabilityWindow: trip!.availabilityWindow, dateRange: trip!.dateRange }), 'Trip details updated.'); });

  if (savedToken) {
    void repository.restoreTrip(savedToken).then(result => {
      if (!result) {
        $('#tp-title').textContent = 'Trip not found';
        $('#tp-content').innerHTML = '<section class="tp-loading-state tp-error-state"><h1>Trip not found</h1><p>This trip does not exist or the link is incomplete.</p><a class="tp-button tp-button-primary" href="' + appBase + '/">Create a trip</a></section>';
        return;
      }
      tripAccess = result.access;
      canEdit = result.access?.canEdit ?? true;
      if (account?.tripSession) showTrip({ ...result, session: account.tripSession });
      else if (result.session && canEdit) showTrip({ ...result, session: result.session });
      else requestTripIdentity(result.trip);
    }).catch(() => {
      $('#tp-title').textContent = 'Could not load trip';
      $('#tp-content').innerHTML = '<section class="tp-loading-state tp-error-state"><h1>Could not load this trip</h1><p>Please refresh the page and try again.</p><a class="tp-button tp-button-primary" href="">Try again</a></section>';
    });
  } else {
    $('#tp-title').textContent = 'Trip not found';
    $('#tp-content').innerHTML = '<section class="tp-loading-state tp-error-state"><h1>Trip not found</h1><p>The trip link is incomplete.</p><a class="tp-button tp-button-primary" href="' + appBase + '/">Create a trip</a></section>';
  }
}
