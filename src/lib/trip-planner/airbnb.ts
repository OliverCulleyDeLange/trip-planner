import type { BedType, Room } from './types';

export interface AirbnbListingImport {
  name?: string;
  location?: string;
  rooms: Room[];
}

type JsonObject = Record<string, unknown>;

function objects(value: unknown): JsonObject[] {
  if (!value || typeof value !== 'object') return [];
  const object = value as JsonObject;
  return [object, ...Object.values(object).flatMap(objects)];
}

function bedType(label: string): BedType | undefined {
  const normalized = label.toLowerCase();
  if (/sofa|couch/.test(normalized)) return 'sofa-bed';
  if (/bunk/.test(normalized)) return 'bunk';
  if (/king/.test(normalized)) return 'king';
  if (/double|queen/.test(normalized)) return 'double';
  if (/single|twin|2ft/.test(normalized)) return 'single';
  return undefined;
}

function bedsFromDescriptions(value: unknown, roomIndex: number): Room['beds'] {
  if (!Array.isArray(value)) return [];
  let bedIndex = 0;
  return value.flatMap(item => {
    const label = typeof item === 'object' && item ? String((item as JsonObject).text ?? '') : '';
    const type = bedType(label);
    if (!type) return [];
    const count = Math.max(1, Math.min(12, Number(label.match(/\b(\d+)\b/)?.[1] ?? 1)));
    return Array.from({ length: count }, () => {
      bedIndex += 1;
      return { id: `airbnb-room-${roomIndex + 1}-bed-${bedIndex}`, type, sleeps: type === 'single' || type === 'sofa-bed' ? 1 : 2 };
    });
  });
}

export function parseAirbnbListingHtml(html: string): AirbnbListingImport {
  let name: string | undefined;
  let location: string | undefined;
  const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(jsonLdPattern)) {
    try {
      const value = JSON.parse(match[1]) as JsonObject;
      if (!name && typeof value.name === 'string') name = value.name;
      const address = value.containsPlace && typeof value.containsPlace === 'object'
        ? (value.containsPlace as JsonObject).address : value.address;
      if (!location && address && typeof address === 'object') {
        const parts = ['addressLocality', 'addressRegion', 'addressCountry']
          .map(key => (address as JsonObject)[key]).filter(part => typeof part === 'string');
        if (parts.length) location = [...new Set(parts)].join(', ');
      }
    } catch { continue; }
  }

  const statePattern = /<script[^>]*data-deferred-state[^>]*>([\s\S]*?)<\/script>/gi;
  let sleepTour: JsonObject | undefined;
  for (const match of html.matchAll(statePattern)) {
    try {
      const state = JSON.parse(match[1]);
      sleepTour = objects(state).find(item => item.name === "Where you'll sleep" && Array.isArray(item.stops));
      if (!location) {
        const overview = objects(state).find(item => item.__typename === 'StaysPdpOverview' && typeof item.title === 'string');
        const title = typeof overview?.title === 'string' ? overview.title : '';
        location = title.replace(/^(?:Entire|Private|Shared) (?:home|room|place) in /i, '') || undefined;
      }
      if (sleepTour) break;
    } catch { continue; }
  }

  const stops = Array.isArray(sleepTour?.stops) ? sleepTour.stops : [];
  const rooms: Room[] = stops.flatMap((item, roomIndex) => {
    if (!item || typeof item !== 'object') return [];
    const stop = item as JsonObject;
    const description = stop.description && typeof stop.description === 'object' ? stop.description as JsonObject : undefined;
    const beds = bedsFromDescriptions(description?.descriptions, roomIndex);
    if (!beds.length) return [];
    return [{ id: `airbnb-room-${roomIndex + 1}`, name: String(stop.name || `Bedroom ${roomIndex + 1}`), private: true, beds }];
  });

  return { name, location, rooms };
}
