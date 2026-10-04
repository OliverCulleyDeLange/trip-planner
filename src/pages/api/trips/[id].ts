import type { APIRoute } from 'astro';
import { getTripAccess, getTripMembership, getTripSession, loadTrip } from '../../../lib/server/database';
import { authenticatedUser, guardRequest, json, validTripId } from '../../../lib/server/request';

export const prerender = false;

export const GET: APIRoute = async context => {
  const guarded = await guardRequest(context);
  if (guarded instanceof Response) return guarded;
  const tripId = context.params.id;
  if (!validTripId(tripId)) return json({ error: 'Trip not found.' }, 404);
  const user = await authenticatedUser(context, guarded.env, guarded.sessionId);
  const access = await getTripAccess(guarded.env.DB, tripId, user?.email);
  if (!access.canView) return json({ error: user ? 'You do not have access to this trip.' : 'Sign in to view this trip.' }, 403);
  const trip = await loadTrip(guarded.env.DB, tripId);
  if (!trip) return json({ error: 'Trip not found.' }, 404);
  const session = user
    ? await getTripMembership(guarded.env.DB, user.email, tripId) ?? await getTripSession(guarded.env.DB, guarded.sessionId, tripId)
    : await getTripSession(guarded.env.DB, guarded.sessionId, tripId);
  return json({ trip, session, access });
};
