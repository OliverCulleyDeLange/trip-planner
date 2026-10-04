const upstreamOrigin = 'https://trip-scheduler.oliver-trip-planner.workers.dev';
const mountPath = '/trip-planner';

export default {
  async fetch(request) {
    const publicUrl = new URL(request.url);

    if (publicUrl.pathname === mountPath) {
      return Response.redirect(`${publicUrl.origin}${mountPath}/${publicUrl.search}`, 308);
    }

    if (!publicUrl.pathname.startsWith(`${mountPath}/`)) {
      return new Response('Not found', { status: 404 });
    }

    const upstreamUrl = new URL(`${publicUrl.pathname}${publicUrl.search}`, upstreamOrigin);
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', publicUrl.host);
    headers.set('x-forwarded-proto', publicUrl.protocol.slice(0, -1));

    const upstreamResponse = await fetch(new Request(upstreamUrl, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    }));

    const responseHeaders = new Headers(upstreamResponse.headers);
    const location = responseHeaders.get('location');
    if (location) {
      const rewritten = new URL(location, upstreamOrigin);
      if (rewritten.origin === upstreamOrigin) {
        rewritten.protocol = publicUrl.protocol;
        rewritten.host = publicUrl.host;
        responseHeaders.set('location', rewritten.toString());
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
};
