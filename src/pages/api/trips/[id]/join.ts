import type { APIRoute } from 'astro';
import { loadTrip, saveTripSession, updateTrip } from '../../../../lib/server/database';
import { joinTrip } from '../../../../lib/server/trips';
import { guardRequest, json, jsonBody, validTripId } from '../../../../lib/server/request';

export const prerender = false;

export const POST: APIRoute = async context => {
  const guarded = await guardRequest(context, 30);
  if (guarded instanceof Response) return guarded;
  const tripId = context.params.id;
  if (!validTripId(tripId)) return json({ error: 'Trip not found.' }, 404);
  try {
    const body = await jsonBody<{ displayName: string; expectedRevision: number }>(context.request);
    const trip = await loadTrip(guarded.env.DB, tripId);
    if (!trip) return json({ error: 'Trip not found.' }, 404);
    if (trip.revision !== body.expectedRevision) return json({ trip }, 409);
    const result = joinTrip(structuredClone(trip), body.displayName);
    const saved = await updateTrip(guarded.env.DB, result.trip, body.expectedRevision);
    if (!saved) return json({ trip: await loadTrip(guarded.env.DB, tripId) }, 409);
    result.trip = saved;
    await saveTripSession(guarded.env.DB, guarded.sessionId, result.session);
    return json(result);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not join the trip.' }, 400);
  }
};
