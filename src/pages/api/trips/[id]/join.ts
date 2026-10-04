import type { APIRoute } from 'astro';
import { getTripAccess, loadTrip, saveTripMembership, saveTripSession, updateTrip } from '../../../../lib/server/database';
import { joinTrip } from '../../../../lib/server/trips';
import { authenticatedUser, guardRequest, json, jsonBody, validTripId } from '../../../../lib/server/request';

export const prerender = false;

export const POST: APIRoute = async context => {
  const guarded = await guardRequest(context, 30);
  if (guarded instanceof Response) return guarded;
  const tripId = context.params.id;
  if (!validTripId(tripId)) return json({ error: 'Trip not found.' }, 404);
  if (tripId === 'demo') return json({ error: 'The demo trip can’t be edited.' }, 403);
  try {
    const user = await authenticatedUser(context, guarded.env, guarded.sessionId);
    const access = await getTripAccess(guarded.env.DB, tripId, user?.email);
    if (!access.canEdit) return json({ error: user ? 'You only have view access to this trip.' : 'Sign in with an editor invitation to change this trip.' }, 403);
    const body = await jsonBody<{ displayName: string; expectedRevision: number }>(context.request);
    const trip = await loadTrip(guarded.env.DB, tripId);
    if (!trip) return json({ error: 'Trip not found.' }, 404);
    if (trip.revision !== body.expectedRevision) return json({ trip }, 409);
    const result = joinTrip(structuredClone(trip), body.displayName);
    const saved = await updateTrip(guarded.env.DB, result.trip, body.expectedRevision);
    if (!saved) return json({ trip: await loadTrip(guarded.env.DB, tripId) }, 409);
    result.trip = saved;
    await saveTripSession(guarded.env.DB, guarded.sessionId, result.session);
    if (user) await saveTripMembership(guarded.env.DB, user.email, result.session);
    return json({ ...result, access });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not join the trip.' }, 400);
  }
};
