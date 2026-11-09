import { HttpError, SOURCES, resolveRoute, transform } from './routes.mjs';
import { sourcePolicy, resolveKodik, loginRezka } from './source-routes.mjs';

export const VERSION = '0.3.0-testing';
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

async function readBounded(upstream, maxBytes = MAX_BYTES, incoming = false) {
  const tooLarge = () => new HttpError(incoming ? 413 : 502, incoming ? 'request_body_too_large' : 'upstream_too_large');
  const length = Number(upstream.headers.get('Content-Length'));
  if (length > maxBytes) { await upstream.body?.cancel(); throw tooLarge(); }
  if (!upstream.body) return '';
  const reader = upstream.body.getReader();
  const chunks = []; let total = 0, timer;
  const deadline = incoming ? new Promise((_, reject) => { timer = setTimeout(() => { reject(new HttpError(408, 'request_timeout')); reader.cancel().catch(() => {}); }, 2000); }) : null;
  try {
    while (true) {
      const { value, done } = await (deadline ? Promise.race([reader.read(), deadline]) : reader.read());
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw tooLarge(); }
      chunks.push(value);
    }
  } finally { clearTimeout(timer); reader.releaseLock(); }
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(result);
}

async function upstreamRequest(spec, fetcher, signal) {
  // A fresh request deliberately excludes client cookies, auth, IP and arbitrary headers.
  const headers = new Headers({ Accept: ['html','aniboom','source-html'].includes(spec.format) ? 'text/html' : spec.format === 'source-script' ? 'application/javascript,text/javascript,text/plain' : 'application/json', ...spec.headers });
  if (spec.body !== undefined) headers.set('Content-Type', 'application/x-www-form-urlencoded');
  const upstream = await fetcher(spec.target, { method: spec.method || 'GET', ...(spec.body === undefined ? {} : { body: spec.body }), headers, redirect: 'manual', signal, cache: 'no-store' });
  if (upstream.status >= 300 && upstream.status < 400) {
    await upstream.body?.cancel();
    throw new HttpError(502, 'upstream_redirect');
  }
  if (!upstream.ok) {
    if (spec.source === 'filmix' && upstream.status === 403) {
      let denied; try { denied = JSON.parse(await readBounded(upstream, 8192)); } catch {}
      if (typeof denied?.message === 'string' && /видео заблокировано/i.test(denied.message)) throw new HttpError(403, 'source_video_blocked', 403);
    } else await upstream.body?.cancel();
    if (spec.source === 'kodik' && ['kodik-api','kodik-get-player'].includes(spec.format) && upstream.status === 401) throw new HttpError(401, 'source_token_rejected');
    throw new HttpError(upstream.status === 429 ? 503 : 502, upstream.status === 401 || upstream.status === 403 ? 'upstream_denied' : 'upstream_http_error', upstream.status);
  }
  const type = (upstream.headers.get('Content-Type') || '').toLowerCase();
  const html = ['html','aniboom','source-html'].includes(spec.format);
  const script = spec.format === 'source-script';
  if (!(html ? /text\/(html|plain)/.test(type) : script ? /(?:application|text)\/(?:javascript|x-javascript|ecmascript|plain)/.test(type) : /(?:application\/(?:[a-z0-9.+-]*\+)?json|text\/plain)/.test(type))) {
    await upstream.body?.cancel();
    throw new HttpError(502, 'upstream_content_type');
  }
  const text = await readBounded(upstream);
  const transformed = transform(text, spec);
  const noCache = /(?:private|no-store|no-cache)/i.test(upstream.headers.get('Cache-Control') || '') || upstream.headers.has('Set-Cookie');
  return { ...transformed, cacheable: !noCache, ...(spec.captureCookies ? { cookies: typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : typeof upstream.headers.getAll === 'function' ? upstream.headers.getAll('Set-Cookie') : [] } : {}) };
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
        if (!['GET', 'POST', 'OPTIONS'].includes(request.method)) throw new HttpError(405, 'method_not_allowed');
        if (url.href.length > 2048 || request.headers.has('Range')) throw new HttpError(400, 'invalid_request');
        const policy = sourcePolicy(url.pathname);
        let spec = policy ? null : resolveRoute(url, env);
        const source = policy ? policy.source : spec.source;
        const methods = policy ? policy.methods : ['GET'];
        if (!enabled(env).includes(source)) throw new HttpError(503, 'source_disabled');
        if (request.method === 'OPTIONS') {
          const method = request.headers.get('Access-Control-Request-Method') || 'GET';
          if (!methods.includes(method)) throw new HttpError(405, 'method_not_allowed');
          const requested = request.headers.get('Access-Control-Request-Headers') || '';
          if (requested && !(method === 'POST' && requested.toLowerCase().trim() === 'content-type')) throw new HttpError(400, 'headers_not_allowed');
          return response(null, 204, origin, 'text/plain', {
            'Access-Control-Allow-Methods': methods.join(', ') + ', OPTIONS',
            ...(methods.includes('POST') ? { 'Access-Control-Allow-Headers': 'Content-Type' } : {}),
            'Access-Control-Max-Age': '600'
          });
        }
        if (!methods.includes(request.method)) throw new HttpError(405, 'method_not_allowed');
        if (!env.REQUEST_LIMITER?.limit || !env.SOURCE_LIMITER?.limit) throw new HttpError(503, 'rate_limiter_unavailable');
        // IP is only an approximate abuse control, not an identity or a global quota.
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const decision = await env.REQUEST_LIMITER.limit({ key: 'client:' + ip });
        if (!decision.success) throw new HttpError(429, 'rate_limited');
        if (policy) {
          let body;
          if (request.method === 'POST') {
            if (url.search) throw new HttpError(400, 'invalid_parameters');
            if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) throw new HttpError(415, 'json_body_required');
            const text = await readBounded(request, 16384, true);
            try { body = JSON.parse(text); } catch { throw new HttpError(400, 'invalid_json'); }
          }
          spec = resolveRoute(url, env, request.method, body);
        }
        const store = cache ?? globalThis.caches?.default;
        // Key includes upstream host/version/normalised parameters, never client credentials.
        const key = spec.ttl ? new Request(url.origin + '/__metadata_cache/' + VERSION + '/' + encodeURIComponent(spec.target)) : null;
        if (spec.ttl && store) {
          try {
            const hit = await store.match(key);
            if (hit) return response(hit.body, 200, origin, hit.headers.get('Content-Type'), { 'X-LamPlay-Cache': 'HIT' });
          } catch { /* A cache outage must not become a source outage. */ }
        }
        const sourceDecision = await env.SOURCE_LIMITER.limit({ key: 'source:' + source });
        if (!sourceDecision.success) throw new HttpError(429, 'rate_limited');
        const controller = new AbortController();
        let timeout;
        try {
          // Race covers both headers and body, even if a dependency ignores AbortSignal.
          let steps = 0;
          const step = async entry => {
            if (++steps > 3) throw new HttpError(502, 'upstream_request_limit');
            if (steps > 1 && !(await env.SOURCE_LIMITER.limit({ key: 'source:' + source })).success) throw new HttpError(429, 'rate_limited');
            return upstreamRequest(entry, fetcher, controller.signal);
          };
          const task = spec.flow === 'rezka-login' ? loginRezka(spec, step) : spec.flow === 'kodik-resolve' ? resolveKodik(spec, step) : step(spec);
          const expired = new Promise((_, reject) => { timeout = setTimeout(() => { reject(new HttpError(504, 'upstream_timeout')); controller.abort(); }, spec.flow ? 25000 : timeoutMs); });
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
