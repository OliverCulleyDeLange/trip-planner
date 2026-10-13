import { describe, expect, it } from 'vitest';
import { parseAirbnbListingHtml } from './airbnb';

describe('Airbnb listing import', () => {
  it('extracts listing metadata and sleeping arrangements from public page state', () => {
    const html = `
      <script type="application/ld+json">{"@type":"VacationRental","name":"Harbour House","containsPlace":{"address":{"addressLocality":"Tenby","addressRegion":"Wales"}}}</script>
      <script data-deferred-state-0="true" type="application/json">{"presentation":{"tour":{"name":"Where you'll sleep","stops":[
        {"name":"Bedroom 1","description":{"descriptions":[{"text":"1 king bed"}]}},
        {"name":"Bedroom 2","description":{"descriptions":[{"text":"2 single beds"},{"text":"1 sofa bed"}]}}
      ]}}}</script>`;
    const result = parseAirbnbListingHtml(html);
    expect(result.name).toBe('Harbour House');
    expect(result.location).toBe('Tenby, Wales');
    expect(result.rooms).toHaveLength(2);
    expect(result.rooms[0].beds).toEqual([expect.objectContaining({ type: 'king', sleeps: 2 })]);
    expect(result.rooms[1].beds.map(bed => bed.type)).toEqual(['single', 'single', 'sofa-bed']);
  });
});
