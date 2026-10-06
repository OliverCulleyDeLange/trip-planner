import type { APIRoute } from 'astro';
import { guardRequest, json } from '../../lib/server/request';

export const prerender = false;

export const GET: APIRoute = async context => {
  const guarded = await guardRequest(context);
  if (guarded instanceof Response) return guarded;
  if (!guarded.env.GEOAPIFY_API_KEY) return json({ error: 'Geocoding is not configured.' }, 503);
  const query = context.url.searchParams.get('text')?.trim() ?? '';
  const type = context.url.searchParams.get('type') === 'search' ? 'search' : 'autocomplete';
  if (query.length < 3 || query.length > 240) return json({ error: 'Enter at least three characters.' }, 400);
  const upstream = new URL(`https://api.geoapify.com/v1/geocode/${type}`);
  upstream.searchParams.set('text', query);
  upstream.searchParams.set('limit', type === 'search' ? '1' : '6');
  upstream.searchParams.set('format', 'geojson');
  upstream.searchParams.set('apiKey', guarded.env.GEOAPIFY_API_KEY);
  try {
    const response = await fetch(upstream, { headers: { accept: 'application/json' } });
    if (!response.ok) return json({ error: 'Location search is unavailable.' }, response.status >= 500 ? 502 : response.status);
    return json(await response.json(), 200, { 'cache-control': 'private, max-age=300' });
  } catch (error) {
    console.error(error);
    return json({ error: 'Location search is unavailable.' }, 502);
  }
};
