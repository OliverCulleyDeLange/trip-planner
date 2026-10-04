import type { APIRoute } from 'astro';
import type { CreateTripRequest, TripExport } from '../../../lib/trip-planner/types';
import { createTripAccess, getTripAccess, insertTrip, saveTripMembership, saveTripSession } from '../../../lib/server/database';
import { createTrip, importTrip } from '../../../lib/server/trips';
import { authenticatedUser, guardRequest, json, jsonBody } from '../../../lib/server/request';

export const prerender = false;

type CreateBody =
  | { kind: 'create'; request: CreateTripRequest }
  | { kind: 'import'; exported: TripExport };

export const POST: APIRoute = async context => {
  const guarded = await guardRequest(context, 30);
  if (guarded instanceof Response) return guarded;
  try {
    const user = await authenticatedUser(context, guarded.env, guarded.sessionId);
    const body = await jsonBody<CreateBody>(context.request);
    const result = body.kind === 'create' ? createTrip(body.request)
      : body.kind === 'import' ? importTrip(body.exported)
        : undefined;
    if (!result) return json({ error: 'Unsupported trip type.' }, 400);
    result.trip = await insertTrip(guarded.env.DB, result.trip);
    await createTripAccess(guarded.env.DB, result.trip.id, user?.email);
    await saveTripSession(guarded.env.DB, guarded.sessionId, result.session);
    if (user) await saveTripMembership(guarded.env.DB, user.email, result.session);
    return json({ ...result, access: await getTripAccess(guarded.env.DB, result.trip.id, user?.email) }, 201);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Could not create the trip.';
    return json({ error: message }, /UNIQUE constraint failed/.test(message) ? 409 : 400);
  }
};
