import type { APIRoute } from 'astro';
import type { CreateTripRequest, TripExport } from '../../../lib/trip-planner/types';
import { insertTrip, saveTripSession } from '../../../lib/server/database';
import { createDemo, createTrip, importTrip } from '../../../lib/server/trips';
import { guardRequest, json, jsonBody } from '../../../lib/server/request';

export const prerender = false;

type CreateBody =
  | { kind: 'create'; request: CreateTripRequest }
  | { kind: 'demo' }
  | { kind: 'import'; exported: TripExport };

export const POST: APIRoute = async context => {
  const guarded = await guardRequest(context, 30);
  if (guarded instanceof Response) return guarded;
  try {
    const body = await jsonBody<CreateBody>(context.request);
    const result = body.kind === 'create' ? createTrip(body.request)
      : body.kind === 'demo' ? createDemo()
        : body.kind === 'import' ? importTrip(body.exported)
          : undefined;
    if (!result) return json({ error: 'Unsupported trip type.' }, 400);
    result.trip = await insertTrip(guarded.env.DB, result.trip);
    await saveTripSession(guarded.env.DB, guarded.sessionId, result.session);
    return json(result, 201);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Could not create the trip.';
    return json({ error: message }, /UNIQUE constraint failed/.test(message) ? 409 : 400);
  }
};
