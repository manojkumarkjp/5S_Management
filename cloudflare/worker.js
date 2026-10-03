/* Cloudflare Worker: serves the web app (static assets from server/public) and forwards
   /api/* to the AWS backend. The web app calls relative /api/... URLs with same-origin cookies,
   so the browser must see the API on the same host as the static files.
   API_ORIGIN is set in wrangler.jsonc, (no trailing slash). */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.API_ORIGIN) return new Response('API_ORIGIN is not configured', { status: 500 });
    const upstream = new Request(env.API_ORIGIN + url.pathname + url.search, request);
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) upstream.headers.set('X-Forwarded-For', ip);
    return fetch(upstream, { redirect: 'manual' });
  },
};
