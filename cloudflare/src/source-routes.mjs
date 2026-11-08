// Source protocols adapted from LamPlay 0.22.0 and inspected online_mod.
// No caller-controlled upstream host, login/password storage or remote JS execution.
import { HttpError } from './errors.mjs';

const policies = {
  'rezka/search': ['GET', 'POST'], 'rezka/page': ['GET', 'POST'],
  'rezka/episodes': ['POST'], 'rezka/stream': ['POST'],
  'kodik/search': ['POST'], 'kodik/list': ['POST'], 'kodik/get-player': ['POST'],
  'kodik/integration-script': ['GET'], 'kodik/page': ['GET'], 'kodik/resolve': ['POST'],
  'filmix/search': ['GET'], 'filmix/video-links': ['GET'], 'filmix/suggestions': ['GET'],
  'filmix/mobile/search': ['POST'], 'filmix/mobile/post': ['POST'],
  'filmix/mobile/profile': ['POST'], 'filmix/mobile/token-request': ['POST'],
  'kinotochka/search': ['GET'], 'kinotochka/find': ['GET'],
  'kinotochka/page': ['GET'], 'kinotochka/playlist': ['GET']
};
export function sourcePolicy(path) {
  const key = path.replace(/^\/v1\//, '');
  return policies[key] && path === '/v1/' + key ? { source: key.split('/')[0], methods: policies[key] } : null;
}
const bad = () => { throw new HttpError(400, 'invalid_parameters'); };
function params(url, body, allowed) {
  const values = body === undefined ? Object.fromEntries(url.searchParams) : body;
  if (body !== undefined && url.search) bad();
  if (!values || typeof values !== 'object' || Array.isArray(values)) bad();
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) bad();
  for (const [key, value] of Object.entries(values)) {
    if (body === undefined && ['token','sessionCookie'].includes(key)) bad();
    if (!allowed.includes(key) || !['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 5000) bad();
  }
  return values;
}
const str = value => value === undefined ? '' : String(value);
const id = value => /^[1-9]\d{0,14}$/.test(str(value)) ? str(value) : bad();
const zeroId = value => /^\d{1,8}$/.test(str(value)) ? str(value) : bad();
const q = value => { const v = str(value).trim(); return v && v.length <= 150 && !/[\x00-\x1f\x7f]/.test(v) ? v : bad(); };
const token = value => /^[a-zA-Z0-9_.-]{8,256}$/.test(str(value)) ? str(value) : bad();
const bool = value => value === true || value === 'true' || value === 1 || value === '1' ? 'true' : value === false || value === 'false' || value === 0 || value === '0' ? 'false' : bad();
function origin(env, key, fallback) {
  try {
    const u = new URL(env[key] || fallback);
    if (u.protocol !== 'https:' || u.origin !== u.href.replace(/\/$/, '') || u.username || u.password || u.port || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(u.hostname) || /^\d+(?:\.\d+){3}$/.test(u.hostname) || /\.(?:local|localhost|internal|test|invalid)$/i.test(u.hostname)) throw new Error();
    return u.origin;
  } catch { throw new HttpError(503, 'invalid_configuration'); }
}
function pagePath(value) {
  const path = str(value);
  return path.length <= 350 && /^\/(?:[a-z0-9_-]+\/)*[1-9]\d*[-a-z0-9_]*\.html$/i.test(path) ? path : bad();
}
function kodikPath(value) {
  const path = str(value);
  return /^\/(?:serial|seria|video)\/[1-9]\d{0,14}\/[a-zA-Z0-9_-]{1,128}(?:\/(?:\d{3,4}p)?)?\/?$/.test(path) ? path : bad();
}
function cookie(value) {
  if (value === undefined || value === '') return '';
  if (!/^[\x20-\x7e]{1,4096}$/.test(str(value)) || !str(value).includes('=')) bad();
  return str(value);
}
function spec(source, target, format, headers = {}, body) {
  return { source, target, format, headers, ttl: 0, method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: new URLSearchParams(body).toString() }) };
}
export function resolveSourceRoute(url, env = {}, method = 'GET', body) {
  const policy = sourcePolicy(url.pathname);
  if (!policy) throw new HttpError(404, 'route_not_found');
  if (!policy.methods.includes(method)) throw new HttpError(405, 'method_not_allowed');
  const source = policy.source;
  const fields = (names) => params(url, method === 'POST' ? body : undefined, names);
  let p;
  if (source === 'rezka') {
    const host = origin(env, 'REZKA_ORIGIN', 'https://rezka.ag');
    const headers = { Origin: host, Referer: host + '/', 'X-Requested-With': 'XMLHttpRequest' };
    const withCookie = p => { const c = cookie(p.sessionCookie); if (c) headers.Cookie = c; };
    if (url.pathname.endsWith('/search')) {
      p = fields(['q', 'sessionCookie']); withCookie(p);
      return spec(source, host + '/search/?' + new URLSearchParams({ do: 'search', subaction: 'search', q: q(p.q) }), 'source-html', headers);
    }
    if (url.pathname.endsWith('/page')) {
      p = fields(['path', 'sessionCookie']); withCookie(p); headers.Referer = host + pagePath(p.path);
      return spec(source, headers.Referer, 'source-html', headers);
    }
    p = fields(['id', 'translator_id', 'favs', 'season', 'episode', 'movie', 'is_camrip', 'is_ads', 'is_director', 'sessionCookie']);
    withCookie(p);
    const payload = { id: id(p.id), translator_id: zeroId(p.translator_id), favs: str(p.favs) };
    if (!/^[a-zA-Z0-9_,\s-]{0,2000}$/.test(payload.favs)) bad();
    if (url.pathname.endsWith('/episodes')) {
      if (['season','episode','movie','is_camrip','is_ads','is_director'].some(k => p[k] !== undefined)) bad();
      payload.action = 'get_episodes';
    } else {
      const movie = p.movie === undefined ? false : bool(p.movie) === 'true';
      payload.action = movie ? 'get_movie' : 'get_stream';
      if (movie) {
        if (p.season !== undefined || p.episode !== undefined) bad();
        for (const key of ['is_camrip','is_ads','is_director']) { const v = str(p[key] ?? '0'); if (!/^[01]$/.test(v)) bad(); payload[key] = v; }
      } else {
        if (['is_camrip','is_ads','is_director'].some(k => p[k] !== undefined)) bad();
        payload.season = zeroId(p.season); payload.episode = zeroId(p.episode);
      }
    }
    return spec(source, host + '/ajax/get_cdn_series/', 'rezka-json', headers, payload);
  }
  if (source === 'kodik') {
    if (url.pathname.endsWith('/integration-script')) { fields([]); return spec(source, 'https://kodik-add.com/add-players.min.js', 'source-script'); }
    if (url.pathname.endsWith('/page') || url.pathname.endsWith('/resolve')) {
      p = fields(['path', 'season', 'episode', 'translation']);
      const host = origin(env, 'KODIK_PLAYER_ORIGIN', 'https://kodikplayer.com');
      const u = new URL(host + kodikPath(p.path));
      for (const key of ['season','episode','translation']) if (p[key] !== undefined) u.searchParams.set(key, zeroId(p[key]));
      return { ...spec(source, u.href, 'source-html', { Referer: host + '/' }), ...(url.pathname.endsWith('/resolve') ? { flow: 'kodik-resolve' } : {}) };
    }
    const host = origin(env, 'KODIK_API_ORIGIN', 'https://kodik-api.com');
    const getPlayer = url.pathname.endsWith('/get-player');
    p = fields(getPlayer ? ['token','title','year','shikimoriID','kinopoiskID','imdbID'] : ['token','title','year','shikimori_id','kinopoisk_id','imdb_id','limit','next','id','with_episodes','with_seasons']);
    const payload = { token: token(p.token) };
    for (const key of ['title','year','shikimoriID','kinopoiskID','imdbID','shikimori_id','kinopoisk_id','imdb_id','limit','next','id']) {
      if (p[key] === undefined) continue;
      const v = str(p[key]);
      if (key === 'title') payload[key] = q(v);
      else if (key === 'year') payload[key] = /^(19|20)\d{2}$/.test(v) ? v : bad();
      else if (/imdb/i.test(key)) payload[key] = /^tt\d{1,12}$/.test(v) ? v : bad();
      else if (key === 'next') payload[key] = /^[a-zA-Z0-9_+=/.-]{1,2000}$/.test(v) ? v : bad();
      else if (key === 'id') payload[key] = /^(?:serial|video)-\d{1,15}$/.test(v) ? v : bad();
      else if (key === 'limit') payload[key] = Number(v) >= 1 && Number(v) <= 100 && /^\d+$/.test(v) ? v : bad();
      else payload[key] = id(v);
    }
    const endpoint = url.pathname.split('/').pop();
    if (endpoint !== 'list' && !['title','shikimoriID','kinopoiskID','imdbID','shikimori_id','kinopoisk_id','imdb_id','id'].some(k => payload[k])) bad();
    if (getPlayer) { payload.hasPlayer = 'false'; payload.url = 'http://lampa.mx/'; }
    else for (const key of ['with_episodes','with_seasons']) payload[key] = p[key] === undefined ? 'true' : bool(p[key]);
    return spec(source, host + '/' + endpoint, getPlayer ? 'kodik-get-player' : 'kodik-api', {}, payload);
  }
  if (source === 'filmix') {
    if (url.pathname === '/v1/filmix/search') { p = fields(['q']); return spec(source, 'https://api.filmix.tv/api-fx/list?' + new URLSearchParams({ search: q(p.q), limit: '48' }), 'filmix-tv-search'); }
    if (url.pathname === '/v1/filmix/video-links') { p = fields(['id']); return spec(source, 'https://api.filmix.tv/api-fx/post/' + id(p.id) + '/video-links', 'filmix-tv-links'); }
    if (url.pathname === '/v1/filmix/suggestions') { p = fields(['q']); return spec(source, 'https://filmix.gg/api/v2/suggestions?' + new URLSearchParams({ search_word: q(p.q) }), 'filmix-suggestions', { 'X-Requested-With': 'XMLHttpRequest' }); }
    p = fields(['token','deviceId','q','id']);
    const operation = url.pathname.split('/').pop();
    if (operation === 'search' ? p.id !== undefined : p.q !== undefined) bad();
    if (!['search','post'].includes(operation) && p.id !== undefined) bad();
    const host = origin(env, 'FILMIX_MOBILE_ORIGIN', 'https://filmixapp.cyou');
    const device = /^[a-zA-Z0-9_-]{8,64}$/.test(str(p.deviceId)) ? str(p.deviceId) : bad();
    const values = { user_dev_id: device, user_dev_name: 'Xiaomi', user_dev_token: operation === 'token-request' ? '' : token(p.token), user_dev_vendor: 'Xiaomi', user_dev_os: '7.1.1', user_dev_apk: '2.2.9', app_lang: 'ru_RU' };
    if (operation === 'token-request' && p.token !== undefined) bad();
    if (operation === 'search') values.story = q(p.q);
    const path = operation === 'post' ? 'post/' + id(p.id) : operation === 'profile' ? 'user_profile' : operation === 'token-request' ? 'token_request' : 'search';
    // Filmix's mobile protocol uses GET. Secrets arrive at the Worker only in a POST body.
    // This URL is sent to the configured HTTPS API only, never logged or shared-cached.
    return spec(source, host + '/api/v2/' + path + '?' + new URLSearchParams(values), 'filmix-mobile-' + operation, { 'User-Agent': 'okhttp/3.10.0' });
  }
  const host = origin(env, 'KINOTOCHKA_ORIGIN', 'https://kinovibe.vip');
  if (url.pathname.endsWith('/find')) { p = fields(['kp']); return spec(source, host + '/api/find-by-kinopoisk.php?' + new URLSearchParams({ kinopoisk: id(p.kp) }), 'kinotochka-find'); }
  if (url.pathname.endsWith('/search')) { p = fields(['q']); return spec(source, host + '/index.php?do=search', 'source-html', { Referer: host + '/' }, { do: 'search', subaction: 'search', search_start: '0', full_search: '0', result_from: '1', story: q(p.q) }); }
  if (url.pathname.endsWith('/page')) { p = fields(['path']); return spec(source, host + pagePath(p.path), 'source-html'); }
  p = fields(['path']);
  const path = str(p.path);
  if (path.length > 350 || !/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:txt|json)$/.test(path)) bad();
  return spec(source, origin(env, 'KINOTOCHKA_PLAYLIST_ORIGIN', host) + path, 'kinotochka-playlist');
}

const obj = v => v && typeof v === 'object' && !Array.isArray(v);
export function transformSource(text, spec) {
  if (['source-html','source-script'].includes(spec.format)) return { body: text, mime: 'text/plain; charset=utf-8' };
  let d;
  try { d = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new HttpError(502, 'upstream_shape_changed'); }
  if (!d || typeof d !== 'object') throw new HttpError(502, 'upstream_shape_changed');
  if (d.error || d.success === false) {
    if (spec.source === 'kodik' && typeof d.error === 'string' && /(?:invalid.*token|token.*invalid|неверн.{0,12}токен|токен.{0,12}невер)/i.test(d.error)) throw new HttpError(401, 'source_token_rejected');
    throw new HttpError(502, 'upstream_api_error');
  }
  const valid = spec.format === 'rezka-json' ? d.success === true && (typeof d.episodes === 'string' || typeof d.url === 'string') :
    spec.format === 'kodik-api' ? Array.isArray(d.results) :
    spec.format === 'kodik-get-player' ? obj(d) && (typeof d.found === 'boolean' || d.found === 0 || d.found === 1 || typeof d.link === 'string' || d.allowed === 0) :
    spec.format === 'kodik-links' ? obj(d.links) :
    spec.format === 'filmix-tv-search' ? d.status === 'ok' && Array.isArray(d.items) :
    spec.format === 'filmix-tv-links' ? Array.isArray(d) || obj(d) && Object.values(d).every(v => obj(v)) :
    spec.format === 'filmix-suggestions' ? Array.isArray(d.posts) :
    spec.format === 'filmix-mobile-search' || spec.format === 'kinotochka-find' ? Array.isArray(d) :
    spec.format === 'filmix-mobile-post' ? obj(d.player_links) :
    spec.format === 'filmix-mobile-profile' ? obj(d.user_data) :
    spec.format === 'filmix-mobile-token-request' ? d.status === 'ok' && ['string','number'].includes(typeof d.code) && ['string','number'].includes(typeof d.user_code) :
    spec.format === 'kinotochka-playlist' ? Array.isArray(d) || Array.isArray(d.playlist) || Array.isArray(d.folder) : false;
  if (!valid) throw new HttpError(502, 'upstream_shape_changed');
  if (!Array.isArray(d)) { delete d.ads; delete d.vast; delete d.vast_url; delete d.vast_msg; }
  return { body: JSON.stringify(d), mime: 'application/json; charset=utf-8' };
}

export async function resolveKodik(spec, step) {
  const page = await step({ ...spec, flow: undefined });
  const html = page.body;
  const params = html.match(/\burlParams\s*=\s*'([^']+)'/);
  const type = html.match(/\b(?:videoInfo|vInfo)\.type\s*=\s*['"]([^'"]+)/);
  const hash = html.match(/\b(?:videoInfo|vInfo)\.hash\s*=\s*['"]([^'"]+)/);
  const id = html.match(/\b(?:videoInfo|vInfo)\.id\s*=\s*['"]([^'"]+)/);
  const script = html.match(/\bsrc\s*=\s*['"]([^'"]*\/assets\/js\/app\.player_single[^'"]+)/);
  if (!params || !type || !hash || !id || !script || !/^(?:serial|seria|video)$/.test(type[1]) || !/^[a-zA-Z0-9_-]{1,128}$/.test(hash[1]) || !/^[1-9]\d{0,14}$/.test(id[1])) throw new HttpError(502, 'upstream_shape_changed');
  const host = new URL(spec.target).origin;
  const asset = new URL(script[1], spec.target);
  if (asset.origin !== host || asset.username || asset.password || !/^\/assets\/js\/app\.player_single[a-zA-Z0-9_.-]*\.js$/.test(asset.pathname) || asset.search && !/^\?(?:v|ver|version)=[a-zA-Z0-9_.-]{1,80}$/.test(asset.search)) throw new HttpError(502, 'upstream_shape_changed');
  const js = await step({ ...spec, target: asset.href, flow: undefined, format: 'source-script' });
  const match = js.body.match(/\$\.ajax\(\s*\{\s*type\s*:\s*['"]POST['"]\s*,\s*url\s*:\s*atob\(\s*['"]([^'"]+)['"]/);
  let path, data;
  try { path = match ? atob(match[1]) : ''; data = JSON.parse(params[1]); } catch { throw new HttpError(502, 'upstream_shape_changed'); }
  if (!/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*(?:\.php)?$/.test(path)) throw new HttpError(502, 'upstream_shape_changed');
  const payload = { type: type[1], hash: hash[1], id: id[1], info: '{}', bad_user: 'true', cdn_is_working: 'true' };
  for (const key of ['d','d_sign','pd','pd_sign','ref','ref_sign']) {
    if (typeof data[key] !== 'string' || data[key].length > 3000) throw new HttpError(502, 'upstream_shape_changed');
    payload[key] = data[key];
  }
  const links = await step({ ...spec, target: host + path, method: 'POST', body: new URLSearchParams(payload).toString(), flow: undefined, format: 'kodik-links', headers: { Origin: host, Referer: spec.target } });
  const result = JSON.parse(links.body), quality = {};
  for (const [height, entries] of Object.entries(result.links)) {
    if (!/^\d{3,4}p?$/.test(height) || !Array.isArray(entries)) continue;
    for (const entry of entries) {
      let value = typeof entry?.src === 'string' ? entry.src : '';
      if (!/^(https?:)?\/\//.test(value)) {
        try { value = atob(value.replace(/[a-z]/gi, c => { const start = c <= 'Z' ? 65 : 97; return String.fromCharCode(start + (c.charCodeAt(0) - start + 18) % 26); })); } catch { continue; }
      }
      try {
        const u = new URL(value, host);
        if (!/^https?:$/.test(u.protocol) || u.username || u.password || !/^(https?:)?\/\//.test(value)) continue;
        quality[/p$/.test(height) ? height : height + 'p'] = u.href; break;
      } catch { /* Invalid source link. */ }
    }
  }
  if (!Object.keys(quality).length) throw new HttpError(502, 'upstream_no_streams');
  return { body: JSON.stringify({ quality, subtitles: [] }), mime: 'application/json; charset=utf-8', cacheable: false };
}
