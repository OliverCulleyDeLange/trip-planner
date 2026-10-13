import type { APIRoute } from 'astro';
import { parseAirbnbListingHtml } from '../../lib/trip-planner/airbnb';
import { guardRequest, json, jsonBody } from '../../lib/server/request';

export const prerender = false;

function listingUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)?airbnb\.(?:com|co\.uk|[a-z]{2})$/i.test(url.hostname)) return undefined;
    if (!/^\/rooms\/\d+/.test(url.pathname)) return undefined;
    return url;
  } catch { return undefined; }
}

export const POST: APIRoute = async context => {
  const guarded = await guardRequest(context);
  if (guarded instanceof Response) return guarded;
  try {
    const body = await jsonBody<{ url?: string }>(context.request, 10_000);
    const url = listingUrl(body.url?.trim() ?? '');
    if (!url) return json({ error: 'Paste a complete Airbnb listing URL.' }, 400);
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-GB,en;q=0.9',
        'user-agent': context.request.headers.get('user-agent') ?? 'Mozilla/5.0',
      },
    });
    if (!response.ok) return json({ error: 'Airbnb did not make this listing available for import.' }, 502);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 3_000_000) return json({ error: 'This Airbnb page is too large to import safely.' }, 413);
    const html = await response.text();
    if (html.length > 3_000_000) return json({ error: 'This Airbnb page is too large to import safely.' }, 413);
    const listing = parseAirbnbListingHtml(html);
    if (!listing.name && !listing.rooms.length) return json({ error: 'Airbnb did not expose enough listing details to import.' }, 422);
    return json({ listing });
  } catch (error) {
    console.error(error);
    return json({ error: 'The Airbnb listing could not be imported. You can still enter its details manually.' }, 502);
  }
};
