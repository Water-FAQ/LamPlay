import { HttpError } from './errors.mjs';
export { HttpError } from './errors.mjs';
import { sourcePolicy, resolveSourceRoute, transformSource } from './source-routes.mjs';
// Fixed public metadata endpoints; callers cannot provide hosts or headers.
export const SOURCES = ['animelib', 'cdnvideohub', 'animego', 'aniboom', 'rezka', 'kodik', 'filmix', 'kinotochka'];
const bad = () => { throw new HttpError(400, 'invalid_parameters'); };
const positive = value => /^[1-9]\d{0,14}$/.test(value || '') ? value : bad();
const slug = value => /^[1-9]\d{0,9}--[a-z0-9][a-z0-9-]{0,180}$/.test(value || '') ? value : bad();
function query(value) {
  const q = (value || '').trim();
  if (!q || q.length > 150 || /[\x00-\x1f\x7f]/.test(q)) bad();
  return q;
}
function parameters(url, allowed) {
  const seen = new Set();
  for (const [key] of url.searchParams) {
    if (!allowed.includes(key) || seen.has(key)) bad();
    seen.add(key);
  }
  return Object.fromEntries(url.searchParams);
}
function route(source, target, format, ttl = 0, headers = {}) {
  return { source, target, format, ttl, headers };
}
export function resolveRoute(url, env = {}, method = 'GET', body) {
  if (sourcePolicy(url.pathname)) return resolveSourceRoute(url, env, method, body);
  let p;
  const lib = 'https://api.lib.social/api/';
  const cvh = 'https://plapi.cdnvideohub.com/api/v1/player/sv/';
  const go = 'https://animego.me';
  const goHeaders = { Referer: go + '/', 'X-Requested-With': 'XMLHttpRequest' };
  switch (url.pathname) {
    case '/v1/animelib/search':
      p = parameters(url, ['q', 'page']);
      return route('animelib', lib + 'anime?' + new URLSearchParams({ q: query(p.q), page: p.page ? positive(p.page) : '1' }), 'lib-search', 60);
    case '/v1/animelib/episodes':
      p = parameters(url, ['anime_id']);
      return route('animelib', lib + 'episodes?' + new URLSearchParams({ anime_id: slug(p.anime_id) }), 'lib-episodes', 60);
    case '/v1/animelib/episode':
      p = parameters(url, ['id']);
      return route('animelib', lib + 'episodes/' + positive(p.id), 'lib-episode');
    case '/v1/animelib/constants':
      parameters(url, []);
      return route('animelib', lib + 'constants?fields%5B%5D=videoServers', 'lib-constants', 300);
    case '/v1/cdnvideohub/playlist': {
      p = parameters(url, ['id', 'aggr']);
      const aggr = p.aggr || 'kp';
      if (!['kp', 'mali'].includes(aggr)) bad();
      return route('cdnvideohub', cvh + 'playlist?' + new URLSearchParams({ pub: aggr === 'kp' ? '12' : '747', aggr, id: positive(p.id) }), 'cvh-playlist', 60);
    }
    case '/v1/cdnvideohub/video':
      p = parameters(url, ['id']);
      return route('cdnvideohub', cvh + 'video/' + positive(p.id), 'cvh-video');
    case '/v1/animego/search':
      p = parameters(url, ['q']);
      return route('animego', go + '/search/anime?' + new URLSearchParams({ q: query(p.q) }), 'html');
    case '/v1/animego/player':
      p = parameters(url, ['id']);
      return route('animego', go + '/player/' + positive(p.id), 'go-player', 0, goHeaders);
    case '/v1/animego/episode':
      p = parameters(url, ['id']);
      return route('animego', go + '/player/videos/' + positive(p.id), 'go-player', 0, goHeaders);
    case '/v1/aniboom/embed':
      p = parameters(url, ['id', 'episode', 'translation']);
      if (!/^[a-zA-Z0-9]{8,32}$/.test(p.id || '')) bad();
      return route('aniboom', 'https://aniboom.one/embed/' + p.id + (p.episode || p.translation ? '?' + new URLSearchParams({ ...(p.episode ? { episode: positive(p.episode) } : {}), ...(p.translation ? { translation: positive(p.translation) } : {}) }) : ''), 'aniboom', 0, { Referer: 'https://animego.org/' });
    default: throw new HttpError(404, 'route_not_found');
  }
}

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function https(value) {
  if (typeof value !== 'string') return '';
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
function entityDecode(value) {
  return value.replace(/&(?:quot|apos|amp|lt|gt|#\d+|#x[\da-f]+);/gi, item => {
    const named = { '&quot;': '"', '&apos;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>' };
    if (named[item.toLowerCase()]) return named[item.toLowerCase()];
    const cp = item.toLowerCase().startsWith('&#x') ? parseInt(item.slice(3, -1), 16) : parseInt(item.slice(2, -1), 10);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
  });
}
function aniboom(text) {
  const attribute = text.match(/<video\b[^>]*\bdata-parameters\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  if (!attribute) throw new HttpError(502, 'upstream_shape_changed');
  let data;
  try { data = JSON.parse(entityDecode(attribute[1] ?? attribute[2])); }
  catch { throw new HttpError(502, 'upstream_shape_changed'); }
  const streams = [];
  for (const key of ['hls', 'fallbackHls', 'dash', 'fallbackDash']) {
    let value = data[key];
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch { /* plain URL */ } }
    const url = https(object(value) ? value.src : value);
    if (url) streams.push({ format: /hls/i.test(key) ? 'hls' : 'dash', url, fallback: key.startsWith('fallback') });
  }
  if (!streams.length) throw new HttpError(502, 'upstream_no_streams');
  // Never copy VAST, ads, trackers or executable player code into the result.
  return { quality: { auto: streams[0].url }, streams, subtitles: [] };
}
export function transform(text, spec) {
  const mime = spec.format === 'html' || spec.format === 'go-player' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8';
  if (/just a moment|verify you are human|cf-chl-|site unavailable/i.test(text.slice(0, 8192))) {
    throw new HttpError(502, 'upstream_challenge');
  }
  if (['rezka','kodik','filmix','kinotochka'].includes(spec.source)) return transformSource(text, spec);
  if (spec.format === 'html') return { body: text, mime };
  if (spec.format === 'aniboom') return { body: JSON.stringify(aniboom(text)), mime };
  let data;
  try { data = JSON.parse(text); } catch { throw new HttpError(502, 'upstream_shape_changed'); }
  if (!object(data)) throw new HttpError(502, 'upstream_shape_changed');
  if (spec.format === 'go-player') {
    if (!object(data.data) || typeof data.data.content !== 'string' || !data.data.content) throw new HttpError(502, 'upstream_shape_changed');
    return { body: data.data.content, mime };
  }
  if (spec.format === 'cvh-playlist') {
    if (!Array.isArray(data.items)) throw new HttpError(502, 'upstream_shape_changed');
    const fields = ['cvhId', 'vkId', 'name', 'episodeName', 'voiceStudio', 'voiceType', 'season', 'episode'];
    data = { titleName: data.titleName || '', isSerial: !!data.isSerial, items: data.items.map(row => Object.fromEntries(fields.filter(k => ['string','number','boolean'].includes(typeof row?.[k])).map(k => [k, row[k]]))) };
  } else if (spec.format === 'cvh-video') {
    if (!object(data.sources)) throw new HttpError(502, 'upstream_shape_changed');
    const fields = ['hlsUrl', 'mpeg4kUrl', 'mpeg2kUrl', 'mpegQhdUrl', 'mpegFullHdUrl', 'mpegHighUrl', 'mpegMediumUrl', 'mpegLowUrl', 'mpegLowestUrl', 'mpegTinyUrl'];
    const sources = Object.fromEntries(fields.map(k => [k, https(data.sources[k])]).filter(([,v]) => v));
    if (!Object.keys(sources).length) throw new HttpError(502, 'upstream_no_streams');
    data = { sources, ...(/^(?:[a-z0-9-]+\.)*okcdn\.ru$/i.test(data.failoverHost || '') ? { failoverHost: data.failoverHost } : {}) };
  } else if (spec.format === 'lib-search' || spec.format === 'lib-episodes') {
    if (!Array.isArray(data.data)) throw new HttpError(502, 'upstream_shape_changed');
    // Pagination is returned unchanged; consumers must validate the chosen title and slug_url.
  } else if (spec.format === 'lib-episode') {
    if (!object(data.data) || !Array.isArray(data.data.players)) throw new HttpError(502, 'upstream_shape_changed');
  } else if (spec.format === 'lib-constants') {
    if (!object(data.data) || !Array.isArray(data.data.videoServers)) throw new HttpError(502, 'upstream_shape_changed');
  }
  return { body: JSON.stringify(data), mime };
}
