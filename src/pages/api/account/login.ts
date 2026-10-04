import type { APIRoute } from 'astro';
import { guardWriteRequest, localSignedOutCookieName } from '../../../lib/server/request';

export const prerender = false;

export const GET: APIRoute = async context => {
  if (import.meta.env.DEV) context.cookies.delete(localSignedOutCookieName, { path: '/' });
  const guarded = await guardWriteRequest(context, 60);
  if (guarded instanceof Response) return guarded;
  const requested = context.url.searchParams.get('return');
  const target = requested?.startsWith('/trip-planner/') || requested === '/trip-planner' ? requested : `${import.meta.env.BASE_URL}`;
  return context.redirect(target, 302);
};
