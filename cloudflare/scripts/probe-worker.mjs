// Opt-in, sequential metadata checks against YOUR deployed Worker, never a deploy.
// Supply credentials through environment variables, never command-line URL parameters.
const base = new URL(process.env.LAMPLAY_WORKER_URL || 'https://replace-with-your-worker.invalid');
if (base.protocol !== 'https:' || base.pathname !== '/' || base.username || base.password || base.search || base.hash || base.hostname.endsWith('.invalid')) throw new Error('Set LAMPLAY_WORKER_URL to your deployed HTTPS origin');
const enabled = (process.env.LAMPLAY_TEST_SOURCES || 'rezka,kodik,filmix,kinotochka').split(',').map(s => s.trim());
const origin = process.env.LAMPLAY_TEST_ORIGIN || 'http://lampa.mx';
const tests = [
  { name: 'health', path: '/health' },
  { name: 'rezka-search', source: 'rezka', path: '/v1/rezka/search?q=Matrix' },
  { name: 'filmix-tv-search', source: 'filmix', path: '/v1/filmix/search?q=Matrix' },
  { name: 'kinotochka-find', source: 'kinotochka', path: '/v1/kinotochka/find?kp=301' },
  { name: 'kodik-search', source: 'kodik', path: '/v1/kodik/search', body: { token: process.env.KODIK_TEST_TOKEN, title: 'Shingeki no Kyojin', limit: 1 }, needs: 'KODIK_TEST_TOKEN' },
  { name: 'kodik-resolve', source: 'kodik', path: '/v1/kodik/resolve', body: { path: process.env.KODIK_TEST_PATH }, needs: 'KODIK_TEST_PATH' },
  { name: 'filmix-mobile-search', source: 'filmix', path: '/v1/filmix/mobile/search', body: { token: process.env.FILMIX_TEST_TOKEN, deviceId: process.env.FILMIX_TEST_DEVICE_ID, q: 'Matrix' }, needs: 'FILMIX_TEST_TOKEN', also: 'FILMIX_TEST_DEVICE_ID' }
];
const report = [];
for (const t of tests) {
  if (t.source && !enabled.includes(t.source)) continue;
  if (t.needs && !process.env[t.needs] || t.also && !process.env[t.also]) { report.push({ name: t.name, skipped: true, reason: 'test_input_not_set' }); continue; }
  try {
    const r = await fetch(new URL(t.path, base), { method: t.body ? 'POST' : 'GET', headers: { Origin: origin, ...(t.body ? { 'Content-Type': 'application/json' } : {}) }, ...(t.body ? { body: JSON.stringify(t.body) } : {}), signal: AbortSignal.timeout(32000), redirect: 'manual' });
    const text = await r.text(); let data;
    try { data = JSON.parse(text); } catch {}
    const item = { name: t.name, status: r.status, ok: r.ok, cache: r.headers.get('X-LamPlay-Cache') };
    // Do not print tokens, cookies, complete responses, source URLs or signed links.
    if (data?.error?.code) item.errorCode = /^[a-z_]{1,60}$/.test(data.error.code) ? data.error.code : 'unknown';
    if (Array.isArray(data?.results)) item.results = data.results.length;
    if (Array.isArray(data?.items)) item.items = data.items.length;
    if (data?.quality && typeof data.quality === 'object') item.qualities = Object.keys(data.quality).filter(k => /^(?:\d+p|auto)$/.test(k));
    report.push(item);
  } catch { report.push({ name: t.name, ok: false, errorCode: 'network_or_timeout' }); }
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), tests: report }, null, 2));
if (report.some(t => t.ok === false)) process.exitCode = 1;
