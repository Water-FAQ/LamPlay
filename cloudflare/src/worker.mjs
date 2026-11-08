import { HttpError, SOURCES, resolveRoute, transform } from './routes.mjs';

export const VERSION = '0.1.0-preparation';
const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 12000;
const csv = value => String(value || '').split(',').map(v => v.trim()).filter(Boolean);
const enabled = env => csv(env.ENABLED_SOURCES).filter(v => SOURCES.includes(v));

function originFor(request, env) {
  const value = request.headers.get('Origin');
  if (!value) {
    if (env.ALLOW_ORIGINLESS === 'true') return '';
    throw new HttpError(403, 'origin_required');
  }
  if (value === 'null' || !csv(env.ALLOWED_ORIGINS).includes(value)) throw new HttpError(403, 'origin_denied');
  try { if (new URL(value).origin !== value) throw new Error(); }
  catch { throw new HttpError(503, 'invalid_configuration'); }
  return value;
}

function response(body, status, origin, mime = 'application/json; charset=utf-8', extra = {}) {
  const headers = new Headers({
    'Content-Type': mime,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Vary': 'Origin',
    ...extra
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return new Response(body, { status, headers });
}

async function readBounded(upstream) {
  const length = Number(upstream.headers.get('Content-Length'));
  if (length > MAX_BYTES) { await upstream.body?.cancel(); throw new HttpError(502, 'upstream_too_large'); }
  if (!upstream.body) return '';
  const reader = upstream.body.getReader();
  const chunks = []; let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); throw new HttpError(502, 'upstream_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(result);
}

async function upstreamRequest(spec, fetcher, signal) {
  // A fresh request deliberately excludes client cookies, auth, IP and arbitrary headers.
  const headers = new Headers({ Accept: spec.format === 'html' || spec.format === 'aniboom' ? 'text/html' : 'application/json', ...spec.headers });
  const upstream = await fetcher(spec.target, { method: 'GET', headers, redirect: 'manual', signal, cache: 'no-store' });
  if (upstream.status >= 300 && upstream.status < 400) {
    await upstream.body?.cancel();
    throw new HttpError(502, 'upstream_redirect');
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    throw new HttpError(upstream.status === 429 ? 503 : 502, upstream.status === 401 || upstream.status === 403 ? 'upstream_denied' : 'upstream_http_error', upstream.status);
  }
  const type = (upstream.headers.get('Content-Type') || '').toLowerCase();
  const html = spec.format === 'html' || spec.format === 'aniboom';
  if (!(html ? /text\/(html|plain)/.test(type) : /(?:application\/(?:[a-z0-9.+-]*\+)?json|text\/plain)/.test(type))) {
    await upstream.body?.cancel();
    throw new HttpError(502, 'upstream_content_type');
  }
  const text = await readBounded(upstream);
  const transformed = transform(text, spec);
  const noCache = /(?:private|no-store|no-cache)/i.test(upstream.headers.get('Cache-Control') || '') || upstream.headers.has('Set-Cookie');
  return { ...transformed, cacheable: !noCache };
}

export function createWorker({ fetcher = (...args) => fetch(...args), cache, timeoutMs = TIMEOUT_MS } = {}) {
  return {
    async fetch(request, env = {}, ctx = {}) {
      let origin = '';
      try {
        const url = new URL(request.url);
        // Health does not contact any source or expose account/secret configuration.
        if (url.pathname === '/health' && request.method === 'GET') {
          return response(JSON.stringify({ service: 'lamplay-metadata', version: VERSION, enabledSources: enabled(env), deployedIntegration: false }), 200, '');
        }
        origin = originFor(request, env);
        if (!['GET', 'OPTIONS'].includes(request.method)) throw new HttpError(405, 'method_not_allowed');
        if (url.href.length > 2048 || request.headers.has('Range')) throw new HttpError(400, 'invalid_request');
        const spec = resolveRoute(url);
        if (!enabled(env).includes(spec.source)) throw new HttpError(503, 'source_disabled');
        if (request.method === 'OPTIONS') {
          const method = request.headers.get('Access-Control-Request-Method');
          if (method && method !== 'GET') throw new HttpError(405, 'method_not_allowed');
          // No arbitrary custom headers, cookies or Authorization are needed by this API.
          if (request.headers.get('Access-Control-Request-Headers')) throw new HttpError(400, 'headers_not_allowed');
          return response(null, 204, origin, 'text/plain', { 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '600' });
        }
        if (!env.REQUEST_LIMITER?.limit || !env.SOURCE_LIMITER?.limit) throw new HttpError(503, 'rate_limiter_unavailable');
        // IP is only an approximate abuse control, not an identity or a global quota.
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const decision = await env.REQUEST_LIMITER.limit({ key: 'client:' + ip });
        if (!decision.success) throw new HttpError(429, 'rate_limited');
        const store = cache ?? globalThis.caches?.default;
        // Key includes upstream host/version/normalised parameters, never client credentials.
        const key = new Request(url.origin + '/__metadata_cache/' + VERSION + '/' + encodeURIComponent(spec.target));
        if (spec.ttl && store) {
          try {
            const hit = await store.match(key);
            if (hit) return response(hit.body, 200, origin, hit.headers.get('Content-Type'), { 'X-LamPlay-Cache': 'HIT' });
          } catch { /* A cache outage must not become a source outage. */ }
        }
        const sourceDecision = await env.SOURCE_LIMITER.limit({ key: 'source:' + spec.source });
        if (!sourceDecision.success) throw new HttpError(429, 'rate_limited');
        const controller = new AbortController();
        let timeout;
        try {
          // Race covers both headers and body, even if a dependency ignores AbortSignal.
          const task = upstreamRequest(spec, fetcher, controller.signal);
          const expired = new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new HttpError(504, 'upstream_timeout')); }, timeoutMs); });
          const data = await Promise.race([task, expired]);
          if (spec.ttl && data.cacheable && store && ctx.waitUntil) {
            const cached = new Response(data.body, { headers: { 'Content-Type': data.mime, 'Cache-Control': 'public, max-age=' + spec.ttl } });
            ctx.waitUntil(store.put(key, cached).catch(() => {}));
          }
          return response(data.body, 200, origin, data.mime, { 'X-LamPlay-Cache': spec.ttl ? 'MISS' : 'BYPASS' });
        } finally { clearTimeout(timeout); }
      } catch (error) {
        const known = error instanceof HttpError;
        const status = known ? error.status : 502;
        const payload = { error: { code: known ? error.code : 'upstream_unavailable' } };
        if (known && error.upstreamStatus) payload.error.upstreamStatus = error.upstreamStatus;
        // Do not include raw exceptions, queries, source bodies, cookies or signed links.
        return response(JSON.stringify(payload), status, origin, undefined, status === 429 ? { 'Retry-After': '60' } : {});
      }
    }
  };
}
export default createWorker();
