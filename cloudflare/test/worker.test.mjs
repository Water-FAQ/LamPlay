import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createWorker } from '../src/worker.mjs';
import { resolveRoute, transform } from '../src/routes.mjs';

const allow = { limit: async () => ({ success: true }) };
const env = { ENABLED_SOURCES: 'animelib,cdnvideohub,animego,aniboom', ALLOWED_ORIGINS: 'http://lampa.mx,https://lampa.mx', REQUEST_LIMITER: allow, SOURCE_LIMITER: allow };
const req = (path, headers = {}, method = 'GET') => new Request('https://worker.example' + path, { method, headers: { Origin: 'http://lampa.mx', 'CF-Connecting-IP': '192.0.2.1', ...headers } });
const json = (data, headers = {}) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...headers } });
const make = (fetcher, options = {}) => createWorker({ fetcher, ...options });
async function code(result) { return (await result.json()).error.code; }
const search = '/v1/animelib/search?q=Naruto';

test('fixed upstream endpoints and source-specific identifiers', () => {
  const cases = [
    [search, 'https://api.lib.social/api/anime?q=Naruto&page=1'],
    ['/v1/animelib/episodes?anime_id=11--naruto-anime', 'https://api.lib.social/api/episodes?anime_id=11--naruto-anime'],
    ['/v1/animelib/episode?id=75', 'https://api.lib.social/api/episodes/75'],
    ['/v1/animelib/constants', 'https://api.lib.social/api/constants?fields%5B%5D=videoServers'],
    ['/v1/cdnvideohub/playlist?id=301', 'https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?pub=12&aggr=kp&id=301'],
    ['/v1/cdnvideohub/playlist?id=1&aggr=mali', 'https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?pub=747&aggr=mali&id=1'],
    ['/v1/cdnvideohub/video?id=123', 'https://plapi.cdnvideohub.com/api/v1/player/sv/video/123'],
    ['/v1/animego/player?id=70', 'https://animego.org/player/70'],
    ['/v1/animego/episode?id=80', 'https://animego.org/player/videos/80'],
    ['/v1/aniboom/embed?id=example123&episode=2&translation=30', 'https://aniboom.one/embed/example123?episode=2&translation=30']
  ];
  for (const [path, target] of cases) assert.equal(resolveRoute(new URL('https://worker.example' + path)).target, target);
});

test('query encoding cannot change upstream path or authority', () => {
  const spec = resolveRoute(new URL('https://worker.example/v1/animego/search?q=' + encodeURIComponent('A & id=https://127.0.0.1')));
  const u = new URL(spec.target);
  assert.equal(u.hostname, 'animego.org'); assert.equal(u.searchParams.get('q'), 'A & id=https://127.0.0.1');
});

test('malformed, duplicate, secret and arbitrary URL parameters never reach network', async () => {
  let calls = 0; const worker = make(async () => { calls++; return json({ data: [] }); });
  for (const path of [
    '/?url=http://127.0.0.1', '/v1/proxy?url=https://example.com', '/v1/aniboom/embed?id=..%2Fadmin',
    search + '&url=https://example.com', search + '&q=Other', search + '&token=private',
    '/v1/animelib/search?q=', '/v1/animelib/search?q=%00',
    '/v1/animelib/episode?id=-1', '/v1/animelib/episodes?anime_id=220',
    '/v1/cdnvideohub/playlist?id=301&pub=99', '/v1/cdnvideohub/playlist?id=301&aggr=tmdb',
    '/v1/cdnvideohub/video?id=https%3A%2F%2F127.0.0.1', '/video.mp4'
  ]) assert.ok([400,404].includes((await worker.fetch(req(path), env)).status), path);
  assert.equal(calls, 0);
});

test('sources are disabled by default; health makes no source calls', async () => {
  const worker = make(() => { throw new Error('network called'); });
  assert.equal(await code(await worker.fetch(req(search), { ...env, ENABLED_SOURCES: '' })), 'source_disabled');
  const h = await worker.fetch(req('/health'), {});
  assert.equal(h.status, 200); assert.deepEqual((await h.json()).enabledSources, []);
});

test('origin allowlist exact matching, absent/null denied, optional native client', async () => {
  const worker = make(async () => json({ data: [] }));
  for (const origin of ['https://lampa.mx.evil.test','null','https://evil.test']) assert.equal((await worker.fetch(req(search, { Origin: origin }), env)).status, 403);
  const absent = new Request('https://worker.example' + search);
  assert.equal((await worker.fetch(absent, env)).status, 403);
  const allowed = await worker.fetch(absent, { ...env, ALLOW_ORIGINLESS: 'true' });
  assert.equal(allowed.status, 200); assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), null);
});

test('CORS preflight limited to GET, no credential headers and no upstream fetch', async () => {
  const worker = make(() => { throw new Error('network called'); });
  const r = await worker.fetch(req(search, { 'Access-Control-Request-Method': 'GET' }, 'OPTIONS'), env);
  assert.equal(r.status, 204); assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'http://lampa.mx');
  assert.equal(r.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal((await worker.fetch(req(search, { 'Access-Control-Request-Headers': 'authorization' }, 'OPTIONS'), env)).status, 400);
  assert.equal((await worker.fetch(req(search, { 'Access-Control-Request-Method': 'POST' }, 'OPTIONS'), env)).status, 405);
});

test('POST and media Range rejected before fetch', async () => {
  const worker = make(() => { throw new Error('network called'); });
  assert.equal((await worker.fetch(req(search, {}, 'POST'), env)).status, 405);
  assert.equal((await worker.fetch(req(search, { Range: 'bytes=0-2' }), env)).status, 400);
});

test('upstream receives neither personal credentials nor client IP', async () => {
  let seen;
  const worker = make(async (url, options) => { seen = options; return json({ data: [] }, { 'Set-Cookie': 'secret=example', 'Authorization': 'private' }); });
  const r = await worker.fetch(req(search, { Cookie: 'session=example', Authorization: 'Bearer example', 'X-Custom': 'value', 'X-Forwarded-For': '192.0.2.1' }), env);
  assert.equal(r.status, 200);
  for (const key of ['cookie','authorization','origin','x-custom','x-forwarded-for','cf-connecting-ip']) assert.equal(seen.headers.get(key), null);
  for (const key of ['set-cookie','authorization']) assert.equal(r.headers.get(key), null);
  assert.equal(seen.redirect, 'manual'); assert.equal(r.headers.get('Cache-Control'), 'no-store');
});

test('redirects are never followed, including private hosts and same-origin paths', async () => {
  for (const location of ['http://127.0.0.1/private','https://evil.example/','/another']) {
    let count = 0; const worker = make(async () => { count++; return new Response('', { status: 302, headers: { Location: location } }); });
    const r = await worker.fetch(req(search), env); assert.equal(await code(r), 'upstream_redirect'); assert.equal(count, 1);
  }
});

test('source errors are distinct from empty successful results, not cached', async () => {
  for (const status of [401,403,404,429,500]) {
    const r = await make(async () => new Response('private source body', { status })).fetch(req(search), env);
    const d = await r.json(); assert.equal(d.error.upstreamStatus, status);
    assert.ok(!JSON.stringify(d).includes('private source body'));
  }
  const empty = await make(async () => json({ data: [] })).fetch(req(search), env);
  assert.equal(empty.status, 200); assert.deepEqual((await empty.json()).data, []);
});

test('shape changes, HTML errors and binary media cannot masquerade as metadata', async () => {
  const responses = [json({ message: 'denied' }),new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }),new Response('video', { headers: { 'Content-Type': 'video/mp4' } })];
  for (const upstream of responses) assert.equal((await make(async () => upstream).fetch(req(search), env)).status, 502);
});

test('streamed and declared oversized bodies are bounded', async () => {
  const oversized = new Uint8Array(1024 * 1024 + 1);
  for (const headers of [{ 'Content-Type': 'application/json' }, { 'Content-Type': 'application/json', 'Content-Length': '5000000' }]) {
    const r = await make(async () => new Response(oversized, { headers })).fetch(req(search), env);
    assert.equal(await code(r), 'upstream_too_large');
  }
});

test('timeout covers connection and incomplete response body', async () => {
  const wait = () => new Promise(() => {});
  const stalledBody = () => new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'application/json' } });
  for (const fetcher of [wait, stalledBody]) {
    const r = await make(fetcher, { timeoutMs: 10 }).fetch(req(search), env);
    assert.equal(r.status, 504); assert.equal(await code(r), 'upstream_timeout');
  }
});

test('required rate bindings and per-client/per-source refusal prevent upstream calls', async () => {
  const worker = make(() => { throw new Error('network called'); });
  assert.equal((await worker.fetch(req(search), { ...env, REQUEST_LIMITER: undefined })).status, 503);
  for (const binding of ['REQUEST_LIMITER','SOURCE_LIMITER']) {
    const r = await worker.fetch(req(search), { ...env, [binding]: { limit: async () => ({ success: false }) } });
    assert.equal(r.status, 429); assert.equal(r.headers.get('Retry-After'), '60');
  }
});

function memoryCache() {
  const entries = new Map();
  return { entries, async match(key) { return entries.get(key.url)?.clone(); }, async put(key, value) { entries.set(key.url, value.clone()); } };
}
test('cache reuses canonical metadata across origins without leaking CORS', async () => {
  const cache = memoryCache(); let calls = 0; const tasks = [];
  const worker = make(async () => { calls++; return json({ data: [] }); }, { cache });
  const a = await worker.fetch(req(search), env, { waitUntil: p => tasks.push(p) }); await Promise.all(tasks);
  assert.equal(a.headers.get('X-LamPlay-Cache'), 'MISS');
  const b = await worker.fetch(req(search + '&page=1', { Origin: 'https://lampa.mx' }), env);
  assert.equal(b.headers.get('X-LamPlay-Cache'), 'HIT'); assert.equal(b.headers.get('Access-Control-Allow-Origin'), 'https://lampa.mx'); assert.equal(calls, 1);
  assert.equal((await worker.fetch(req(search, { Origin: 'https://evil.test' }), env)).status, 403);
});

test('no shared caching for private, no-store or cookie responses', async () => {
  for (const headers of [{ 'Cache-Control': 'private' }, { 'Cache-Control': 'no-store' }, { 'Set-Cookie': 'example=1' }]) {
    const cache = memoryCache(); const tasks = [];
    await make(async () => json({ data: [] }, headers), { cache }).fetch(req(search), env, { waitUntil: p => tasks.push(p) });
    await Promise.all(tasks); assert.equal(cache.entries.size, 0);
  }
});

test('CDNVideoHub ads stripped and signed video responses never shared-cached', async () => {
  const playlist = transform(JSON.stringify({ titleName: 'Example', isSerial: true, items: [{ vkId: '123', season: 1, ads: 'unwanted' }], vast: 'unwanted', ads: 'unwanted' }), { format: 'cvh-playlist' });
  assert.ok(!playlist.body.includes('unwanted')); assert.equal(JSON.parse(playlist.body).items[0].vkId, '123');
  const cache = memoryCache(); const tasks = [];
  const r = await make(async () => json({ sources: { mpeg4kUrl: 'https://media.example/stream.mp4?signature=example', vast: 'https://ads.example' }, ads: 'unwanted' }), { cache }).fetch(req('/v1/cdnvideohub/video?id=123'), env, { waitUntil: p => tasks.push(p) });
  await Promise.all(tasks); const data = await r.json(); assert.equal(r.headers.get('X-LamPlay-Cache'), 'BYPASS'); assert.equal(cache.entries.size, 0); assert.equal(data.ads, undefined); assert.equal(data.sources.vast, undefined);
});

test('AnimeGO JSON content is unwrapped as non-executable text', () => {
  const r = transform(JSON.stringify({ data: { content: '<button data-player="example">Example</button>' } }), { format: 'go-player' });
  assert.ok(r.body.startsWith('<button')); assert.equal(r.mime, 'text/plain; charset=utf-8');
});

test('Aniboom attribute parsing extracts only media references, no ads or scripts', () => {
  const payload = { hls: JSON.stringify({ src: 'https://media.example/master.m3u8?a=1&b=2' }), vast: 'ad-example', ads: [{ src: 'ad-example' }] };
  const encoded = JSON.stringify(payload).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const r = transform('<script>bad()</script><video data-parameters="' + encoded + '"></video>', { format: 'aniboom' });
  const data = JSON.parse(r.body); assert.equal(data.quality.auto, 'https://media.example/master.m3u8?a=1&b=2'); assert.ok(!r.body.includes('ad-example')); assert.ok(!r.body.includes('script'));
});

test('challenge is a separate error; no bypass or retry loop', async () => {
  let calls = 0;
  const worker = make(async () => { calls++; return new Response('Verify you are human', { headers: { 'Content-Type': 'text/html' } }); });
  const r = await worker.fetch(req('/v1/animego/search?q=Example'), env);
  assert.equal(await code(r), 'upstream_challenge'); assert.equal(calls, 1);
});

test('ES5 optional client preserves Unicode query, reports source errors and cancels late callbacks', () => {
  const fake = { open(...args) { this.openArgs = args; }, send() {}, abort() { this.aborted = true; } };
  const context = { URL, window: { URL } }; vm.runInNewContext(fs.readFileSync(new URL('../client/transport.js', import.meta.url), 'utf8'), context);
  const client = context.window.LamPlayMetadataClient('https://worker.example', () => fake);
  let done = 0, failed = 0;
  const handle = client.request('animelib/search', { q: 'Атака & титанов' }, () => done++, () => failed++);
  assert.equal(new URL(fake.openArgs[1]).searchParams.get('q'), 'Атака & титанов'); assert.equal(fake.withCredentials, false);
  handle.abort(); fake.status = 200; fake.responseText = '{"data":[]}'; fake.onload(); assert.equal(done, 0); assert.equal(failed, 0);
  client.request('animelib/search', { q: 'Example' }, () => done++, error => { failed++; assert.equal(error.code, 'source_disabled'); });
  fake.status = 503; fake.responseText = '{"error":{"code":"source_disabled"}}'; fake.onload(); assert.equal(failed, 1);
});
