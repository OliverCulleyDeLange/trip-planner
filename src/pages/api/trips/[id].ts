import type { APIRoute } from 'astro';
import { getTripSession, loadTrip } from '../../../lib/server/database';
import { guardRequest, json, validTripId } from '../../../lib/server/request';

export const prerender = false;

export const GET: APIRoute = async context => {
  const guarded = await guardRequest(context);
  if (guarded instanceof Response) return guarded;
  const tripId = context.params.id;
  if (!validTripId(tripId)) return json({ error: 'Trip not found.' }, 404);
  const trip = await loadTrip(guarded.env.DB, tripId);
  if (!trip) return json({ error: 'Trip not found.' }, 404);
  const session = await getTripSession(guarded.env.DB, guarded.sessionId, tripId);
  return json({ trip, session });
};
