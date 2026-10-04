import type { APIRoute } from 'astro';
import { getTripMembership, getTripSession, listAccountTrips, saveAccountSession, saveTripMembership } from '../../../lib/server/database';
import { accessUser, guardRequest, json, validTripId } from '../../../lib/server/request';

export const prerender = false;

export const GET: APIRoute = async context => {
  const guarded = await guardRequest(context, 120);
  if (guarded instanceof Response) return guarded;
  const user = await accessUser(context, guarded.env);
  if (!user) return json({ error: 'Sign in with Google or email to use an account.' }, 401);
  await saveAccountSession(guarded.env.DB, guarded.sessionId, user.email, user.name);
  const requestedTrip = context.url.searchParams.get('trip') ?? undefined;
  let tripSession = validTripId(requestedTrip) ? await getTripMembership(guarded.env.DB, user.email, requestedTrip) : undefined;
  if (!tripSession && validTripId(requestedTrip)) {
    tripSession = await getTripSession(guarded.env.DB, guarded.sessionId, requestedTrip);
    if (tripSession) await saveTripMembership(guarded.env.DB, user.email, tripSession);
  }
  return json({ user, tripSession, trips: await listAccountTrips(guarded.env.DB, user.email) });
};
