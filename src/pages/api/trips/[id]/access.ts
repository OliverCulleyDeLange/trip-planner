import type { APIRoute } from 'astro';
import type { TripAccessMode, TripPermission, TripPermissionRole } from '../../../../lib/server/database';
import { getTripAccess, getTripMembership, getTripOwnerEmail, getTripSession, loadTrip, saveTripAccess, saveTripMembership } from '../../../../lib/server/database';
import { guardWriteRequest, json, jsonBody, validTripId } from '../../../../lib/server/request';

export const prerender = false;

export const POST: APIRoute = async context => {
  const guarded = await guardWriteRequest(context, 30);
  if (guarded instanceof Response) return guarded;
  const tripId = context.params.id;
  if (!validTripId(tripId)) return json({ error: 'Trip not found.' }, 404);
  if (tripId === 'demo') return json({ error: 'The demo trip is permanently public and its access settings cannot be changed.' }, 403);
  const trip = await loadTrip(guarded.env.DB, tripId);
  if (!trip) return json({ error: 'Trip not found.' }, 404);
  let ownerEmail = await getTripOwnerEmail(guarded.env.DB, tripId);
  if (ownerEmail && ownerEmail !== guarded.user.email) return json({ error: 'Only the trip owner can change access.' }, 403);
  if (!ownerEmail) {
    const membership = await getTripMembership(guarded.env.DB, guarded.user.email, tripId)
      ?? await getTripSession(guarded.env.DB, guarded.sessionId, tripId);
    if (!membership || membership.participantId !== trip.participants[0]?.id) {
      return json({ error: 'Only the person who created this trip can restrict access.' }, 403);
    }
    ownerEmail = guarded.user.email;
    await saveTripMembership(guarded.env.DB, guarded.user.email, membership);
  }
  try {
    const body = await jsonBody<{ mode: TripAccessMode; permissions?: TripPermission[] }>(context.request, 50_000);
    if (body.mode !== 'public-link' && body.mode !== 'restricted') return json({ error: 'Choose a valid visibility option.' }, 400);
    const seen = new Set<string>();
    const permissions = (body.permissions ?? []).map(permission => {
      const email = permission.email.trim().toLowerCase();
      const role = permission.role as TripPermissionRole;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Enter a valid email address for ${permission.email || 'the invite'}.`);
      if (role !== 'viewer' && role !== 'editor') throw new Error('Choose viewer or editor permission.');
      if (email === ownerEmail || seen.has(email)) throw new Error(`${email} is already included.`);
      seen.add(email);
      return { email, role };
    });
    if (permissions.length > 50) return json({ error: 'A trip can have up to 50 invited accounts.' }, 400);
    await saveTripAccess(guarded.env.DB, tripId, ownerEmail, body.mode, permissions);
    return json({ access: await getTripAccess(guarded.env.DB, tripId, guarded.user.email) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not update trip access.' }, 400);
  }
};
