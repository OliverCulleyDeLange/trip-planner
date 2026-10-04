import type { APIRoute } from 'astro';
import { deleteAccountSession } from '../../../lib/server/database';
import { browserSession, environment, localSignedOutCookieName } from '../../../lib/server/request';

export const prerender = false;

export const GET: APIRoute = async context => {
  const home = `${context.url.origin}${import.meta.env.BASE_URL}`;
  const env = environment(context);
  await deleteAccountSession(env.DB, await browserSession(context));
  if (import.meta.env.DEV) {
    context.cookies.set(localSignedOutCookieName, '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
    return context.redirect(home, 302);
  }
  const logout = new URL('/cdn-cgi/access/logout', context.url.origin);
  logout.searchParams.set('returnTo', home);
  return context.redirect(logout.toString(), 302);
};
