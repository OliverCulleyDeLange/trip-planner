import type { APIRoute } from 'astro';
import { loadTrip, loadTripByPublicId, updateTrip } from '../../../../lib/server/database';
import { applyMutation, type TripMutation } from '../../../../lib/server/trips';
import { guardRequest, json, jsonBody, validTripId } from '../../../../lib/server/request';

export const prerender = false;

export const POST: APIRoute = async context => {
  const guarded = await guardRequest(context);
  if (guarded instanceof Response) return guarded;
  const tripId = context.params.id;
  if (!validTripId(tripId)) return json({ error: 'Trip not found.' }, 404);
  if (tripId === 'demo') return json({ error: 'The demo trip can’t be edited.' }, 403);
  try {
    const body = await jsonBody<TripMutation & { expectedRevision: number }>(context.request);
    const current = await loadTripByPublicId(guarded.env.DB, tripId);
    if (!current) return json({ error: 'Trip not found.' }, 404);
    if (!Number.isInteger(body.expectedRevision) || current.revision !== body.expectedRevision) return json({ trip: current }, 409);
    const changed = applyMutation(structuredClone(current), body);
    const saved = await updateTrip(guarded.env.DB, changed, body.expectedRevision);
    if (!saved) return json({ trip: await loadTrip(guarded.env.DB, current.id) }, 409);
    return json({ trip: saved });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Could not save the change.' }, 400);
  }
};
