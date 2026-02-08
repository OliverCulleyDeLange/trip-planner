import { writable } from 'svelte/store';

export interface Event {
	id: string;
	name: string;
	description: string;
	createdAt: Date;
}

export interface Availability {
	eventId: string;
	personName: string;
	startDate: string;
	endDate: string;
	id: string;
}

// In-memory data stores
export const events = writable<Event[]>([]);
export const availabilities = writable<Availability[]>([]);

// Helper functions
export function createEvent(name: string, description: string): Event {
	const event: Event = {
		id: crypto.randomUUID(),
		name,
		description,
		createdAt: new Date()
	};
	
	events.update(e => [...e, event]);
	return event;
}

export function addAvailability(eventId: string, personName: string, startDate: string, endDate: string): Availability {
	const availability: Availability = {
		id: crypto.randomUUID(),
		eventId,
		personName,
		startDate,
		endDate
	};
	
	availabilities.update(a => [...a, availability]);
	return availability;
}

export function getEventById(id: string, eventsArray: Event[]): Event | undefined {
	return eventsArray.find(e => e.id === id);
}

export function getAvailabilitiesForEvent(eventId: string, availabilitiesArray: Availability[]): Availability[] {
	return availabilitiesArray.filter(a => a.eventId === eventId);
}
