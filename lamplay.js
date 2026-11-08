/* LamPlay by WaterFAQ - 0.19.0 (experimental)
 * Independent Lampa plugin. Direct connections only; no proxy or remote code execution.
 * Providers: HDrezka, Kodik, AniLiberty, Filmix, CDNvideohub, KinoTochka, VeoVeo.
 */
(function (root) {
    'use strict';
    var VERSION = '0.19.0';
    var RELEASE_DATE = '08.11.2026';
    var KEY = 'lamplay';
    var NAME = 'LamPlay';
    var PLAY = '<svg class="lp-play" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 3v18l15-9z"/></svg>';
    // Selected L + Play mark: matching stroke widths and triangle inside L bounds.
    var LOGO = '<svg class="lamplay-logo" xmlns="http://www.w3.org/2000/svg" viewBox="5 5 54 54" aria-hidden="true"><path fill="currentColor" d="M13 12h7v34h32v7H13zM28 12l24 16-24 16z"/></svg>';

    function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
    function list(value) { return Array.isArray(value) ? value : []; }
    function form(obj) {
        return Object.keys(obj).filter(function (k) { return obj[k] !== undefined && obj[k] !== null; })
            .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(obj[k])); }).join('&');
    }
    function absolute(url, base) {
        url = String(url || '').trim();
        if (!url) return '';
        try {
            var result = new root.URL(url, base || 'https://invalid.local/');
            return /^https?:$/.test(result.protocol) ? result.href : '';
        } catch (e) { return ''; }
    }
    function origin(url) { try { return new root.URL(url).origin; } catch (e) { return ''; } }
    function hostSetting(value, fallback) {
        value = String(value || '').trim();
        if (value && !/^https?:\/\//i.test(value)) value = 'https://' + value;
        return origin(value || fallback) || origin(fallback);
    }
    function normal(text) {
        return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
    }
    function rank(items, movie) {
        var titles = [movie.title, movie.name, movie.original_title, movie.original_name].map(normal).filter(Boolean);
        var year = parseInt(String(movie.release_date || movie.first_air_date || '').slice(0, 4), 10);
        return items.map(function (item, index) {
            var names = [item.title, item.original].map(normal).filter(Boolean);
            var score = 0;
            names.forEach(function (name) {
                titles.forEach(function (title) {
                    var hit = name === title ? 100 : name.indexOf(title) >= 0 || title.indexOf(name) >= 0 ? 35 : 0;
                    score = Math.max(score, hit);
                });
            });
            if (year && +item.year === year) score += 20;
            return { item: item, score: score, index: index };
        }).sort(function (a, b) { return b.score - a.score || a.index - b.index; })
            .map(function (entry) { return entry.item; });
    }
    function text(node) { return String(node && node.textContent || '').replace(/\s+/g, ' ').trim(); }
    function doc(html) { return new root.DOMParser().parseFromString(String(html || ''), 'text/html'); }
    function nodes(dom, selector) { return Array.prototype.slice.call(dom.querySelectorAll(selector)); }
    function json(value) { return typeof value === 'string' ? JSON.parse(value) : value; }
    function numSort(a, b) { return parseFloat(a) - parseFloat(b) || String(a).localeCompare(String(b)); }
    function safeError(err) { return String(err && err.message || err || 'Неизвестная ошибка'); }
    function cleanPage(html) {
        html = String(html || '');
        if (/anubis_challenge|cf-chl-|Just a moment|g-recaptcha|Site Unavailable/i.test(html)) {
            throw new Error('Источник вернул страницу защиты или недоступен. Попробуйте другое зеркало в настройках.');
        }
        return html;
    }
    function b64(value) {
        var decoded = root.atob(value);
        try {
            return decodeURIComponent(decoded.split('').map(function (c) {
                return '%' + ('0' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
        } catch (e) { return decoded; }
    }
    function rezkaDecode(value) {
        value = String(value || '');
        if (value.charAt(0) !== '#') return value;
        var payload = value.slice(2);
        ['$$!!@$$@^!@#$$@', '@@@@@!##!^^^', '####^!!##!@@', '^^^!@##!!##', '$$#!!@#!@##'].forEach(function (noise) {
            payload = payload.split('//_//' + root.btoa(noise)).join('');
        });
        try { return b64(payload); } catch (e) { throw new Error('HDrezka: изменился формат видеоссылки.'); }
    }
    function kodikDecode(value) {
        value = String(value || '');
        if (/^(https?:)?\/\//.test(value)) return absolute(value, 'https://kodikplayer.com');
        var rotated = value.replace(/[a-z]/gi, function (c) {
            var start = c <= 'Z' ? 65 : 97;
            return String.fromCharCode(start + (c.charCodeAt(0) - start + 18) % 26);
        });
        try { return absolute(b64(rotated), 'https://kodikplayer.com'); }
        catch (e) { return ''; }
    }
    function labelledLinks(value, preferMp4) {
        var entries = [], match, re = /\[([^\]]+)\]([^\[]+)/g;
        while ((match = re.exec(String(value || '')))) {
            var links = match[2].replace(/,+\s*$/, '').split(/\s+or\s+/).map(function (url) {
                return absolute(url.trim(), 'https://rezka.ag');
            }).filter(Boolean);
            var chosen = links.filter(function (url) {
                return preferMp4 ? /\.mp4(?:[?#]|$)/i.test(url) : /\.m3u8(?:[?#]|$)/i.test(url);
            })[0] || links[0];
            if (chosen) entries.push({ label: match[1], url: chosen });
        }
        return entries;
    }
    function qualities(entries) {
        var out = {};
        entries.forEach(function (entry) { if (entry.url) out[entry.label] = entry.url; });
        return out;
    }
    function chooseQuality(map, wanted) {
        var keys = Object.keys(map || {}).sort(function (a, b) { return qualityNumber(b) - qualityNumber(a); });
        if (!keys.length) return '';
        var limit = parseInt(wanted, 10);
        var key = !limit ? keys[0] : keys.filter(function (label) { return qualityNumber(label) <= limit; })[0] || keys[keys.length - 1];
        return map[key];
    }
    function qualityNumber(label) { return /4k/i.test(label) ? 2160 : /2k/i.test(label)?1440:/full\s*hd/i.test(label)?1080:/^hd$/i.test(label)?720:parseInt(label, 10) || 0; }

    function flag(value, fallback) {
        if (value === undefined || value === null || value === '') return !!fallback;
        return value === true || value === 'true' || value === 1 || value === '1';
    }
    function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    function movieKey(movie) {
        var type = movie.media_type || (movie.first_air_date || movie.number_of_seasons || movie.name ? 'tv' : 'movie');
        return [movie.source || 'tmdb', type, movie.id || normal(movie.original_title || movie.original_name || movie.title || movie.name),
            movie.id ? '' : String(movie.release_date || movie.first_air_date || '').slice(0, 4)].join('|');
    }
    function rememberSource(history, movie, source, timestamp) {
        var result = {}, key = movieKey(movie);
        Object.keys(object(history)).forEach(function (id) {
            var value = history[id];
            if (value && /^(kodik|rezka|libria|filmix|cdnvideohub|kinotochka|animedia|veoveo)$/.test(value.source)) result[id] = { source: value.source, time: +value.time || 0 };
        });
        result[key] = { source: source, time: timestamp || Date.now() };
        Object.keys(result).sort(function (a, b) { return result[b].time - result[a].time; }).slice(500)
            .forEach(function (id) { delete result[id]; });
        return result;
    }
    function episodeTitle(title, episode, voice, full) {
        if (episode.number === '' || episode.number === undefined) return title + (voice ? ' · ' + voice : '');
        var name = String(episode.title || '').replace(/^(?:Серия|Эпизод)\s*[\d.]+\s*[·:\-]?\s*/i, '').trim();
        var short = 'Серия ' + episode.number + (name ? ' · ' + name : '');
        return full ? title + ' · ' + (episode.season ? 'Сезон ' + episode.season + ', серия ' + episode.number : 'Серия ' + episode.number) +
            (name ? ' · ' + name : '') + (voice ? ' · ' + voice : '') : short;
    }
    function streamURL(url, settings) {
        url = absolute(url);
        if (url && flag(settings('prefer_http', false))) url = url.replace(/^https:/, 'http:');
        if (url && root.location && root.location.protocol === 'https:' && /^http:/.test(url)) {
            throw new Error('HTTP-поток нельзя открыть из HTTPS-версии Lampa. Откройте Lampa по HTTP или выключите предпочтение HTTP.');
        }
        return url;
    }
    function prepareStreams(streams, settings) {
        var result = { quality: {}, subtitles: [] };
        Object.keys(object(streams.quality)).forEach(function (label) {
            var url = streamURL(streams.quality[label], settings);
            if (url) result.quality[label] = url;
        });
        list(streams.subtitles).forEach(function (sub) {
            // Subtitles retain their original protocol; the preference is for video.
            var url = absolute(sub.url);
            if (url) result.subtitles.push({ label: sub.label, url: url });
        });
        return result;
    }
    function fixRezkaStream(url, settings) {
        if (!flag(settings('rezka_fix_stream', false))) return url;
        var parsed = new root.URL(url);
        if (/^(?:stream\.voidboost\.(?:cc|top|link|club)|(?:[^.]+\.)*ukrtelcdn\.net)$/i.test(parsed.hostname)) {
            var target = 'https://femeretes.org';
            parsed.host = new root.URL(target).host;
            return parsed.href;
        }
        return url;
    }

    // Native Android headers are available in Lampa APK build 339 and newer.
    function nativeCookies(Lampa) {
        if (!Lampa.Platform.is('android') || !root.AndroidJS || !root.AndroidJS.appVersion) return false;
        try { return parseInt(String(root.AndroidJS.appVersion()).split('-').pop(), 10) >= 339; }
        catch (e) { return false; }
    }
    function mergeCookies(jar, headers, url, now) {
        var parsed = new root.URL(url), host = parsed.hostname.toLowerCase(), result = list(jar).slice();
        now = now || Date.now();
        var lines = headers && (headers['set-cookie'] || headers['Set-Cookie']) || [];
        if (typeof lines === 'string') lines = [lines];
        list(lines).forEach(function (line) {
            var parts = String(line).split(';'), pair = parts.shift(), equal = pair.indexOf('=');
            if (equal < 1) return;
            var cookie = { name: pair.slice(0, equal).trim(), value: pair.slice(equal + 1), domain: host, hostOnly: true, path: '/', secure: false, expires: 0 };
            var maxAge = null;
            parts.forEach(function (part) {
                var fields = part.trim().split('='), name = fields.shift().toLowerCase(), value = fields.join('=');
                if (name === 'domain') { cookie.domain = value.replace(/^\./, '').toLowerCase(); cookie.hostOnly = false; }
                if (name === 'path' && value.charAt(0) === '/') cookie.path = value;
                if (name === 'secure') cookie.secure = true;
                if (name === 'max-age' && /^-?\d+$/.test(value)) maxAge = parseInt(value, 10);
                if (name === 'expires' && !isNaN(Date.parse(value))) cookie.expires = Date.parse(value);
            });
            if (!(host === cookie.domain || host.slice(-(cookie.domain.length + 1)) === '.' + cookie.domain)) return;
            if (maxAge !== null) cookie.expires = now + maxAge * 1000;
            result = result.filter(function (c) { return !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path); });
            if (cookie.value !== 'deleted' && (!cookie.expires || cookie.expires > now)) result.push(cookie);
        });
        return result.filter(function (c) { return !c.expires || c.expires > now; });
    }
    function cookieHeader(jar, url) {
        var parsed = new root.URL(url), host = parsed.hostname.toLowerCase(), now = Date.now();
        return list(jar).filter(function (c) {
            var domain = host === c.domain || !c.hostOnly && host.slice(-(c.domain.length + 1)) === '.' + c.domain;
            var path = parsed.pathname === c.path || parsed.pathname.indexOf(c.path === '/' ? '/' : c.path.replace(/\/$/, '') + '/') === 0;
            return domain && path && (!c.secure || parsed.protocol === 'https:') && (!c.expires || c.expires > now);
        }).sort(function (a, b) { return b.path.length - a.path.length; }).map(function (c) { return c.name + '=' + c.value; }).join('; ');
    }
    function RezkaSession(io, settings, save, Lampa) {
        function accounts() { return object(settings('rezka_accounts', {})); }
        function state(host) { return object(accounts()[host]); }
        function store(host, value) {
            var all = accounts(), updated = {};
            Object.keys(all).forEach(function (key) { updated[key] = all[key]; });
            updated[host] = value; save('rezka_accounts', updated);
        }
        this.options = function (page) {
            var host = origin(page), options = { withCredentials: true };
            if (nativeCookies(Lampa)) {
                options.returnHeaders = true;
                options.headers = { Referer: page, Origin: host };
                var cookies = cookieHeader(state(host).cookies, page);
                if (cookies) options.headers.Cookie = cookies;
                options.onHeaders = function (headers) {
                    var value = state(host);
                    value.cookies = mergeCookies(value.cookies, headers, page);
                    store(host, value);
                };
            } else {
                // Login, verification and reads must share the browser cookie jar,
                // including webOS, where native requests may use a different service.
                options.browserRequest = true;
            }
            return options;
        };
        this.status = function (host) {
            var data = state(host);
            return data.confirmed ? 'Вход подтверждён для ' + host : data.unknown ? 'Состояние сессии не подтверждено' : 'Вход не выполнен';
        };
        this.confirmed = function (host) { return state(host).confirmed === true; };
        this.login = function (host, login, password, done, fail) {
            var pending=state(host);pending.confirmed=false;pending.unknown=true;store(host,pending);
            var self = this;
            io.request(host + '/ajax/login/', { login_name: login, login_password: password, login_not_save: 0 }, 'json', function (response) {
                if (!(response && (flag(response.success) || /уже авторизован/i.test(response.message || '')))) {
                    var message = response && (response.message || response.error);
                    return fail(new Error('HDrezka: ' + (message ? text(doc(String(message)).body).slice(0, 300) : 'сайт не подтвердил вход. Проверьте логин, пароль и зеркало.')));
                }
                io.request(host + '/', null, 'text', function (html) {
                    try { cleanPage(html); } catch (e) { return uncertain(e); }
                    if (!doc(html).querySelector('a[href*="/logout/"]')) {
                        return uncertain(new Error('HDrezka приняла вход, но сессию подтвердить не удалось. Возможны ограничения cookies или CORS.'));
                    }
                    var data = state(host); data.confirmed = true; data.unknown = false;
                    store(host, data); done();
                }, uncertain, self.options(host + '/'));
                function uncertain(error) {
                    var data = state(host); data.confirmed = false; data.unknown = true; store(host, data); fail(error);
                }
            }, fail, self.options(host + '/ajax/login/'));
        };
        this.logout = function (host, done, fail) {
            var pending=state(host);pending.confirmed=false;pending.unknown=true;store(host,pending);
            var self = this;
            io.request(host + '/logout/', null, 'text', function (html) {
                try { cleanPage(html); } catch (e) { return fail(e); }
                var dom = doc(html);
                if (dom.querySelector('a[href*="/logout/"]') || !dom.querySelector('#login-form, #loginForm, .b-tophead__login, a[href*="/login/"]')) {
                    var current = state(host); current.confirmed = false; current.unknown = true; store(host, current);
                    return fail(new Error('Источник не подтвердил выход. Сессия могла остаться активной.'));
                }
                store(host, { cookies: [], confirmed: false, unknown: false }); done();
            }, fail, self.options(host + '/logout/'));
        };
    }

    /* Transport is scoped to one screen. clear() invalidates callbacks even when
       a native Lampa request cannot be physically aborted. No external fallbacks. */
    function Transport(Lampa, settings) {
        var pending = [], generation = 0;
        this.clear = function () {
            generation++;
            pending.forEach(function (entry) {
                clearTimeout(entry.timer);
                entry.request.clear();
            });
            pending = [];
        };
        this.request = function (url, data, type, done, fail, extra) {
            if (!absolute(url)) return fail(new Error('Некорректный адрес источника.'));
            if (root.location && root.location.protocol === 'https:' && /^http:/.test(url)) {
                return fail(new Error('Lampa открыта по HTTPS, а источник - по HTTP. Для прямого доступа к этому HTTP-источнику откройте Lampa по HTTP.'));
            }
            var request = new Lampa.Reguest();
            var ticket = generation, finished = false;
            var entry = { request: request };
            function end(error, value) {
                if (finished || ticket !== generation) return;
                finished = true;
                clearTimeout(entry.timer);
                pending = pending.filter(function (p) { return p !== entry; });
                if (error) fail(error); else done(value);
            }
            var timeout = Math.max(5, Math.min(60, parseInt(settings('timeout', '15'), 10) || 15)) * 1000;
            pending.push(entry);
            entry.timer = setTimeout(function () {
                request.clear();
                end(new Error('Источник не ответил за ' + timeout / 1000 + ' сек. Повторите запрос.'));
            }, timeout + 500);
            request.timeout(timeout);
            var params = { dataType: type || 'json' };
            if (extra) Object.keys(extra).forEach(function (key) {
                if (key !== 'onHeaders' && key !== 'browserRequest' && key !== 'nativeOnlyHeaders') params[key] = extra[key];
            });
            if(extra && extra.nativeOnlyHeaders && !(Lampa.Platform && Lampa.Platform.is('android')))delete params.headers;
            request[extra && extra.browserRequest ? 'silent' : 'native'](url, function (value) {
                if (finished || ticket !== generation) return;
                try {
                    if (extra && extra.returnHeaders) {
                        var envelope = json(value);
                        if (envelope && own(envelope, 'body') && envelope.headers) {
                            if (extra.onHeaders) extra.onHeaders(envelope.headers);
                            value = envelope.body;
                        }
                    }
                    value = type === 'text' ? String(value || '') : json(value);
                }
                catch (e) {
                    try { cleanPage(String(value || '')); } catch (challenge) { return end(challenge); }
                    return end(new Error(/^\s*</.test(String(value || '')) ?
                        'Источник вернул HTML вместо данных. Проверьте зеркало и доступность сайта.' : 'Источник вернул данные в неожиданном формате.'));
                }
                end(null, value);
            }, function (xhr, reason) {
                var status = xhr && xhr.status;
                var message = reason === 'timeout' ? 'Источник не ответил вовремя.' : status ? 'Источник вернул HTTP ' + status + '.' :
                    'Не удалось прочитать ответ '+origin(url)+'. Браузер мог заблокировать запрос, либо сайт недоступен. Проверьте доступность источника и зеркало.';
                if(!status && /(?:rezka|hdrezka)\./i.test(origin(url)))message+=' HDrezka: смена пароля не устранит сетевой отказ. В обычном браузере также требуются разрешённые межсайтовые запросы и cookies; проверьте другое зеркало.';
                end(new Error(message));
            }, data ? form(data) : false, params);
        };
    }

    function parseRezkaSearch(html, base) {
        var dom = doc(cleanPage(html)), items = [], seen = {};
        nodes(dom, '.b-content__inline_item-link, li').forEach(function (card) {
            var link = card.querySelector('a[href]');
            var url = absolute(link && link.getAttribute('href'), base);
            if (!url) return;
            var path = new root.URL(url);
            if (!/^\/(films|series|animation|cartoons)\//.test(path.pathname)) return;
            if (!/\/\d[^/]*\.html$/i.test(path.pathname)) return;
            // Mirrors often emit canonical links: keep subsequent requests on the chosen mirror.
            url = origin(base) + path.pathname + path.search;
            if (seen[url]) return;
            seen[url] = true;
            var info = text(card.querySelector('div')) || text(link);
            var year = info.match(/\b(?:19|20)\d{2}\b/);
            items.push({ id: url, url: url, title: text(card.querySelector('.enty')) || text(link), original:text(card.querySelector('.b-content__inline_item-original, .b-content__inline_item-originaltitle, [itemprop=alternativeHeadline]')), year: year ? year[0] : '', description: info, series: /\/series\//.test(url)?true:/\/films\//.test(url)?false:undefined });
        });
        return items;
    }
    function rezkaEpisodes(html) {
        return nodes(doc(html), '.b-simple_episode__item').map(function (node) {
            return { season: node.getAttribute('data-season_id'), number: node.getAttribute('data-episode_id'), title: text(node) };
        }).filter(function (episode) { return episode.season !== null && episode.number !== null; });
    }
    function parseRezkaPage(html, result) {
        html = cleanPage(html);
        var series = html.match(/initCDNSeriesEvents\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        var movie = html.match(/initCDNMoviesEvents\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        var initial = series || movie, dom = doc(html);
        if (!initial) {
            // A login form is also present on ordinary anonymous pages.
            throw new Error('HDrezka: параметры плеера не найдены. Проверьте зеркало или выберите другой результат.');
        }
        var voices = nodes(dom, '#translators-list .b-translator__item').map(function (node) {
            return { id: node.getAttribute('data-translator_id'), title: node.getAttribute('title') || text(node),
                camrip: node.getAttribute('data-camrip') || '0', ads: node.getAttribute('data-ads') || '0',
                director: node.getAttribute('data-director') || '0' };
        }).filter(function (voice) { return voice.id; });
        if (!voices.length) voices.push({ id: initial[2], title: 'Основной перевод', camrip: movie && movie[3] || '0',
            ads: movie && movie[4] || '0', director: movie && movie[5] || '0' });
        var favs = dom.querySelector('#ctrl_favs');
        return { id: initial[1], title: result.title, url: result.url, series: !!series, voices: voices,
            episodes: rezkaEpisodes(html), favs: favs && favs.getAttribute('value') || '' };
    }
    function Rezka(io, settings, session) {
        this.id = 'rezka'; this.title = 'HDrezka';
        function base() { return hostSetting(settings('rezka_host', ''), 'https://rezka.ag'); }
        function options(page) {
            if (session) {
                var params = session.options(page);
                params.withCredentials = session.confirmed(origin(page));
                return params;
            }
            if (root.Lampa && root.Lampa.Platform.is('android')) {
                return { withCredentials: true, headers: { Referer: page, Origin: origin(page) } };
            }
            return { withCredentials: false };
        }
        this.search = function (query, movie, done, fail) {
            var url = base() + '/search/?do=search&subaction=search&q=' + encodeURIComponent(query);
            function quickSearch() {
                io.request(base() + '/engine/ajax/search.php', { q: query }, 'text', function (html) {
                    try { done(rank(parseRezkaSearch(html, base()), movie)); } catch (e) { fail(e); }
                }, fail, options(base() + '/'));
            }
            io.request(url, null, 'text', function (html) {
                try {
                    var items = rank(parseRezkaSearch(html, base()), movie);
                    if (items.length) done(items); else quickSearch();
                } catch (e) { fail(e); }
            }, quickSearch, options(base() + '/'));
        };
        this.resultOriginal=function(result,done,fail){io.request(result.url,null,'text',function(html){try{var dom=doc(cleanPage(html));done(text(dom.querySelector('.b-post__origtitle, [itemprop=alternativeHeadline]')));}catch(e){fail(e);}},fail,options(result.url));};
        this.open = function (result, done, fail) {
            io.request(result.url, null, 'text', function (html) {
                try { done(parseRezkaPage(html, result)); } catch (e) { fail(e); }
            }, fail, options(result.url));
        };
        this.episodes = function (release, voice, done, fail) {
            if (!release.series) return done([{ title: release.title, season: '', number: '', voice: voice }]);
            io.request(origin(release.url) + '/ajax/get_cdn_series/?t=' + Date.now(), {
                id: release.id, translator_id: voice.id, favs: release.favs, action: 'get_episodes'
            }, 'json', function (response) {
                if (response && response.success === false) return fail(new Error('HDrezka не вернула серии для выбранной озвучки.'));
                var episodes = rezkaEpisodes(response && response.episodes || '');
                if (!episodes.length) return fail(new Error('HDrezka: список серий пуст. Попробуйте другую озвучку.'));
                episodes.forEach(function (episode) { episode.voice = voice; });
                done(episodes);
            }, fail, options(release.url));
        };
        this.resolve = function (release, episode, done, fail) {
            var voice = episode.voice || release.voices[0];
            var payload = { id: release.id, translator_id: voice.id, favs: release.favs,
                action: release.series ? 'get_stream' : 'get_movie' };
            if (release.series) { payload.season = episode.season; payload.episode = episode.number; }
            else { payload.is_camrip = voice.camrip; payload.is_ads = voice.ads; payload.is_director = voice.director; }
            io.request(origin(release.url) + '/ajax/get_cdn_series/?t=' + Date.now(), payload, 'json', function (response) {
                try {
                    if (!response || !response.url || response.success === false) throw new Error('HDrezka не вернула видеоссылку. Возможны ограничения доступа или требование входа.');
                    if (response.premium_content && !(session && session.confirmed(origin(release.url)))) {
                        throw new Error('HDrezka пометила перевод как Premium. Требуется вход в подходящий аккаунт или другой перевод.');
                    }
                    var entries = labelledLinks(rezkaDecode(response.url), flag(settings('prefer_mp4', true), true));
                    entries.forEach(function (entry) { entry.url = fixRezkaStream(entry.url, settings); });
                    if (!entries.length) throw new Error('HDrezka: видеоссылки не распознаны.');
                    done({ quality: qualities(entries), audio:response.audio || response.audio_tracks,languages:response.languages,dynamic_range:response.dynamic_range || response.hdr, subtitles: labelledLinks(response.subtitle).map(function (entry) {
                        return { label: entry.label, url: entry.url };
                    }) });
                } catch (e) { fail(e); }
            }, fail, options(release.url));
        };
    }

    function kodikResults(rows) {
        var groups = {}, output = [];
        list(rows).forEach(function (row) {
            var key = row.shikimori_id ? 'shiki:' + row.shikimori_id : row.kinopoisk_id ? 'kp:' + row.kinopoisk_id :
                row.imdb_id ? 'imdb:' + row.imdb_id : 'title:' + row.title + ':' + row.year;
            if (!groups[key]) {
                groups[key] = { id: key, title: row.title || row.title_orig || 'Без названия', original: row.title_orig,
                    year: row.year, rows: [], series: /serial/.test(row.type || ''), description: row.type || '' };
                output.push(groups[key]);
            }
            groups[key].rows.push(row);
        });
        return output;
    }
    function parseKodikPlayer(html, page) {
        cleanPage(html);
        var params = html.match(/\burlParams\s*=\s*'([^']+)'/);
        var type = html.match(/\b(?:videoInfo|vInfo)\.type\s*=\s*['"]([^'"]+)/);
        var hash = html.match(/\b(?:videoInfo|vInfo)\.hash\s*=\s*['"]([^'"]+)/);
        var id = html.match(/\b(?:videoInfo|vInfo)\.id\s*=\s*['"]([^'"]+)/);
        var script = html.match(/\bsrc\s*=\s*['"]([^'"]*\/assets\/js\/app\.player_single[^'"]+)/);
        if (!params || !type || !hash || !id || !script) throw new Error('Kodik: изменился формат страницы плеера или источник требует проверку.');
        var parsed = JSON.parse(params[1]);
        return { script: absolute(script[1], page), payload: {
            d: parsed.d, d_sign: parsed.d_sign, pd: parsed.pd, pd_sign: parsed.pd_sign, ref: parsed.ref,
            ref_sign: parsed.ref_sign, type: type[1], hash: hash[1], id: id[1], info: '{}',
            bad_user: true, cdn_is_working: true
        } };
    }
    function kodikEndpoint(script, page) {
        var match = String(script).match(/\$\.ajax\(\s*\{\s*type\s*:\s*['"]POST['"]\s*,\s*url\s*:\s*atob\(\s*['"]([^'"]+)['"]/);
        var path = match ? root.atob(match[1]) : '';
        var url = absolute(path, page);
        if (!path || path.charAt(0) !== '/' || origin(url) !== origin(page)) {
            throw new Error('Kodik: не удалось определить адрес запроса видеоссылки.');
        }
        return url;
    }
    function kodikCatalog(html, page, fallbackTitle) {
        var dom = doc(cleanPage(html));
        function media(node) {
            var type = node.getAttribute('data-media-type') || 'serial';
            var id = node.getAttribute('data-media-id'), hash = node.getAttribute('data-media-hash');
            return /^(serial|video)$/.test(type) && id && hash ? absolute('/' + type + '/' + id + '/' + hash + '/720p', page) : '';
        }
        var voices = nodes(dom, 'select option[data-media-id]').map(function (node) {
            return { id: node.value || node.getAttribute('data-id'), title: node.getAttribute('data-title') || text(node), url: media(node) };
        }).filter(function (voice) { return voice.url; });
        if (!voices.length) voices.push({ id: 'default', title: fallbackTitle || 'Основной перевод', url: page });
        var seasons = nodes(dom, 'select option[data-serial-id]').map(function (node) {
            return { id: node.value, url: absolute('/serial/' + node.getAttribute('data-serial-id') + '/' + node.getAttribute('data-serial-hash') + '/720p', page) };
        });
        var current = dom.querySelector('select option[data-serial-id][selected]');
        var currentSeason = current && current.value || seasons[0] && seasons[0].id || '1';
        var episodes = nodes(dom, 'select option[data-id][data-hash]').map(function (node) {
            return { season: currentSeason, number: node.value, title: node.getAttribute('data-title') || text(node),
                url: absolute('/seria/' + node.getAttribute('data-id') + '/' + node.getAttribute('data-hash') + '/720p', page) };
        });
        return { voices: voices, seasons: seasons, episodes: episodes, currentSeason: currentSeason };
    }
    function Kodik(io, settings) {
        this.id = 'kodik'; this.title = 'Kodik';
        var publicToken = '', endpointCache = {};
        function token(done, fail) {
            var saved = String(settings('kodik_token', '') || '').trim();
            if (saved || publicToken) return done(saved || publicToken);
            /* Read the provider's public integration script as text; never execute it.
               No key from nb557 or another third-party plugin is bundled. */
            io.request('https://kodik-add.com/add-players.min.js', null, 'text', function (script) {
                var match = script.match(/\btoken\s*[:=]\s*['"]([a-z0-9]{16,128})['"]/i) ||
                    script.match(/[?&]token=([a-z0-9]{16,128})/i);
                if (!match) return fail(new Error('Kodik: публичный API-токен не найден. Укажите свой токен в настройках плагина.'));
                publicToken = match[1]; done(publicToken);
            }, function () { fail(new Error('Kodik: не удалось получить публичный API-токен напрямую. Можно указать свой в настройках.')); });
        }
        function api(params, done, fail) {
            token(function (value) {
                params.token = value; params.limit = 100; params.with_episodes = true;
                var base = hostSetting(settings('kodik_host', ''), 'https://kodik-api.com');
                io.request(base + '/search?' + form(params), null, 'json', function (response) {
                    if (response && response.error) return fail(new Error('Kodik отклонил API-запрос. Проверьте токен и адрес API.'));
                    if (!response || !Array.isArray(response.results)) return fail(new Error('Kodik: неожиданный ответ API.'));
                    done(response.results);
                }, fail);
            }, fail);
        }
        this.search = function (query, movie, done, fail) {
            if (!String(settings('kodik_token', '') || '').trim()) {
                return token(function (value) {
                    var year=String(movie.release_date || movie.first_air_date || '').slice(0,4),attempts=[],seen={};
                    function add(fields){var key=form(fields);if(!seen[key]){seen[key]=true;attempts.push(fields);}}
                    var names=[query];
                    if([movie.title,movie.name,movie.original_title,movie.original_name].some(function(n){return n && sameTitle(n,query);}))names=names.concat([movie.original_name,movie.original_title,movie.name,movie.title]);
                    names.filter(Boolean).forEach(function(name){if(/^\d{4}$/.test(year))add({title:name,year:year});add({title:name});});
                    // IDs avoid transliteration differences without changing manually entered searches.
                    if(names.length>1){if(movie.shikimori_id)add({shikimori_id:movie.shikimori_id});if(movie.imdb_id)add({imdb_id:movie.imdb_id});if(movie.kinopoisk_id)add({kinopoisk_id:movie.kinopoisk_id});}
                    function attempt(){
                        if(!attempts.length)return done([]);
                        var fields=attempts.shift(),params=Object.assign({token:value,hasPlayer:false,url:root.location && root.location.href || 'http://lampa.mx/'},fields);
                        io.request(hostSetting(settings('kodik_host',''),'https://kodik-api.com')+'/get-player?'+form(params),null,'json',function(response){
                            if(response && response.allowed===0)return fail(new Error('Kodik не разрешил доступ к этому плееру.'));
                            if(!response || response.error)return fail(new Error('Kodik: неожиданный ответ поиска.'));
                            var url=absolute(response.link,'https://kodikplayer.com');
                            if(!url)return attempt();
                            done([{id:url,title:query,year:fields.year || '',url:url,widget:true,description:'Подбор Kodik',translation:response.translation}]);
                        },fail);
                    }attempt();
                }, fail);
            }
            var params = { title: query };
            api(params, function (rows) { done(rank(kodikResults(rows), movie)); }, fail);
        };
        this.open = function (result, done, fail) {
            if (result.widget) {
                return io.request(result.url, null, 'text', function (html) {
                    try {
                        var catalog = kodikCatalog(html, result.url, typeof result.translation === 'string' ? result.translation : 'Основной перевод');
                        done({ id: result.id, title: result.title, voices: catalog.voices, series: /\/serial\//.test(result.url), widget: true, pages: {} });
                    } catch (e) { fail(e); }
                }, fail);
            }
            var row = result.rows[0], params = {};
            if (row.shikimori_id) params.shikimori_id = row.shikimori_id;
            else if (row.kinopoisk_id) params.kinopoisk_id = row.kinopoisk_id;
            else if (row.imdb_id) params.imdb_id = row.imdb_id;
            else params.title = row.title;
            api(params, function (rows) {
                var grouped = kodikResults(rows).filter(function (g) { return g.id === result.id; })[0];
                if (!grouped) return fail(new Error('Kodik: выбранный релиз больше не найден.'));
                var voices = [], seen = {};
                grouped.rows.forEach(function (entry) {
                    var id = String(entry.translation && entry.translation.id || entry.id);
                    if (seen[id]) return;
                    seen[id] = true;
                    voices.push({ id: id, title: entry.translation && entry.translation.title || 'Оригинал',
                        rows: grouped.rows.filter(function (r) { return String(r.translation && r.translation.id || r.id) === id; }) });
                });
                done({ id: result.id, title: result.title, voices: voices, series: grouped.rows.some(function (r) { return Object.keys(r.seasons || {}).length > 0; }) });
            }, fail);
        };
        this.episodes = function (release, voice, done, fail, selectedSeason) {
            if (release.widget) {
                function readPage(url, callback) {
                    if (release.pages[url]) return callback(release.pages[url]);
                    io.request(url, null, 'text', function (html) {
                        var catalog;
                        try { catalog = kodikCatalog(html, url, voice.title); } catch (e) { return fail(e); }
                        release.pages[url] = catalog; callback(catalog);
                    }, fail);
                }
                return readPage(voice.url, function (initial) {
                    var selected = initial.seasons.filter(function (s) { return String(s.id) === String(selectedSeason); })[0];
                    function ready(catalog) {
                        var rows = catalog.episodes.map(function (episode) { episode.voice = voice; return episode; });
                        if (!rows.length && !initial.seasons.length) rows.push({ season: '', number: '', title: release.title, url: voice.url, voice: voice });
                        initial.seasons.forEach(function (s) {
                            if (!rows.some(function (ep) { return String(ep.season) === String(s.id); })) {
                                rows.push({ season: s.id, number: '', title: 'Загрузить сезон ' + s.id, loadSeason: true, voice: voice });
                            }
                        });
                        done(rows);
                    }
                    if (selected && selected.id !== initial.currentSeason) readPage(selected.url, ready);
                    else ready(initial);
                });
            }
            var episodes = [], seen = {};
            voice.rows.forEach(function (row) {
                var seasons = row.seasons || {};
                Object.keys(seasons).sort(numSort).forEach(function (season) {
                    Object.keys(seasons[season].episodes || {}).sort(numSort).forEach(function (number) {
                        var value = seasons[season].episodes[number];
                        var url = absolute(typeof value === 'string' ? value : value.link, 'https://kodikplayer.com');
                        var key = season + ':' + number;
                        if (!url || seen[key]) return;
                        seen[key] = true;
                        episodes.push({ season: season, number: number, title: 'Серия ' + number, url: url, voice: voice });
                    });
                });
                if (!Object.keys(seasons).length && row.link) episodes.push({ season: '', number: '', title: release.title,
                    url: absolute(row.link, 'https://kodikplayer.com'), voice: voice });
            });
            done(episodes);
        };
        this.resolve = function (release, episode, done, fail) {
            var page = episode.url;
            io.request(page, null, 'text', function (html) {
                var parsed;
                try { parsed = parseKodikPlayer(html, page); } catch (e) { return fail(e); }
                function getLinks(endpoint) {
                    io.request(endpoint, parsed.payload, 'json', function (response) {
                        var map = {};
                        Object.keys(response && response.links || {}).forEach(function (quality) {
                            var url = list(response.links[quality]).map(function (entry) { return kodikDecode(entry.src); }).filter(Boolean)[0];
                            if (url) map[/p$/i.test(quality) ? quality : quality + 'p'] = url;
                        });
                        if (!Object.keys(map).length) return fail(new Error('Kodik не вернул доступных видеоссылок.'));
                        done({ quality: map, subtitles: [] });
                    }, fail);
                }
                var cacheKey = origin(page) + '|' + parsed.script;
                if (endpointCache[cacheKey]) return getLinks(endpointCache[cacheKey]);
                io.request(parsed.script, null, 'text', function (script) {
                    var endpoint;
                    try { endpoint = kodikEndpoint(script, page); } catch (e) { return fail(e); }
                    endpointCache[cacheKey] = endpoint; getLinks(endpoint);
                }, fail);
            }, fail);
        };
    }

    function Libria(io, settings) {
        this.id = 'libria'; this.title = 'AniLiberty';
        function base() { return hostSetting(settings('libria_host', ''), 'https://aniliberty.top') + '/api/v1/'; }
        this.search = function (query, movie, done, fail) {
            io.request(base() + 'app/search/releases?query=' + encodeURIComponent(query), null, 'json', function (rows) {
                if (!Array.isArray(rows)) return fail(new Error('AniLiberty: неожиданный формат поиска.'));
                done(rank(rows.map(function (row) { return { id: row.id, title: row.name && row.name.main || row.alias,
                    original: row.name && row.name.english, year: row.year, series:true, description: 'Серий: ' + (row.episodes_total || '-') }; }), movie));
            }, fail);
        };
        this.open = function (result, done, fail) {
            io.request(base() + 'anime/releases/' + encodeURIComponent(result.id), null, 'json', function (release) {
                if (!release || typeof release !== 'object') return fail(new Error('AniLiberty: неожиданный ответ релиза.'));
                if (release.is_blocked_by_geo || release.is_blocked_by_copyrights) return fail(new Error('AniLiberty сообщила об ограничении доступа к релизу.'));
                var episodes = list(release.episodes).slice().sort(function (a, b) { return +a.ordinal - +b.ordinal; });
                done({ id: result.id, title: result.title, image:absolute(release.poster && (release.poster.optimized && release.poster.optimized.src || release.poster.src),'https://aniliberty.top'), episodes: episodes, voices: [{ id: 'libria', title: 'AniLiberty' }] });
            }, fail);
        };
        this.episodes = function (release, voice, done) {
            done(release.episodes.map(function (ep) { return { season: '1', number: ep.ordinal,
                title: 'Серия ' + ep.ordinal + (ep.name ? ' · ' + ep.name : ''), image:absolute(ep.preview && (ep.preview.optimized && ep.preview.optimized.src || ep.preview.src),'https://aniliberty.top'), duration:+ep.duration || 0, data: ep, voice: voice }; }));
        };
        this.resolve = function (release, episode, done, fail) {
            var map = {};
            [1080, 720, 480].forEach(function (height) {
                var url = absolute(episode.data['hls_' + height]);
                if (url) map[height + 'p'] = url;
            });
            if (!Object.keys(map).length) return fail(new Error('Для этой серии ещё нет видеопотока.'));
            done({ quality: map, subtitles: [] });
        };
    }

    // Plain-text playlists are parsed as data; provider scripts are never evaluated.
    function playerFile(html) {
        var m=String(html).match(/\bfile\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/);
        if(!m) throw new Error('На странице нет открытого видеопотока.');
        if(m[1][0]==='"') return JSON.parse(m[1]);
        return m[1].slice(1,-1).replace(/\\\//g,'/').replace(/\\'/g,"'").replace(/\\\\/g,'\\');
    }
    function hlsQualities(text,url) {
        var rows=String(text).split(/\r?\n/),quality={};
        rows.forEach(function(row,i){var m=row.match(/RESOLUTION=\d+x(\d+)/);if(m) {for(var n=i+1;n<rows.length;n++) {if(!rows[n].trim() || rows[n][0]==='#') continue;var u=absolute(rows[n],url);if(u) quality[m[1]+'p']=u;break;}}});
        return Object.keys(quality).length?quality:{auto:url};
    }
    function openStream(io,file,base,done,fail) {
        var quality={},pairs=labelledLinks(file,true);
        pairs.forEach(function(p){if(p.url) quality[p.label || 'auto']=p.url;});
        var url=absolute(file,base);
        if(!Object.keys(quality).length && url) quality.auto=url;
        if(!Object.keys(quality).length) return fail(new Error('Источник не предоставил открытый видеопоток.'));
        if(Object.keys(quality).length===1 && url && /\.m3u8(?:\?|$)/i.test(url)) {
            return io.request(url,null,'text',function(text){if(!/^\s*#EXTM3U/.test(text)) return fail(new Error('Источник вернул неверный HLS-плейлист.'));done({quality:hlsQualities(text,url),subtitles:[]});},fail);
        }
        done({quality:quality,subtitles:[]});
    }
    function Filmix(io,settings) {
        this.id='filmix';this.title='Filmix';
        var dev=settings('filmix_device_id','') || Array(17).join('0').replace(/0/g,function(){return Math.floor(Math.random()*16).toString(16);}),maxHeight=480;
        function token(){return String(settings('filmix_token','') || 'aaaabbbbccccddddeeeeffffaaaabbbb').trim();}
        function preferTV(){var route=settings('filmix_route','auto');return route==='tv' || route==='auto' && root.location && /^https?:$/.test(root.location.protocol) && !(root.Lampa && root.Lampa.Platform && root.Lampa.Platform.is('android'));}
        function tvSearch(query,movie,done,fail){
            io.request('https://api.filmix.tv/api-fx/list?search='+encodeURIComponent(query)+'&limit=48',null,'json',function(data){
                if(!data || data.status!=='ok' || !Array.isArray(data.items))return fail(new Error('FilmixTV: поиск вернул некорректный ответ.'));
                done(rank(data.items.map(function(r){return{id:r.id,title:r.title,original:r.original_name || r.original_title,year:r.year};}),movie));
            },fail);
        }
        function tvOpen(result,done,fail){
            io.request('https://api.filmix.tv/api-fx/post/'+encodeURIComponent(result.id)+'/video-links',null,'json',function(data){
                var rows=[],voices=[],seen={};
                function add(title,season,number,episode){if(!episode || !Array.isArray(episode.files) || !episode.files.some(function(f){return absolute(f.url) && +f.quality>0 && +f.quality<=maxHeight;}))return;title=String(title || 'Озвучка источника');if(!seen[title]){seen[title]=true;voices.push({id:title,title:title});}rows.push({season:String(season),number:String(number),title:episode.title || 'Серия '+number,voice:{id:title,title:title},data:{tvFiles:episode.files}});}
                if(Array.isArray(data))data.forEach(function(ep){add(ep.voiceover,0,1,ep);});
                else if(data && typeof data==='object')Object.keys(data).forEach(function(title){var seasons=data[title];if(!seasons || typeof seasons!=='object')return;Object.keys(seasons).forEach(function(key){var season=seasons[key];if(!season || !season.episodes)return;Object.keys(season.episodes).forEach(function(key){var ep=season.episodes[key];add(title,+season.season || +(String(key).match(/\d+/)||[])[0] || 1,+ep.episode || +(String(key).match(/\d+/)||[])[0] || 1,ep);});});});
                if(!rows.length)return fail(new Error('FilmixTV: нет доступных видеоссылок для этой записи.'));
                done({id:result.id,title:result.title,series:rows[0].season!=='0',voices:voices,rows:rows,maxHeight:480,transport:'tv'});
            },fail);
        }

        function api(path,params,done,fail,authToken) {
            var host=hostSetting(settings('filmix_host',''),'http://filmixapp.cyou').replace(/\/api\/v2$/i,'');
            var query={user_dev_id:dev,user_dev_name:'Xiaomi',user_dev_token:authToken===undefined?token():authToken,user_dev_vendor:'Xiaomi',user_dev_os:'7.1.1',user_dev_apk:'2.2.9',app_lang:'ru_RU'};
            Object.keys(params||{}).forEach(function(k){query[k]=params[k];});
            io.request(host+'/api/v2/'+path+'?'+form(query),null,'json',function(data){if(data && data.error){var e=data.error;return fail(new Error('Filmix: '+(e.user_message || e.message || 'API отклонил запрос')));}done(data);},function(e){fail(new Error('Filmix ('+path+'): '+safeError(e)));},{headers:{'User-Agent':'okhttp/3.10.0'},nativeOnlyHeaders:true});
        }
        this.search=function(query,movie,done,fail){
            function display(rows){done(rank(rows.map(function(r){return {id:r.id,title:r.title,original:r.orig_title || r.original_title || r.original_name,year:r.year,description:r.short_story};}),movie));}
            function reserve(previous,error){tvSearch(query,movie,done,function(e){if(previous===null)fail(error || e);else display(previous);});}
            function siteSearch(previous){io.request('https://filmix.gg/api/v2/suggestions?search_word='+encodeURIComponent(query),null,'json',function(data){var rows=list(data && data.posts);if(rows.length)display(rows);else reserve(previous);},function(e){reserve(previous,e);},{headers:{'X-Requested-With':'XMLHttpRequest'}});}
            function mobile(){api('search',{story:query},function(rows){if(Array.isArray(rows) && rows.length)display(rows);else siteSearch(Array.isArray(rows)?rows:null);},function(){siteSearch(null);});}
            if(preferTV())tvSearch(query,movie,done,mobile);else mobile();
        };
        this.profile=function(done,fail,authToken){api('user_profile',{},function(data){var user=data && data.user_data;maxHeight=user?(flag(user.is_pro_plus)?2160:flag(user.is_pro)?1080:720):480;done({user:user,maxHeight:maxHeight});},fail,authToken);};
        this.requestToken=function(done,fail){api('token_request',{},function(data){if(!data || data.status!=='ok' || !data.code || !data.user_code) return fail(new Error('Filmix: не удалось получить код привязки.'));done(data);},fail,'');};
        var provider=this;
        this.open=function(result,done,fail){
            function open(){
                if(preferTV())tvOpen(result,done,function(tvError){openPost(result,done,function(){fail(tvError);});});
                else openPost(result,done,function(mobileError){tvOpen(result,done,function(){fail(mobileError);});});
            }
            if(!preferTV() && settings('filmix_token','')) return provider.profile(open,function(){maxHeight=480;open();});
            maxHeight=480;open();
        };
        function openPost(result,done,fail,retried){api('post/'+encodeURIComponent(result.id),retried?{_lp_retry:Date.now()}:{},function(data){
            var links=data && data.player_links;
            if(!links) return fail(new Error('Filmix: ответ post/'+result.id+' не содержит player_links. '+(data && data.message || 'Проверьте доступ аккаунта.')));
            var voices=[],rows=[],seen={};
            function add(id,title,season,number,file){id=String(id);if(!seen[id]) {seen[id]=true;voices.push({id:id,title:title || id});}rows.push({season:String(season),number:String(number),title:'Серия '+number,data:file,voice:{id:id,title:title || id}});}
            if(links.playlist && Object.keys(links.playlist).length) {
                Object.keys(links.playlist).forEach(function(s,si){Object.keys(links.playlist[s]).forEach(function(v){Object.keys(links.playlist[s][v]).forEach(function(e,ei){var f=links.playlist[s][v][e],match=String(f.link||'').match(/s(\d+)e(\d+)_/i);if(!f.link)return;add(v,v,parseInt(s,10) || match && +match[1] || si+1,parseInt(e,10) || match && +match[2] || ei+1,f);});});});
            } else list(links.movie).forEach(function(f,i){add(i,f.translation,0,1,f);});
            if(!rows.length){if(!retried)return openPost(result,done,fail,true);return fail(new Error('Filmix: пустой плейлист post/'+result.id+'. API может ограничивать запросы из браузера. Успешная привязка устройства не подтверждает доступ к видеопотокам.'));}
            done({id:result.id,title:result.title,series:rows[0].season!=='0',voices:voices,rows:rows,maxHeight:maxHeight});
        },function(e){if(!retried && /HTTP (404|50\d)/.test(safeError(e)))return openPost(result,done,fail,true);fail(e);});};
        this.episodes=function(release,voice,done){done(release.rows.filter(function(e){return e.voice.id===String(voice.id);}));};
        this.resolve=function(release,ep,done,fail){
            if(ep.data.tvFiles){var q={};list(ep.data.tvFiles).forEach(function(f){var url=absolute(f.url),h=+f.quality;if(url && h>0 && h<=Math.min(480,release.maxHeight || 480))q[h+'p']=url;});if(!Object.keys(q).length)return fail(new Error('FilmixTV: нет видеоссылок в доступном качестве.'));return done({quality:q,subtitles:[]});}
            var file=ep.data.link || '',quality={},match=file.match(/\[([\d,]+)\]/),heights=match?match[1].split(','):list(ep.data.qualities);
            heights.map(Number).filter(function(n){return n>0 && n<=(release.maxHeight || maxHeight);}).forEach(function(h){var u=absolute(file.replace(/\[[\d,]+\]|%s/,String(h)));if(u) quality[h+'p']=u;});
            // Public guest access is limited to 480p; account-only qualities are not advertised.
            if(!Object.keys(quality).length) return fail(new Error('Filmix: нет видеоссылок в доступном аккаунту качестве.'));
            done({quality:quality,subtitles:[]});
        };
    }
    function CDNVideoHub(io,settings){
        this.id='cdnvideohub';this.title='CDNvideohub';
        var api='https://plapi.cdnvideohub.com/api/v1/player/sv/';
        this.search=function(query,movie,done,fail){
            var kp=movie.kinopoisk_id || movie.kinopoiskId || movie.kp_id || (movie.source==='kinopoisk'?movie.id:'');
            if(!/^\d+$/.test(String(kp)))return fail(new Error('CDNvideohub: у карточки нет ID Кинопоиска. Поиск по названию этим API не поддерживается.'));
            io.request(api+'playlist?pub=12&aggr=kp&id='+encodeURIComponent(kp),null,'json',function(data){
                if(!data || !Array.isArray(data.items) || !data.items.length)return done([]);
                done([{id:String(kp),title:data.titleName || movie.title || movie.name || query,year:String(movie.release_date || movie.first_air_date || '').slice(0,4),original:movie.original_title || movie.original_name || '',series:!!data.isSerial,widget:true,playlist:data}]);
            },fail);
        };
        this.open=function(result,done,fail){
            function parse(data){var rows=[],voices=[],seen={};list(data && data.items).forEach(function(item){if(!item.vkId)return;var title=item.voiceStudio || item.voiceType || 'Оригинал',id=title;if(!seen[id]){seen[id]=true;voices.push({id:id,title:title});}rows.push({season:String(item.season==null?0:item.season),number:String(item.episode || 1),title:item.episodeName || 'Серия '+(item.episode||1),data:item,voice:{id:id,title:title}});});if(!rows.length)return fail(new Error('CDNvideohub: плейлист пуст.'));done({id:result.id,title:result.title,series:!!data.isSerial,rows:rows,voices:voices});}
            if(result.playlist)return parse(result.playlist);io.request(api+'playlist?pub=12&aggr=kp&id='+encodeURIComponent(result.id),null,'json',parse,fail);
        };
        this.episodes=function(release,voice,done){done(release.rows.filter(function(row){return row.voice.id===voice.id;}));};
        this.resolve=function(release,ep,done,fail){io.request(api+'video/'+encodeURIComponent(ep.data.vkId),null,'json',function(data){
            var sources=data && data.sources || {},quality={};
            // The service explicitly supplies a CDN failover host; it is another video CDN, not a proxy.
            function link(value){var url=absolute(value);if(!url)return '';var host=String(data.failoverHost || '');if(/^(?:[a-z0-9-]+\.)*okcdn\.ru$/i.test(host)){var parsed=new root.URL(url);parsed.hostname=host;url=parsed.href;}return url;}
            [['mpeg2kUrl',2160],['mpeg4kUrl',1440],['mpegQhdUrl',1440],['mpegFullHdUrl',1080],['mpegHighUrl',720],['mpegMediumUrl',480],['mpegLowUrl',360],['mpegLowestUrl',240],['mpegTinyUrl',144]].forEach(function(pair){var url=link(sources[pair[0]]);if(url)quality[pair[1]+'p']=url;});
            if(!Object.keys(quality).length && sources.hlsUrl)quality.auto=link(sources.hlsUrl);
            if(!Object.keys(quality).length)return fail(new Error('CDNvideohub: источник не вернул видеоссылок.'));done({quality:quality,subtitles:[]});
        },fail);};
    }
    function KinoTochka(io,settings) {
        this.id='kinotochka';this.title='KinoTochka';
        function base(){return hostSetting(settings('kinotochka_host',''),'https://kinovibe.cc');}
        this.search=function(query,movie,done,fail){
            var kp=movie.kinopoisk_id || movie.kinopoiskId || movie.kp_id || (movie.source==='kinopoisk'?movie.id:'');
            function byName(){io.request(base()+'/index.php?do=search',{do:'search',subaction:'search',search_start:0,full_search:0,result_from:1,story:query},'text',function(html){try{
                var dom=doc(cleanPage(html)),rows=[],seen={};nodes(dom,'a.sres-wrap[href], .sres-wrap a[href], .short-title a[href], .sres-title a[href]').forEach(function(a){var url=absolute(a.getAttribute('href'),base());if(url && /\/\d+-[^/]+\.html/.test(url) && !seen[url]) {seen[url]=true;rows.push({id:url.match(/\/(\d+)-/)[1],url:url,title:(a.querySelector('.sres-title, h2') || a).textContent.trim(),year:(a.textContent.match(/(?:19|20)\d{2}/)||[])[0]});}});done(rank(rows,movie));
            }catch(e){fail(e);}},fail);}
            if(!kp) return byName();
            io.request(base()+'/api/find-by-kinopoisk.php?kinopoisk='+encodeURIComponent(kp),null,'json',function(rows){if(!Array.isArray(rows) || !rows.length) return byName();done(rows.filter(function(r){return absolute(r.url);}).map(function(r){return {id:r.id,url:r.url,title:movie.title||movie.name||query,year:String(movie.release_date||movie.first_air_date||'').slice(0,4)};}));},byName);
        };
        this.open=function(result,done,fail){io.request(result.url,null,'text',function(html){try{
            var file=playerFile(cleanPage(html));
            function parsed(data){try{
                var rows=[],voices=[{id:'default',title:'Озвучка источника'}];
                function walk(value,s){var items=Array.isArray(value)?value:value.playlist || value.folder;if(!Array.isArray(items)) throw new Error('KinoTochka: неизвестный формат плейлиста.');items.forEach(function(item,i){var title=item.title || item.comment || '',folder=item.folder || item.playlist;if(folder) return walk(folder,+(title.match(/\d+/)||[])[0]||s);if(typeof item.file==='string') {var ids=item.file.match(/s(\d+)e(\d+)/i);rows.push({season:String(ids?+ids[1]:s || 1),number:String(ids?+ids[2]:+(title.match(/\d+/)||[])[0]||i+1),title:title.replace(/<[^>]*>/g,' ').trim(),data:item.file,voice:voices[0]});}});}
                walk(data,1);if(!rows.length) throw new Error('KinoTochka: плейлист пуст.');done({id:result.id,title:result.title,series:true,voices:voices,rows:rows});
            }catch(e){fail(e);}}
            var url=absolute(file,result.url);
            if(url && /\.(?:txt|json)(?:\?|$)/i.test(url)) io.request(url,null,'text',function(text){try{parsed(JSON.parse(text.replace(/^\uFEFF/,'')));}catch(e){fail(e);}},fail);
            else if(/^\s*[\[{]/.test(file)) parsed(JSON.parse(file));
            else if(url) {var v={id:'default',title:'Озвучка источника'};done({id:result.id,title:result.title,series:false,voices:[v],rows:[{season:'0',number:'1',voice:v,data:file}]});}
            else fail(new Error('KinoTochka: нет открытого плейлиста.'));
        }catch(e){fail(e);}},fail);};
        this.episodes=function(release,voice,done){done(release.rows);};
        this.resolve=function(release,ep,done,fail){openStream(io,ep.data,base(),done,fail);};
    }
    function AniMedia(io,settings) {
        this.id='animedia';this.title='AniMedia';
        function base(){return hostSetting(settings('animedia_host',''),'https://amd.online');}
        this.search=function(query,movie,done,fail){io.request(base()+'/index.php?do=search',{do:'search',subaction:'search',story:query,full_search:0,result_from:1},'text',function(html){try{
            var dom=doc(cleanPage(html)),seen={},rows=[];nodes(dom,'#dle-content .poster__link').forEach(function(a){var url=absolute(a.getAttribute('href'),base());if(!url || seen[url]) return;seen[url]=true;rows.push({id:(url.match(/\/(\d+)-/)||[])[1] || url,url:url,title:a.textContent.trim()});});done(rank(rows,movie));
        }catch(e){fail(e);}},fail);};
        this.open=function(result,done,fail){io.request(result.url,null,'text',function(html){try{
            var dom=doc(cleanPage(html)),rows=[],seen={},v={id:'animedia',title:'AniMedia'},info=dom.querySelector('.pmovie__main-info'),s=info && info.textContent.match(/Season\s+(\d+)/i);
            nodes(dom,'[data-vid][data-vlnk]').forEach(function(a){var n=+a.getAttribute('data-vid'),url=absolute(a.getAttribute('data-vlnk'),base());if(!n || seen[n] || !url || !/\/vod\/\d+/.test(url)) return;seen[n]=true;rows.push({season:s?s[1]:'1',number:String(n),title:'Серия '+n,voice:v,data:url});});
            if(!rows.length) return fail(new Error('AniMedia: у этого релиза нет собственного открытого плеера.'));
            done({id:result.id,title:result.title,series:true,voices:[v],rows:rows.sort(function(a,b){return +a.number-+b.number;})});
        }catch(e){fail(e);}},fail);};
        this.episodes=function(release,voice,done){done(release.rows);};
        this.resolve=function(release,ep,done,fail){io.request(ep.data,null,'text',function(html){try{openStream(io,playerFile(html),ep.data,done,fail);}catch(e){fail(e);}},fail);};
    }

    // Catalog keys are sharded static metadata; video requests go directly to VeoVeo.
    var veoIndexCache={};
    function VeoVeo(io,settings){
        this.id='veoveo';this.title='VeoVeo';
        var activeHost='';
        function bases(){var preferred=hostSetting(settings('veoveo_host',''),'https://api.rstprgapipt.com'),hosts=[activeHost || preferred];if(flag(settings('veoveo_fallback',true),true) && ['https://api.rstprgapipt.com','https://tazaromikaz.link'].indexOf(preferred)>=0)hosts=hosts.concat([preferred,'https://api.rstprgapipt.com','https://tazaromikaz.link']);return hosts.filter(function(h,i,a){return a.indexOf(h)===i;});}
        function bucket(key){var n=0;for(var i=0;i<key.length;i++)n=(n*31+key.charCodeAt(i))%32;return n;}
        function catalog(id,done,fail){var hosts=bases(),errors=[];
            function next(){var host=hosts.shift();if(!host)return fail(new Error('VeoVeo: API не вернул список видео. '+errors.join(' / ')));
                io.request(host+'/balancer-api/proxy/playlists/catalog-api/episodes?content-id='+encodeURIComponent(id),null,'json',function(data){if(!Array.isArray(data) || !data.length){errors.push(origin(host)+': пустой плейлист');next();return;}activeHost=host;done(data);},function(e){errors.push(origin(host)+': '+safeError(e));next();});
            }next();
        }
        this.check=function(done,fail){catalog(15652,done,fail);};
        this.search=function(query,movie,done,fail){
            var keys=[],kp=movie.kinopoisk_id || movie.kinopoiskId || movie.kp_id || (movie.source==='kinopoisk'?movie.id:''),imdb=movie.imdb_id;
            var matches=[movie.title,movie.name,movie.original_title,movie.original_name].some(function(t){return normal(t)===normal(query);});
            if(matches){if(kp)keys.push('kp:'+kp);if(imdb)keys.push('imdb:'+imdb);}
            keys.push('t:'+normal(query));if(matches)[movie.original_name,movie.original_title,movie.name,movie.title].forEach(function(t){if(t)keys.push('t:'+normal(t));});
            keys=keys.filter(function(k,i,a){return a.indexOf(k)===i;});
            function next(){var key=keys.shift();if(!key)return fail(new Error('VeoVeo: в справочнике нет соответствия для этого произведения. Это не подтверждает отсутствие видео у источника.'));
                var shard=bucket(key);
                function found(index){var rows=index[key] || [],year=String(movie.release_date || movie.first_air_date || '').slice(0,4),same=rows.filter(function(r){return year && String(r[1])===year;});if(same.length)rows=same;
                    else if(key.indexOf('t:')===0 && year)rows=rows.filter(function(r){return !r[1];});
                    if(!rows.length)return next();
                    done(rows.map(function(r){return{id:r[0],title:query,year:r[1] || '',widget:rows.length===1};}));
                }
                if(veoIndexCache[shard])return found(veoIndexCache[shard]);
                var suffix=shard+'.json?v='+Math.floor(Date.now()/604800000);
                function receive(data){if(!data || Array.isArray(data) || typeof data!=='object')return fail(new Error('VeoVeo: не удалось прочитать справочник каталога.'));veoIndexCache[shard]=data;found(data);}
                // Raw branch content also updates after scheduled bot commits, independently of Pages rebuilds.
                io.request('https://raw.githubusercontent.com/Water-FAQ/LamPlay/main/data/veoveo/'+suffix,null,'json',receive,function(){io.request('https://water-faq.github.io/LamPlay/data/veoveo/'+suffix,null,'json',receive,fail);});
            }next();
        };
        this.open=function(result,done,fail){catalog(result.id,function(data){var rows=[],voices=[],seen={};data.forEach(function(ep){list(ep.episodeVariants).forEach(function(v){var url=absolute(v.filepath),title=v.title && v.title!=='DEFAULT'?v.title:'Озвучка источника';if(!url)return;var id=title;if(!seen[id]){seen[id]=true;voices.push({id:id,title:title});}rows.push({season:String(ep.season && ep.season.order || 0),number:String(ep.order || 1),title:ep.title || 'Эпизод '+(ep.order || 1),duration:v.duration,image:absolute(v.previewImageFilepath),voice:{id:id,title:title},data:url});});});if(!rows.length)return fail(new Error('VeoVeo: в плейлисте нет видеоссылок.'));done({id:result.id,title:result.title,series:rows.some(function(ep){return +ep.season>0;}),voices:voices,rows:rows});},fail);};
        this.episodes=function(release,voice,done){done(release.rows.filter(function(ep){return ep.voice.id===voice.id;}));};
        this.resolve=function(release,ep,done,fail){
            // Let the player follow the content-router redirect. Resolving relative HLS
            // variants against its original API host would produce invalid URLs.
            function stream(url){var quality={};quality['Авто']=url;done({quality:quality,subtitles:[]});}
            if(/\.json(?:\?|$)/i.test(ep.data))io.request(ep.data,null,'json',function(data){var src=list(data && data.sources).filter(function(v){return absolute(v.link);})[0];if(!src)return fail(new Error('VeoVeo: нет ссылки в описании потока.'));stream(absolute(src.link));},fail);else stream(ep.data);
        };
    }
    function searchNames(movie) {
        var ru=String(movie.title||movie.name||'').trim(), en=String(movie.original_title||movie.original_name||'').trim();
        var year=String(movie.release_date||movie.first_air_date||'').slice(0,4), all=[];
        [ru,ru+' '+en,en,en+' '+ru].forEach(function (name) {
            name=name.replace(/\s+/g,' ').trim();if (!name) return;
            [name,year?name+' '+year:''].forEach(function (q) {if (q && all.indexOf(q)<0) all.push(q);});
        });return all;
    }
    function titleAliases(value) {
        var parts=String(value || '').split(/\s*[/|]\s*/);parts.unshift(String(value || ''));
        return parts.map(normal).filter(Boolean);
    }
    function sameTitle(a,b) {var aa=titleAliases(a),bb=titleAliases(b);return aa.some(function (name) {return bb.indexOf(name)>=0;});}
    function seasonIdentity(value) {
        var text=String(value || ''), n=normal(text), season=null, part=null;
        var m=text.match(/(?:т[вv]|tv|season|сезон)\s*[-:№]?\s*(\d+)/i) || text.match(/(\d+)(?:st|nd|rd|th)?\s*[-й]*\s*(?:сезон|season)/i);
        if(m)season=+m[1];
        m=text.match(/(?:часть|part|cour)\s*[-:]?\s*(\d+)/i);if(m)part=+m[1];
        if(!season){m=text.match(/^(.*?)[ \[]+(\d+)(?:[. \]]|$)/);if(m)season=+m[2];}
        var special=/\b(?:ova|ona|oad|special|movie)\b|спецвыпуск|фильм|рекап/i.test(text);
        var aliases=String(text).split(/\s*[/|]\s*/).map(function(t){return normal(t
            .replace(/\b(?:tv|season)\s*[-:№]?\s*\d+/ig,' ')
            .replace(/(?:ТВ|сезон)\s*[-:№]?\s*\d+/ig,' ')
            .replace(/\d+(?:st|nd|rd|th)?\s*[-й]*\s*(?:сезон|season)/ig,' ')
            .replace(/(?:часть|part|cour)\s*[-:]?\s*\d+/ig,' ')
            .replace(/(?:the\s+)?final\s+season|финал(?:ьный сезон)?|последний сезон/ig,' ')
            .replace(/\s+\d+\s*[.\]]*\s*$/,' '));}).filter(Boolean);
        return {season:season,part:part,special:special,aliases:aliases,final:/final\s+season|финал|последний сезон/i.test(text)};
    }
    function relatedSeason(movie,target) {
        if(!target)return false;
        var b=seasonIdentity(target.title),names=[movie.title,movie.name,movie.original_title,movie.original_name];
        if(b.special)return false;
        return names.some(function(name){return name && seasonIdentity(name).aliases.some(function(a){return b.aliases.indexOf(a)>=0;});});
    }
    function episodeCountLabel(n) {var a=n%100,b=n%10;return n+' '+(a>=11 && a<=14?'серий':b===1?'серия':b>=2 && b<=4?'серии':'серий');}
    function exactResult(items,movie,query) {
        if (items.length===1 && items[0].widget) return items[0];
        var names=[query];if (searchNames(movie).indexOf(query)>=0) names=names.concat([movie.title,movie.name,movie.original_title,movie.original_name]);
        names=names.map(normal).filter(Boolean);var year=String(movie.release_date||movie.first_air_date||'').slice(0,4);
        var exact=items.filter(function (r) {return [r.title,r.original].some(function (t) {return t && titleAliases(t).some(function (alias) {return names.indexOf(alias)>=0;});});});
        var sameYear=exact.filter(function (r) {return year && String(r.year)===year;});
        if (sameYear.length===1) return sameYear[0];
        if (exact.length===1 && (!year || !exact[0].year || String(exact[0].year)===year)) return exact[0];
        return null;
    }
    function maxQuality(map) {var keys=Object.keys(map||{}).filter(function (k) {return !!map[k];}).sort(function (a,b) {return qualityNumber(b)-qualityNumber(a);});var q=keys.length?qualityNumber(keys[0]):0;return q>=2160?'4K':q===1440?'2K':q===1080?'Full HD':q===720?'HD':q?String(q):'';}
    function formatDate(value) {var d=new Date(value+'T12:00:00');return isNaN(d.getTime())?'':d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});}
    function clock(value) {var n=Math.max(0,Math.floor(+value||0));return Math.floor(n/60)+':'+('0'+n%60).slice(-2);}
    function progressText(p,remaining) {
        var time=Math.max(0,+p.time||0),duration=Math.max(0,+p.duration||0);
        if (!duration) return time?'Просмотрено '+Math.floor(time/60)+' мин.':'';
        return remaining?'Осталось '+Math.ceil(Math.max(0,duration-time)/60)+' мин.':
            'Просмотрено '+(time<60?Math.floor(time)+' сек.':Math.floor(time/60)+' мин.')+' из '+Math.ceil(duration/60)+' мин. · '+Math.round(+p.percent||time/duration*100)+'%';
    }
    function movieDuration(seconds) {var m=Math.ceil(Math.max(0,+seconds||0)/60),h=Math.floor(m/60);return ((h?h+' ч ':'')+(m%60 || !h?m%60+' мин.':'')).trim();}
    // One animation per pane, preserving current velocity when the remote changes its target.
    function animatePane(pane,dest,horizontal) {
        pane.style.scrollBehavior='auto';var state=pane._lpMotion,now=root.performance?root.performance.now():Date.now(),from=horizontal?pane.scrollLeft:pane.scrollTop;
        var velocity=state&&state.horizontal===horizontal?state.velocity:0,delta=dest-from;
        if(velocity*delta<0)velocity=0;velocity=Math.sign(delta)*Math.min(Math.abs(velocity),Math.abs(delta)*3/260);
        if(pane._lpScrollFrame)root.cancelAnimationFrame(pane._lpScrollFrame);
        state=pane._lpMotion={velocity:velocity,horizontal:horizontal};var duration=260;
        function tick(time){var t=Math.min(1,Math.max(0,(time-now)/duration)),t2=t*t,t3=t2*t;
            var pos=from+(3*t2-2*t3)*delta+(t3-2*t2+t)*duration*velocity;
            state.velocity=((6*t-6*t2)*delta+(3*t2-4*t+1)*duration*velocity)/duration;
            if(horizontal)pane.scrollLeft=pos;else pane.scrollTop=pos;
            if(t<1)pane._lpScrollFrame=root.requestAnimationFrame(tick);else{pane._lpScrollFrame=null;state.velocity=0;}
        }
        if(root.requestAnimationFrame)pane._lpScrollFrame=root.requestAnimationFrame(tick);else if(horizontal)pane.scrollLeft=dest;else pane.scrollTop=dest;
    }
    function keepVisible(pane,target) {
        if (!pane || !target || !pane.contains(target)) return;
        var box=pane.getBoundingClientRect(),rect=target.getBoundingClientRect(),gap=8;
        if (pane.classList.contains('lp-strip') || pane.classList.contains('lp-tools') && !pane.closest('.lamplay').classList.contains('lp-columns') || pane.classList.contains('lp-body-pane') && (target.classList.contains('lp-episode') || target.classList.contains('lp-result'))) {
            var horizontal=!pane.classList.contains('lp-body-pane') || !pane.closest('.lamplay').classList.contains('lp-columns');
            var dest=horizontal?pane.scrollLeft+rect.left-box.left+(rect.width-pane.clientWidth)/2:pane.scrollTop+rect.top-box.top+(rect.height-pane.clientHeight)/2;
            dest=Math.max(0,Math.min(dest,horizontal?pane.scrollWidth-pane.clientWidth:pane.scrollHeight-pane.clientHeight));
            animatePane(pane,dest,horizontal);
            return;
        }
        if (pane.scrollHeight>pane.clientHeight && !(pane.classList.contains('lp-body-pane') && pane.closest('.lamplay') && /^(horizontal|card)$/.test(pane.closest('.lamplay').getAttribute('data-view')))) {
            if (rect.bottom>box.bottom-gap) pane.scrollTop+=rect.bottom-box.bottom+gap;
            if (rect.top<box.top+gap) pane.scrollTop-=box.top-rect.top+gap;
        }
        if (pane.scrollWidth>pane.clientWidth) {
            var preview=Math.min(65,pane.clientWidth*.09),left=pane.scrollLeft;
            if (rect.right>box.right-preview) left+=rect.right-box.right+preview;
            else if (rect.left<box.left+preview) left-=box.left-rect.left+preview;
            if(pane.scrollTo) pane.scrollTo({left:Math.max(0,left),behavior:'smooth'});else pane.scrollLeft=Math.max(0,left);
        }
    }

    function episodeHash(movie,season,number,isSeries,hash) {
        var title=movie.original_title || movie.original_name || movie.title || movie.name || '';
        return hash(isSeries?[season,+season>10?':':'',number,title].join(''):title);
    }
    function mergeEpisodes(items,known,season,voice) {
        var out=items.slice(),seen={};items.forEach(function(e){if(!e.loadSeason)seen[e.season+':'+e.number]=true;});
        (known||[]).forEach(function(m){var n=m.episode_number,s=m.season_number==null?season:m.season_number;if(+n>0 && !seen[s+':'+n])out.push({season:String(s),number:String(n),title:m.name || 'Эпизод '+n,voice:voice,unavailable:true});});
        return out.sort(function(a,b){return +a.season-+b.season || +a.number-+b.number;});
    }
    function availability(date,now) {
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return '';
        var today=new Date(now==null?Date.now():now),parts=date.split('-').map(Number);
        var days=Math.round((Date.UTC(parts[0],parts[1]-1,parts[2])-Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()))/86400000);
        return days>0?'Осталось дней: '+days:'';
    }
    var Core = { seasonIdentity:seasonIdentity, relatedSeason:relatedSeason, episodeCountLabel:episodeCountLabel, episodeHash:episodeHash,mergeEpisodes:mergeEpisodes,availability:availability,exactResult: exactResult, searchNames: searchNames, maxQuality: maxQuality, keepVisible: keepVisible, progressText: progressText, VERSION: VERSION, RELEASE_DATE: RELEASE_DATE, form: form, absolute: absolute, hostSetting: hostSetting, rank: rank,
        rezkaDecode: rezkaDecode, kodikDecode: kodikDecode, labelledLinks: labelledLinks, chooseQuality: chooseQuality,
        parseRezkaSearch: parseRezkaSearch, parseRezkaPage: parseRezkaPage, rezkaEpisodes: rezkaEpisodes,
        kodikResults: kodikResults, parseKodikPlayer: parseKodikPlayer, kodikEndpoint: kodikEndpoint, kodikCatalog: kodikCatalog,
        VeoVeo: VeoVeo, Filmix: Filmix, CDNVideoHub: CDNVideoHub, KinoTochka: KinoTochka, AniMedia: AniMedia, playerFile: playerFile, hlsQualities: hlsQualities, Transport: Transport, Rezka: Rezka, Kodik: Kodik, Libria: Libria, flag: flag, movieKey: movieKey,
        rememberSource: rememberSource, episodeTitle: episodeTitle, prepareStreams: prepareStreams,
        fixRezkaStream: fixRezkaStream, mergeCookies: mergeCookies, cookieHeader: cookieHeader, RezkaSession: RezkaSession };
    if (typeof module !== 'undefined' && module.exports) { module.exports = Core; return; }

    // UI and registration use only the host Lampa API.
    function install(Lampa, $) {
        if (root.lamplay_plugin) return;
        root.lamplay_plugin = { version: VERSION };
        function setting(name, fallback) { return Lampa.Storage.get(KEY + '_' + name, fallback); }
        function save(name, value) { Lampa.Storage.set(KEY + '_' + name, value); }
        if (!flag(setting('migrated_010', false))) {
            ['source', 'quality', 'rezka_host', 'kodik_host', 'kodik_token', 'libria_host', 'timeout', 'prefer_mp4'].forEach(function (name) {
                var old = Lampa.Storage.get('wf_online_' + name, null);
                if (setting(name, null) === null && old !== null) save(name, old);
            });
            save('migrated_010', true);
        }
        if (['https://api.anilibria.app','https://anilibria.top','https://anilibria.tv'].indexOf(String(setting('libria_host','')).replace(/\/$/,''))>=0) save('libria_host','https://aniliberty.top');
        if(!setting('filmix_device_id','')) save('filmix_device_id',Array(17).join('0').replace(/0/g,function(){return Math.floor(Math.random()*16).toString(16);}));
        if(!flag(setting('migrated_050_source',false))) {if(!setting('source','') || setting('source','')==='kodik') save('source','rezka');save('migrated_050_source',true);}
        if(setting('source','rezka')==='animedia')save('source','rezka');
        function buildProviders(io) {
            return [new Rezka(io, setting, new RezkaSession(io, setting, save, Lampa)), new Kodik(io, setting), new Libria(io, setting), new Filmix(io, setting), new CDNVideoHub(io,setting), new KinoTochka(io, setting), new VeoVeo(io,setting)];
        }
        function saveResume(key, value) {
            var all=object(setting('resume',{})),updated={};
            Object.keys(all).forEach(function (k) {updated[k]=all[k];});updated[key]=value;
            Object.keys(updated).sort(function (a,b) {return (+updated[b].updated||0)-(+updated[a].updated||0);}).slice(500).forEach(function (k) {delete updated[k];});
            save('resume',updated);
        }
        var sourceHealth = {};
        var currentPlayback = null, lastProgressSave = 0, activeScreen = null, cardBackgroundSnapshot=null;
        function captureCardBackground(render) {
            cardBackgroundSnapshot=null;var image=render.find('.full-start__background.loaded').last();
            if(!image.length) return;var r=image[0].getBoundingClientRect(),c=root.getComputedStyle(image[0]);
            if(r.width>0 && r.height>0) cardBackgroundSnapshot=image.clone().removeAttr('id').removeClass('dim').addClass('lp-native-background').css({position:'fixed',left:(r.left/root.innerWidth*100)+'vw',top:(r.top/root.innerHeight*100)+'vh',width:(r.width/root.innerWidth*100)+'vw',height:(r.height/root.innerHeight*100)+'vh',margin:0,transform:'none',transition:'none',opacity:c.opacity,zIndex:0});
        }
        var nextActivated=0;
        function nextTile(){return currentPlayback && Lampa.PlayerPanel && Lampa.PlayerPanel.render ? Lampa.PlayerPanel.render().find('.lp-next-action').first():$();}
        function focusPlayerTimeline(){
            var panel=Lampa.PlayerPanel && Lampa.PlayerPanel.render && Lampa.PlayerPanel.render(),timeline=panel && panel.find('.player-panel__timeline').first();
            if(timeline && timeline.length){Lampa.Controller.collectionSet(panel);Lampa.Controller.collectionFocus(timeline[0],panel);}
        }
        Lampa.Controller.add('lamplay_next',{
            toggle:function(){var tile=nextTile();if(!tile.length)return Lampa.Controller.toggle('player_rewind');var panel=Lampa.PlayerPanel.render();Lampa.Controller.collectionSet(panel);Lampa.Controller.collectionFocus(tile[0],panel);},
            down:function(){Lampa.Controller.toggle('player_rewind');},
            up:function(){Lampa.Controller.toggle('player');if(Lampa.PlayerPanel && Lampa.PlayerPanel.hide)Lampa.PlayerPanel.hide();},
            left:function(){Lampa.Controller.toggle('player_rewind');},right:function(){Lampa.Controller.toggle('player_rewind');},
            enter:function(){nextTile().trigger('hover:enter');},back:function(){Lampa.Controller.toggle('player_panel');},
            gone:function(){nextTile().removeClass('focus');}
        });
        // Extend only the native rewind controller. A key must never traverse two levels.
        if(Lampa.Controller.listener)Lampa.Controller.listener.follow('toggle',function(e){
            if(!currentPlayback || !e || e.name!=='player_rewind')return;
            var state=Lampa.Controller.enabled(),controller=state && state.controller;
            if(!controller)return;
            focusPlayerTimeline();
            if(controller.up && !controller.up._lpNextUp){
                var originalUp=controller.up;
                var up=function(){
                    var tile=nextTile(),panel=Lampa.PlayerPanel.render();
                    if(currentPlayback && tile.length && panel.hasClass('panel--visible') && !panel.find('.player-skip.selector').not('.hide').length)return Lampa.Controller.toggle('lamplay_next');
                    return originalUp.apply(this,arguments);
                };
                up._lpNextUp=true;controller.up=up;
            }
        });
        function paintNextLabel(event) {
            if (!Lampa.PlayerPanel || !Lampa.PlayerPanel.render || !currentPlayback) return;
            var rendered=Lampa.PlayerPanel.render();
            rendered.find('.player-next__title').text(currentPlayback._lamplay.series ? 'Следующая серия' : 'Следующая озвучка');
            var list=event && event.playlist || Lampa.PlayerPlaylist && Lampa.PlayerPlaylist.get && Lampa.PlayerPlaylist.get();
            var next=event && event.playlist ? list[event.position+1] : null;
            if (!next && list) for (var i=0;i<list.length-1;i++) if (list[i]===currentPlayback || list[i].url===currentPlayback.url) {next=list[i+1];break;}
            if (next && next._lpNextTitle) rendered.find('.player-next__episode-title').text(next._lpNextTitle);
            var tile=rendered.find('.player-next');
            if(next && next._lamplay && Lampa.PlayerPlaylist && Lampa.PlayerPlaylist.next){
                tile.addClass('selector lp-next-action').attr({tabindex:'0',role:'button','aria-label':(currentPlayback._lamplay.series?'Следующая серия: ':'Следующая озвучка: ')+(next._lpNextTitle || next.title || '')});
                var playing=currentPlayback;
                tile.off('.lamplayNext').on('hover:enter.lamplayNext click.lamplayNext',function(e){
                    if(e){e.preventDefault();e.stopPropagation();}if(currentPlayback!==playing || Date.now()-nextActivated<500)return;nextActivated=Date.now();
                    var video=Lampa.PlayerVideo && Lampa.PlayerVideo.video && Lampa.PlayerVideo.video();
                    if(video && video.duration>0 && playing.timeline && playing.timeline.handler)playing.timeline.handler(video.currentTime/video.duration*100,video.currentTime,video.duration);
                    Lampa.PlayerPlaylist.next();
                });
            }else tile.removeClass('selector lp-next-action').removeAttr('tabindex role aria-label').off('.lamplayNext');
        }
        if (Lampa.Player && Lampa.Player.listener) {
            Lampa.Player.listener.follow('start', function (data) {
                currentPlayback = data && data._lamplay ? data : null;
                if (currentPlayback) { data._lamplay.updated=Date.now();saveResume(movieKey(data.card), data._lamplay); setTimeout(paintNextLabel, 0); }
            });
            Lampa.Player.listener.follow('close', function () {
                currentPlayback = null;
                if (activeScreen && activeScreen.playerClosed) activeScreen.playerClosed();
            });
        }
        if (Lampa.PlayerPlaylist && Lampa.PlayerPlaylist.listener) Lampa.PlayerPlaylist.listener.follow('set', paintNextLabel);
        if (Lampa.PlayerPanel && Lampa.PlayerPanel.listener) Lampa.PlayerPanel.listener.follow('visible', paintNextLabel);
        if (Lampa.PlayerVideo && Lampa.PlayerVideo.listener) {
            Lampa.PlayerVideo.listener.follow('timeupdate', function (e) {
                var data = currentPlayback;
                if (!data || !data.timeline || !e.duration) return;
                if (data._lpResumeAt !== undefined) {
                    var position = Math.max(0, Math.min(data._lpResumeAt, e.duration - 0.5));
                    // Skip Lampa's optional resume prompt only for the explicit Continue button.
                    data.timeline.waiting_for_user = false; data.timeline.continued = true;
                    data.timeline.time = position; data.timeline.percent = position / e.duration * 100;
                    if (Math.abs(e.current - position) > 2) { Lampa.PlayerVideo.to(position); return; }
                    delete data._lpResumeAt;
                }
                if (Date.now() - lastProgressSave > 4000 && !data.timeline.waiting_for_user) {
                    lastProgressSave = Date.now();
                    data.timeline.handler(e.current / e.duration * 100, e.current, e.duration);
                }
            });
        }
        function historySource(movie) {
            var entry = object(setting('source_history', {}))[movieKey(movie)];
            var preferred=setting('source','rezka');if(preferred==='animedia')preferred='rezka';
            return flag(setting('remember_source', true), true) && entry && entry.source!=='animedia' && entry.source || preferred;
        }
        function saveSource(movie, id) {
            if (flag(setting('remember_source', true), true)) save('source_history', rememberSource(setting('source_history', {}), movie, id));
        }

        // Native overflow panes also work on TV: focus explicitly scrolls each pane.
        // Each strip has its own viewport, so browsing episodes never moves the filters.
        function Screen(options) {
            var self = this, movie = options.movie || {}, key = movieKey(movie);
            var io = new Transport(Lampa, setting), metadataIo = new Transport(Lampa, setting), probeIo = new Transport(Lampa, setting);
            var providers = buildProviders(io), probeProviders = buildProviders(probeIo);
            var countIo=new Transport(Lampa,setting),countProviders=buildProviders(countIo),countRelease=null,countSource='',countRows={},countKnown={},countPending={},countActive=0,countEpoch=0;
            var healthIo=new Transport(Lampa,setting), healthProviders=buildProviders(healthIo), healthPending=[], healthActive=0, healthNodes={}, healthStarted=false;
            var source = providers.filter(function (p) { return p.id === historySource(movie); })[0] || providers.filter(function(p){return p.id===setting('source','rezka');})[0] || providers[0];
            var initialQuery = movie.title || movie.name || movie.original_title || movie.original_name || '';
            var resultsVisible=false;
            var query = initialQuery, release = null, resultSelected = null, voice = null, season = '', episodes = [], results = null;
            var openingEpisode=false,lastEpisodeKey = null, lastControl = '', returnFilter = '', lastResult=null, resultFilter='source';
            var nativeImage=$('.full-start__background.loaded').not('.lp-native-background').last(), nativeBackground=cardBackgroundSnapshot;cardBackgroundSnapshot=null;
            if (!nativeBackground && nativeImage.length && nativeImage[0].getBoundingClientRect().width>0) {
                var rect=nativeImage[0].getBoundingClientRect(), style=root.getComputedStyle(nativeImage[0]);
                nativeBackground=nativeImage.clone().removeAttr('id').removeClass('dim').addClass('lp-native-background');
                nativeBackground.css({position:'fixed',left:(rect.left/root.innerWidth*100)+'vw',top:(rect.top/root.innerHeight*100)+'vh',width:(rect.width/root.innerWidth*100)+'vw',height:(rect.height/root.innerHeight*100)+'vh',margin:0,transform:'none',transition:'none',zIndex:0});
            }
            var errorMessage = '', resizeTimer = null, migratedProgress = {},geometryStamp='';
            var vignette=$('<div class="lp-vignette" aria-hidden="true"><div class="lp-vignette-edge"></div><div class="lp-vignette-bottom"></div></div>');
            var busy = false, destroyed = false, last = null, generation = 0, reverse = false, pendingResume = null;
            var cache = {}, probeQueue = [], probing = 0, observed = null, metadata = { details: movie, seasons: {}, id: null, request: 0, signature: '' };
            var type = /^(tv|movie)$/.test(movie.media_type) ? movie.media_type : movie.name || movie.first_air_date ? 'tv' : 'movie';
            var html = $('<div class="lamplay lp-scroll"></div>'), backdrop = $('<div class="lp-backdrop"></div>');
            var loader=$('<div class="lp-loader" role="progressbar" aria-label="Загрузка"><i></i></div>');
            var top = $('<div class="lp-top"></div>');
            var panel = $('<div class="lp-panel"></div>'), side = $('<aside class="lp-side"></aside>');
            var hero = $('<div class="lp-hero"></div>'), main = $('<main class="lp-main"></main>');
            var filters = $('<div class="lp-filters"></div>'), tools = $('<div class="lamplay__controls lp-scroll lp-tools"></div>');
            var bodyPane = $('<div class="lp-scroll lp-body-pane"></div>'), body = $('<div class="lamplay__items"></div>');
            var status = $('<div class="lamplay__status" role="status"></div>');
            var statusText = $('<span></span>'), retryAction = null, lastBackground = '', lastBackgroundSharp = false;
            status.append(statusText);side.append(hero);main.append(filters,bodyPane.append(body));panel.append(side,main);
            html.append(backdrop,status,panel);
            function inActivity() { var a = Lampa.Activity.active(); return !destroyed && a && a.activity === self.activity; }
            function listLayout(){return view()==='vertical' || !series() && view()==='card';}
            function chooseSeason(value){if(String(value)===String(season))return;season=String(value);loadEpisodes();}
            function chooseVoice(value){if(voice && String(value.id)===String(voice.id))return;voice=value;loadEpisodes();}
            function savedResume() { return object(setting('resume', {}))[key]; }
            function series() { return release && typeof release.series === 'boolean' ? release.series : type === 'tv'; }
            function view() { var v = setting(series() ? 'view_series' : 'view_movie', series() ? 'horizontal' : 'vertical'); return ['horizontal','vertical','card'].indexOf(v) < 0 || !series() && v === 'horizontal' ? 'vertical' : v; }
            function focusNode(node) {
                node = $(node);if(node.hasClass('lp-result'))lastResult=node[0];if(resultsVisible && node.attr('data-lp-control'))resultFilter=node.attr('data-lp-control');last = node[0];lastControl=node.attr('data-lp-control') || '';if(lastControl) returnFilter=lastControl;if (last && last._lpEpisodeKey) lastEpisodeKey=last._lpEpisodeKey;
                node.parents('.lp-scroll').each(function () { keepVisible(this,node[0]); });
                if (node[0] && node[0]._lpProbe) enqueueProbe(node[0]._lpProbe);
            }
            function interactive(node, action) {
                node.addClass('selector').attr('tabindex','0');
                node.on('hover:enter',action).on('hover:focus hover:hover hover:touch focus',function () { focusNode(node); });
                // Lampa maps pointer/touch to hover:enter; native focus is for accessibility.
                return node;
            }
            function control(label, action, target, selected) {
                var node = interactive($('<div class="lamplay__control"></div>').text(label),action);
                var split=label.indexOf(': ');if(split>0)node.empty().append($('<span class="lp-control-label"></span>').text(label.slice(0,split)+':'),$('<span class="lp-control-value"></span>').text(label.slice(split+2)));
                node.attr('data-lp-control',label.indexOf('Вид:')===0?'view':label.indexOf('Источник:')===0?'source':label);
                if (selected) node.addClass('lp-selected');
                (target || tools).append(node);return node;
            }
            function select(title,items,current,callback) {
                Lampa.Select.show({title:title,items:items.map(function (i) { return { title:i.title,value:i.value,selected:String(i.value)===String(current) }; }),
                    onSelect:function (i) { callback(i.value); },onBack:function () { self.start(); }});
            }
            function imageURL(path,size) {
                if (!path) return '';
                if (/^https?:\/\//.test(path)) return absolute(path);
                return Lampa.TMDB && Lampa.TMDB.image ? Lampa.TMDB.image('/t/p/' + (size || 'w780') + path) : '';
            }
            function setImage(img,url) {
                if (url) img.attr('src',url).on('error',function () {
                    if ($(this).hasClass('lp-title-logo')) $(this).replaceWith($('<div class="lp-name"></div>').text(metadata.details.title || metadata.details.name || initialQuery));
                    else { if ($(this).hasClass('lp-cover')) hero.removeClass('lp-has-cover');$(this).remove(); }
                });
                return img;
            }
            function detailFor(ep) { return (metadata.seasons[String(ep.season)] || []).filter(function (item) { return +item.episode_number === +ep.number; })[0] || {}; }
            function episodeName(ep) {
                var m=detailFor(ep), fallback=String(ep.title || '').replace(/^(?:Серия|Эпизод)\s*[\d.]+\s*[·:\-]?\s*/i,'').trim();
                if (/^[\d.]+(?:\s*(?:серия|эпизод))?$/i.test(fallback)) fallback='';
                return m.name || fallback || 'Серия '+ep.number;
            }
            function thumbnail(ep) { return imageURL(detailFor(ep).still_path,'w500') || absolute(ep.image || ep.thumbnail || ''); }
            function voiceOf(ep) { return ep.voice || voice || { id:'default',title:'' }; }
            function streamKey(ep) { return [source.id,release.id,voiceOf(ep).id,ep.season,ep.number].join('|'); }
            function stopProbes() {
                probeIo.clear();probeQueue=[];probing=0;
                if (observed) observed.disconnect();observed=null;
            }
            function changeGeneration() { generation++;stopProbes();io.clear(); }
            function setStatus(message,error) {
                errorMessage=error?message:'';
                if(error){stopProbes();status.detach();body.empty();bodyPane.append(status);}else{status.detach();html.append(status);}
                statusText.text(message || '');status.toggle(!!message);status.removeClass('lp-empty').toggleClass('lp-error',!!error).toggleClass('lp-busy',busy);
                status.find('.lp-retry').remove();
                if (error && retryAction) status.append(interactive($('<span class="lp-retry">Повторить попытку</span>'),function () { retryAction(); }));
            }
            function begin(message,retry) { changeGeneration();busy=true;html.addClass('lp-loading').attr('aria-busy','true');retryAction=retry;setStatus(message);if(!release)refreshControls();
                if(!body.children().length && !resultsVisible){for(var sk=0;sk<6;sk++)body.append('<div class="lamplay__item lp-episode lp-skeleton" aria-hidden="true"><div class="lp-picture"></div><div class="lp-episode-info"><div class="lp-skeleton-line"></div><div class="lp-skeleton-line"></div><div class="lp-skeleton-line"></div></div></div>');}fitEpisodeGeometry();self.start(); }
            function finish() { busy=false;html.removeClass('lp-loading').attr('aria-busy','false');setStatus(''); }
            function failed(e) { if (destroyed) return;busy=false;html.removeClass('lp-loading').attr('aria-busy','false');setStatus(safeError(e),true);refreshControls();var retry=status.find('.lp-retry');if(retry.length)last=retry[0];self.start(); }
            function cancel() { changeGeneration();busy=false;html.removeClass('lp-loading').attr('aria-busy','false');setStatus('Загрузка отменена. Измените поиск или источник.');refreshControls();self.start(); }
            function layout() {
                var v = resultsVisible ? 'results' : view();
                html.toggleClass('lp-columns',v==='vertical' || v==='results' || !series() && v==='card');html.attr('data-view',v).toggleClass('lp-series',!resultsVisible && series()).toggleClass('lp-film',!resultsVisible && !series());
                if (!resultsVisible && series() && (v === 'card' || v === 'horizontal')) {
                    side.detach();main.detach();filters.append(tools);top.append(hero,filters);panel.append(top,loader,bodyPane);
                } else {
                    top.detach();side.append(hero,tools);main.append(filters,loader,bodyPane);panel.append(side,main);
                }
                syncBackground(v);
                fitStrip();
            }
            var headerObserver=null;
            function syncHeader(){
                if(!inActivity())return;
                $('.head__title').each(function(){
                    if(this.textContent.trim()===NAME && !$(this).find('.lp-header-logo').length)$(this).prepend($(LOGO).addClass('lp-header-logo'));
                });
                if(!headerObserver && root.MutationObserver && $('.head')[0]){
                    headerObserver=new root.MutationObserver(syncHeader);
                    headerObserver.observe($('.head')[0],{childList:true,subtree:true});
                }
            }
            function syncBackground(v) {
                if (!inActivity()) return;
                syncHeader();
                $('body').addClass('lp-active').toggleClass('lp-card-background',v==='card');
                // Both the header and plugin share Lampa's single viewport background.
                // A native full-card image is reused outside the moving activity pane.
                var sharp=v==='card';
                if(sharp && !nativeBackground) {
                    var url=showcaseImage();
                    if(url) nativeBackground=setImage($('<img class="full-start__background loaded lp-native-background" alt="">'),url).css({position:'fixed',transition:'none',zIndex:0});
                }
                if(nativeBackground) {nativeBackground.off('load.lpVignette').on('load.lpVignette',function(){if(!destroyed)syncBackground(resultsVisible?'results':view());});if(!nativeBackground.parent().length){var colorBackground=$('.background').last();if(colorBackground.length)nativeBackground.insertAfter(colorBackground);else $('body').prepend(nativeBackground);}nativeBackground.css('display',sharp?'block':'none');}
                // Lampa supplies the image mask and the color background. Keep both visible.
                // An extra black overlay would expose straight image edges on bright scenes.
                vignette.detach();
                var backgroundCard=Object.assign({},movie,metadata.details);
                var bg=Lampa.Utils && Lampa.Utils.cardImgBackground ? Lampa.Utils.cardImgBackground(backgroundCard) : imageURL(backgroundCard.poster_path || backgroundCard.backdrop_path,'w200');
                if (bg && (bg!==lastBackground || sharp && !lastBackgroundSharp) && Lampa.Background && Lampa.Background.change) {
                    // Retain change as a fallback for native immediate-call throttling/older hosts.
                    // Showcase bypasses the one-second queue using Lampa's own public API.
                    Lampa.Background.change(bg);
                    if(sharp && typeof Lampa.Background.immediately==='function')Lampa.Background.immediately(bg);
                    lastBackground=bg;
                }
                lastBackgroundSharp=sharp;
            }
            function releaseBackground() {if(headerObserver){headerObserver.disconnect();headerObserver=null;}$('.lp-header-logo').remove();lastBackground='';lastBackgroundSharp=false;$('body').removeClass('lp-active lp-card-background');if(nativeBackground) nativeBackground.detach();vignette.detach(); }
            var geometryFrame=null,geometryRunning=false;
            function edgeFade(pane,horizontal){
                var pos=horizontal?pane.scrollLeft:pane.scrollTop,size=horizontal?pane.clientWidth:pane.clientHeight,total=horizontal?pane.scrollWidth:pane.scrollHeight;
                var before=pos>2,after=pos+size<total-2,fade=Math.min(72,Math.max(32,parseFloat(root.getComputedStyle(html[0]).fontSize)*2.8));
                var stops=before?['transparent 0px','rgba(0,0,0,.22) '+(fade*.3)+'px','rgba(0,0,0,.7) '+(fade*.7)+'px','#000 '+fade+'px']:['#000 0px'];
                stops=stops.concat(after?['#000 calc(100% - '+fade+'px)','rgba(0,0,0,.7) calc(100% - '+(fade*.7)+'px)','rgba(0,0,0,.22) calc(100% - '+(fade*.3)+'px)','transparent 100%']:['#000 100%']);
                var mask='linear-gradient(to '+(horizontal?'right':'bottom')+','+stops.join(',')+')';
                $(pane).css({'mask-image':mask,'-webkit-mask-image':mask}).attr({'data-lp-fade-before':String(before),'data-lp-fade-after':String(after)});
            }
            function fitEpisodeGeometry(){
                if(geometryRunning || !html[0].isConnected)return;geometryRunning=true;
                var v=resultsVisible?'results':view(),bounds=html[0].getBoundingClientRect();html.removeClass('lp-tight');hero.css('margin-bottom','');filters.children().css({position:'',top:'',zIndex:''});bodyPane.css('padding-bottom','');
                if(v==='results'){
                    html.css('height',Math.max(120,root.innerHeight-Math.max(0,bounds.top))+'px');
                    bodyPane.css({'margin-left':'',width:'','padding-left':'','padding-right':'','padding-bottom':root.getComputedStyle(body[0]).rowGap});
                    html.find('.lp-strip,.lp-tools').css({width:'','max-width':'','mask-image':'none','-webkit-mask-image':'none'}).off('scroll.lpEdges');
                    edgeFade(bodyPane[0],false);bodyPane.off('scroll.lpEdges').on('scroll.lpEdges',function(){edgeFade(this,false);});
                    geometryRunning=false;return;
                }
                html.css('height',Math.max(120,root.innerHeight-Math.max(0,bounds.top))+'px');
                body.find('.lp-episode').css('width','').find('.lp-picture').css('height','');
                var sideways=series() && (v==='horizontal' || v==='card');
                bodyPane.css({'margin-left':'',width:'','padding-left':'','padding-right':''});
                html.find('.lp-strip,.lp-tools').each(function(){
                    var row=$(this),across=row.hasClass('lp-strip') || !listLayout();
                    row.css({width:'','max-width':''});
                    if(across){var box=this.getBoundingClientRect();row.css({width:Math.max(0,(listLayout()?bodyPane[0].getBoundingClientRect().right-parseFloat(root.getComputedStyle(bodyPane[0]).paddingRight):bounds.right-parseFloat(root.getComputedStyle(panel[0]).paddingRight))-box.left)+'px','max-width':'none'});edgeFade(this,true);row.off('scroll.lpEdges').on('scroll.lpEdges',function(){edgeFade(this,true);});}
                    else row.css({'mask-image':'none','-webkit-mask-image':'none'}).off('scroll.lpEdges');
                });
                if(sideways){
                    var box=bodyPane[0].getBoundingClientRect(),style=root.getComputedStyle(bodyPane[0]),left=box.left-bounds.left,right=bounds.right-box.right;
                    bodyPane.css({'margin-left':-left+'px',width:bounds.width+'px','padding-left':Math.max(0,left)+'px','padding-right':Math.max(0,right)+'px'});
                }
                if(sideways){
                    // Reserve the existing text area; fit 16:9 previews to viewport height, independent of metadata text.
                    var paneStyle=root.getComputedStyle(bodyPane[0]),room=bodyPane[0].clientHeight-parseFloat(paneStyle.paddingTop)-parseFloat(paneStyle.paddingBottom);
                    var sample=body.find('.lp-episode').first(),picture=sample.find('.lp-picture'),info=sample.find('.lp-episode-info');
                    if(sample.length && picture.length && info.length){var es=root.getComputedStyle(sample[0]),reserved=info[0].getBoundingClientRect().height+parseFloat(es.paddingTop)+parseFloat(es.paddingBottom)+parseFloat(es.borderTopWidth)+parseFloat(es.borderBottomWidth),height=Math.min(picture[0].getBoundingClientRect().height,Math.max(48,room-reserved-1));
                        body.find('.lp-episode').css('width',(height*16/9)+'px').find('.lp-picture').css('height',height+'px');
                    }
                }
                // Keep the resume row clear of the first season caption without compacting filters.
                if(series() && v==='card'){
                    var resumeRow=hero.find('.lp-resume-row')[0],seasonCaption=filters.find('.lp-caption')[0];
                    if(resumeRow && seasonCaption){var resumeBox=resumeRow.getBoundingClientRect(),baseFont=parseFloat(root.getComputedStyle(html[0]).fontSize),resumeBottom=Math.max(resumeBox.bottom,resumeBox.top+baseFont*(.9*2.65)),clearance=resumeBottom+baseFont*.35-seasonCaption.getBoundingClientRect().top;if(clearance>0)hero.css('margin-bottom',Math.ceil(clearance)+'px');}
                }
                if(!series())bodyPane.css('padding-bottom',root.getComputedStyle(body[0]).rowGap);
                html.find('.lp-strip,.lp-tools').each(function(){if($(this).hasClass('lp-strip') || !listLayout())edgeFade(this,true);});
                if(release && !errorMessage){edgeFade(bodyPane[0],sideways);bodyPane.off('scroll.lpEdges').on('scroll.lpEdges',function(){edgeFade(this,sideways);});}
                else bodyPane.css({'mask-image':'none','-webkit-mask-image':'none'}).off('scroll.lpEdges');
                geometryRunning=false;
            }
            function fitStrip() {top.css('min-height','');if(geometryFrame){if(root.cancelAnimationFrame)root.cancelAnimationFrame(geometryFrame);else clearTimeout(geometryFrame);}var refresh=function(){geometryFrame=null;if(destroyed)return;fitEpisodeGeometry();html.find('.lp-control-value').each(function(){$(this).toggleClass('lp-clipped',this.scrollWidth>this.clientWidth+1);});};geometryFrame=root.requestAnimationFrame?root.requestAnimationFrame(refresh):setTimeout(refresh,0);}
            function resized(){clearTimeout(resizeTimer);resizeTimer=setTimeout(function(){if(!destroyed){layout();fitEpisodeGeometry();if(last && html[0].contains(last))focusNode(last);}},100);}
            $(root).on('resize.lamplay',resized);
            function controlTarget(id) { return filters.add(tools).find('[data-lp-control]').filter(function () {return $(this).attr('data-lp-control')===id;}).first(); }
            function searchMenu() {
                var options = searchNames(movie).map(function (q) {return {title:q,value:q};});
                options.unshift({title:'Указать название',value:'__input'});
                select('Название для поиска',options,query,function (value) {
                    if (value === '__input') {
                        Lampa.Input.edit({title:'Название для поиска',value:query,free:true,nosave:true},function (v) {
                            v=String(v||'').trim();if (v) {query=v;search();} else self.start();
                        });
                    } else {query=value;search();}
                });
            }
            function paintHealth(id) {
                var state=sourceHealth[id],nodes=healthNodes[id] || [];
                nodes.forEach(function(node){node.attr('data-state',state && state.state || 'pending').attr('title',state && state.message || 'Проверка подключения');});
            }
            function checkSources() {
                if(healthStarted)return;healthStarted=true;
                healthProviders.forEach(function(p){var cached=sourceHealth[p.id];if(!cached || Date.now()-cached.time>180000)healthPending.push(p);});
                function pump(){
                    if(destroyed)return;
                    while(healthActive<2 && healthPending.length){(function(p){
                        if(p.id==='cdnvideohub' && !(movie.kinopoisk_id || movie.kinopoiskId || movie.kp_id || movie.source==='kinopoisk')){sourceHealth[p.id]={state:'unknown',time:Date.now(),message:'Для проверки нужен ID Кинопоиска'};paintHealth(p.id);return;}
                        healthActive++;var ended=false;
                        function finish(error){if(ended || destroyed)return;ended=true;healthActive--;sourceHealth[p.id]={state:error?'error':'ok',time:Date.now(),message:error?safeError(error):'Источник ответил корректно. Наличие конкретного видео не проверялось.'};paintHealth(p.id);pump();}
                        try{if(p.check)p.check(function(){finish();},finish);else p.search(initialQuery,movie,function(){finish();},finish);}catch(e){finish(e);}
                    })(healthPending.shift());}
                }
                pump();
            }
            function drawSourceHealth(item,data){var dot=$('<span class="lp-source-dot" aria-hidden="true"></span>');item.find('.selectbox-item__title').append(dot);(healthNodes[data.value] || (healthNodes[data.value]=[])).push(dot);paintHealth(data.value);}
            function sourceMenu(back){
                healthNodes={};checkSources();
                Lampa.Select.show({title:'Источник',items:providers.map(function(p){return{title:p.title,value:p.id,selected:p.id===source.id};}),
                    onDraw:drawSourceHealth,
                    onSelect:function(i){healthNodes={};source=providers.filter(function(p){return p.id===i.value;})[0];saveSource(movie,i.value);pendingResume=null;search();},
                    onBack:function(){healthNodes={};if(typeof back==='function')back();else self.start();}});
            }
            function countFor(id,s){var rows=countRows[String(id)];if(!rows || !countKnown[String(id)+'|'+String(s)])return null;var seen={};rows.forEach(function(ep){if(String(ep.season)===String(s) && !ep.loadSeason && !ep.unavailable && ep.number!=='' && ep.number!=null)seen[String(ep.number)]=true;});return Object.keys(seen).length;}
            function decorateCount(node,n){node.addClass('lp-count-control').wrapInner('<span class="lp-count-name"></span>').append($('<span class="lp-count"></span>').text(n===null?'':episodeCountLabel(n)));return node;}
            function updateCounts(){
                if(!release || !series())return;
                filters.find('[data-count-voice]').each(function(){var n=countFor($(this).attr('data-count-voice'),season);$(this).find('.lp-count').text(n===null?'':episodeCountLabel(n));});
                filters.find('[data-count-season]').each(function(){var s=$(this).attr('data-count-season'),values=release.voices.map(function(v){return countFor(v.id,s);}).filter(function(n){return n!==null;});$(this).find('.lp-count').text(values.length?episodeCountLabel(Math.max.apply(null,values)):'');});fitStrip();
            }
            function collectCounts(){
                if(!release || !series())return;
                if(countRelease!==release || countSource!==source.id){countIo.clear();countEpoch++;countActive=0;countRelease=release;countSource=source.id;countRows={};countKnown={};countPending={};}
                var epoch=countEpoch,r=release,provider=countProviders.filter(function(p){return p.id===source.id;})[0],all=seasonList(),partial=!!(source.id==='kodik' && release.widget);
                function remember(v,selected,rows){
                    var id=String(v.id),old=countRows[id] || [],real=rows.filter(function(ep){return !ep.loadSeason;}),covered=partial?[String(selected)]:all.map(String);
                    real.forEach(function(ep){var s=String(ep.season);if(covered.indexOf(s)<0)covered.push(s);});
                    countRows[id]=old.filter(function(ep){return covered.indexOf(String(ep.season))<0;}).concat(real);
                    covered.forEach(function(s){countKnown[id+'|'+s]=true;countPending[id+'|'+s]=true;});
                }
                if(voice)remember(voice,season,episodes);
                function pump(){if(destroyed || epoch!==countEpoch || release!==r)return;
                    r.voices.forEach(function(v){all.forEach(function(selected){var key=String(v.id)+'|'+selected;if(countActive>=2 || countPending[key])return;countPending[key]=true;countActive++;
                        function end(rows){if(destroyed || epoch!==countEpoch || release!==r)return;countActive--;if(rows)remember(v,selected,rows);updateCounts();pump();}
                        provider.episodes(r,v,function(rows){end(rows);},function(){end(null);},selected);
                    });});
                }pump();updateCounts();
            }
            function refreshControls() {
                var restoreControl=lastControl;tools.empty();filters.empty();
                if (release && series()) {
                    var seasons = seasonList();
                    var seasonStrip = $('<div class="lp-strip-group"><div class="lp-caption">Сезоны</div><div class="lp-scroll lp-strip"></div></div>');
                    seasons.forEach(function (s) {decorateCount(control('Сезон '+s,function () {chooseSeason(s);},seasonStrip.find('.lp-strip'),String(s)===String(season)),null).attr('data-count-season',s);});
                    var voicesStrip = $('<div class="lp-strip-group"><div class="lp-caption">Перевод</div><div class="lp-scroll lp-strip"></div></div>');
                    release.voices.forEach(function (v) {decorateCount(control(v.title,function () {chooseVoice(v);},voicesStrip.find('.lp-strip'),String(v.id)===String(voice.id)),null).attr('data-count-voice',v.id);});
                    filters.append(seasonStrip,voicesStrip);
                } else if (busy && !resultsVisible && series()) {
                    ['Сезоны','Перевод'].forEach(function(label){filters.append($('<div class="lp-strip-group lp-loading-group"><div class="lp-caption"></div><div class="lp-strip"><div class="lamplay__control">Загрузка</div></div></div>').find('.lp-caption').text(label).end());});
                }
                control('Источник: '+source.title,sourceMenu);
                if (release && series()) control('Порядок: '+(reverse?'Обратный':'Стандартный'),function () {reverse=!reverse;renderEpisodes();});
                control('Вид: '+({horizontal:'Лента',vertical:'Список',card:'Витрина'}[view()]),function () {
                    var names=series()?['horizontal','vertical','card']:['vertical','card'];
                    var next=names[(names.indexOf(view())+1)%names.length];
                    save(series()?'view_series':'view_movie',next);lastControl='view';if(errorMessage){refreshControls();renderHero();self.start();}else if(release)renderEpisodes(lastEpisodeKey);else{refreshControls();renderHero();self.start();}
                });
                control('Сбросить фильтр',function () {query=initialQuery;pendingResume=null;search();});
                control(query,searchMenu).empty().text(query).wrapInner('<span class="lp-control-value"></span>').attr({'aria-label':'Поиск: '+query,'data-lp-control':'search'}).addClass('lp-search').prepend('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg>');
                if (release) control('К результатам',backToResults);
                if (busy) control('Отменить',cancel);
                layout();updateCounts();if(restoreControl) {var restored=controlTarget(restoreControl);if(restored.length) last=restored[0];}
            }
            function search() {
                release=null;resultSelected=null;voice=null;episodes=[];results=null;body.empty();
                if (!query) return failed(new Error('Укажите название для поиска.'));
                begin('Ищем «'+query+'»…',search);
                function found(items) {
                    if (destroyed) return;results=items;finish();
                    var resume=savedResume(), best;
                    if (flag(setting('remember_source',true),true) && resume && resume.source===source.id && query===initialQuery) {
                        best=items.filter(function (r) {return String(r.id)===String(resume.result.id);})[0];
                    }
                    best=best || exactResult(items,movie,query);
                    if (best) openRelease(best);else showResults();
                }
                source.search(query,movie,function (items) {
                    var original=movie.original_title || movie.original_name || '';
                    if(items.length)return found(items);
                    var searchTicket=generation;
                    function aliases(){
                        if(destroyed || searchTicket!==generation)return;
                        if(source.id!=='kodik' || query!==initialQuery || !movie.id || !Lampa.TMDB || !Lampa.TMDB.api)return found([]);
                        metadataRequest(type+'/'+movie.id+'/alternative_titles',function(data){
                            if(destroyed || searchTicket!==generation)return;
                            var names=list(data.results || data.titles).map(function(t){return t.title;}).filter(function(t){return t && /[a-z]/i.test(t) && normal(t)!==normal(original) && normal(t)!==normal(query);});
                            names=names.filter(function(n,i){return names.indexOf(n)===i;}).slice(0,8);
                            function next(){if(destroyed || searchTicket!==generation)return;if(!names.length)return found([]);source.search(names.shift(),movie,function(rows){if(rows.length){rows.forEach(function(r){if(r.widget)r.title=query;});found(rows);}else next();},failed);}next();
                        },function(){found([]);});
                    }
                    if(query===initialQuery && original && normal(original)!==normal(query))source.search(original,movie,function(rows){if(rows.length)found(rows);else aliases();},failed);else aliases();
                },failed);
            }
            var resultOriginalQueue=[],originalRunning=0;
            function pumpOriginals(){if(destroyed||!resultsVisible)return;while(originalRunning<3 && resultOriginalQueue.length){originalRunning++;resultOriginalQueue.shift()(function(){originalRunning--;pumpOriginals();});}}
            function showResults() {resultOriginalQueue=[];originalRunning=0;
                resultsVisible=!!(results && results.length);body.empty();refreshControls();renderHero();
                setStatus('');if(!results || !results.length){status.detach().appendTo(bodyPane).addClass('lp-error lp-empty').removeClass('lp-busy').show();statusText.text('Ничего не найдено. Измените запрос или источник.');}
                (results||[]).forEach(function (r) {
                    var node=interactive($('<div class="lamplay__item lp-result"></div>'),function () {openRelease(r);});
                    var info=$('<div class="lp-result-info"></div>').append($('<div class="lamplay__item-title"></div>').text(r.title));
                    var originalLine=$('<div class="lamplay__item-detail lp-original-title"></div>').text(r.original && r.original!==r.title?r.original:'');info.append(originalLine);
                    if(!r.original && source.resultOriginal){var sourceAtRequest=source;resultOriginalQueue.push(function(next){sourceAtRequest.resultOriginal(r,function(name){if(!destroyed && source===sourceAtRequest && resultsVisible){r.original=name;originalLine.text(name && name!==r.title?name:'');}next();},next);});}
                    var kind=typeof r.series==='boolean'?(r.series?'Сериал':'Фильм'):r.type==='tv'?'Сериал':r.type==='movie'?'Фильм':'';
                    info.append($('<div class="lamplay__item-detail"></div>').text([r.year,kind].filter(Boolean).join(' · ')));
                    node.append('<svg class="lp-folder" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M3 7h10l3 3h13v17H3Z"/><path opacity=".5" d="M5 4h9l3 3h10v3H5Z"/></svg>',info);
                    body.append(node);
                });
                last=body.find('.selector')[0] || tools.find('.selector')[0];pumpOriginals();self.start();
            }
            function backToResults() {changeGeneration();busy=false;pendingResume=null;release=null;voice=null;episodes=[];showResults();}
            function openRelease(result) {
                openingEpisode=true;resultsVisible=false;
                if (source.id==='rezka' && result.url) {
                    result=Object.assign({},result);var old=new root.URL(result.url);result.url=hostSetting(setting('rezka_host',''),'https://rezka.ag')+old.pathname+old.search;
                }
                body.empty();begin('Загружаем переводы и серии…',function () {openRelease(result);});resultSelected=result;
                source.open(result,function (r) {
                    release=r;voice=r.voices[0];season='';loadMetadata(result);
                    var saved=pendingResume || savedResume();
                    if (saved && saved.source===source.id && String(saved.result.id)===String(result.id)) {
                        voice=r.voices.filter(function (v) {return String(v.id)===String(saved.voice.id);})[0] || voice;
                        season=String(saved.season || '');
                    }
                    if (!voice) return failed(new Error('Нет доступных переводов.'));
                    loadEpisodes();
                },failed);
            }
            function seasonList() {
                var values=[];episodes.forEach(function (ep) {var s=String(ep.season||'');if (s && values.indexOf(s)<0) values.push(s);});
                if(series() && !splitRelease())list(metadata.details.seasons).forEach(function(s){if(+s.season_number>0 && +s.episode_count>0 && values.indexOf(String(s.season_number))<0)values.push(String(s.season_number));});
                return values.sort(numSort);
            }
            function loadEpisodes() {
                body.empty();begin('Получаем список…',loadEpisodes);
                if (!series()) {
                    var jobs=release.voices.slice(), count=0, items=[], ticket=generation, errors=[], finished=false;
                    function next() {
                        if (destroyed || ticket!==generation || finished) return;
                        while (count<2 && jobs.length) {
                            count++;(function (v) {
                                source.episodes(release,v,function (rows) {rows.forEach(function (ep) {ep.voice=v;items.push(ep);});complete();},function (err) {errors.push(safeError(err));complete();});
                            })(jobs.shift());
                        }
                        if (!finished && !count && !jobs.length) {
                            finished=true;episodes=items.sort(function (a,b) {return release.voices.indexOf(a.voice)-release.voices.indexOf(b.voice);});
                            finish();if (!items.length) return failed(new Error(errors[0] || 'Не удалось получить озвучки.'));
                            renderEpisodes();resumeWhenReady();
                        }
                    }
                    function complete() {count--;next();}next();return;
                }
                source.episodes(release,voice,function (items) {
                    episodes=items;
                    var seasons=seasonList();if (seasons.indexOf(season)<0) season=seasons[0] || '';
                    finish();renderEpisodes();collectCounts();loadSeasonMetadata(season);resumeWhenReady();
                },failed,season);
            }
            function visibleEpisodes() {var items=episodes.filter(function (ep) {return !series() || !season || String(ep.season)===season;});if(series() && !splitPart())items=mergeEpisodes(items,metadata.seasons[String(season)],season,voice);return reverse?items.slice().reverse():items;}
            function progress(ep) {
                var base='wf_online|'+(movie.source||'tmdb')+':'+(movie.id||movie.original_title||movie.title||release.title)+'|'+source.id+'|'+release.id+'|'+ep.season+'|'+ep.number;
                var hash=episodeHash(movie,ep.season,ep.number,series(),Lampa.Utils.hash);
                var timelineCard=series()?Object.assign({},movie,{original_name:movie.original_name || movie.original_title || movie.name || movie.title}):movie;
                var meta=Lampa.Timeline && Lampa.Timeline.link?Lampa.Timeline.link(timelineCard,series()?+ep.season:undefined,series()?+ep.number:undefined):undefined;
                var view=Lampa.Timeline?Lampa.Timeline.view(hash,meta):{hash:hash,time:0,duration:0,percent:0};
                var resume = savedResume();
                if (!view.time && !view.percent && Lampa.Timeline && !migratedProgress[hash]) {
                    var candidates=[Lampa.Timeline.view(Lampa.Utils.hash(base))];
                    list(release.voices).forEach(function(v){candidates.push(Lampa.Timeline.view(Lampa.Utils.hash(base+'|voice='+v.id)));});
                    if(resume && String(resume.season)===String(ep.season) && String(resume.number)===String(ep.number))candidates.push(resume);
                    candidates.sort(function(a,b){return (+b.updated||0)-(+a.updated||0) || (+b.time||0)-(+a.time||0);});
                    var previous=candidates.filter(function(p){return +p.time>0 || +p.percent>0;})[0];
                    if(previous){['time','duration','percent'].forEach(function(k){view[k]=+previous[k]||0;});if(view.handler)view.handler(view.percent,view.time,view.duration);}
                }
                migratedProgress[hash]=true;
                var registry=object(setting('episode_registry',{})),known=object(registry[key]);
                if(!known[hash]){known[hash]={season:ep.season,number:ep.number};registry[key]=known;save('episode_registry',registry);}
                return view;
            }
            function started(ep){return object(setting('started',{}))[episodeHash(movie,ep.season,ep.number,series(),Lampa.Utils.hash)];}
            function isStarted(ep,p){var mark=started(ep);return mark===false?false:!!mark || +p.time>0 || +p.percent>0;}
            function setMark(ep,value){var marks=object(setting('started',{}));marks[episodeHash(movie,ep.season,ep.number,series(),Lampa.Utils.hash)]=value?Date.now():false;save('started',marks);}
            function resetTime(ep){var p=progress(ep);if(p.handler)p.handler(0,0,0);migratedProgress[p.hash]=true;var resumes=object(setting('resume',{})),r=resumes[key];if(r && String(r.season)===String(ep.season) && String(r.number)===String(ep.number)){r.time=0;r.duration=0;r.percent=0;save('resume',resumes);}}
            function workEpisodes(){
                var found={},out=[],registry=object(object(setting('episode_registry',{}))[key]);
                function add(ep){var hash=episodeHash(movie,ep.season,ep.number,series(),Lampa.Utils.hash);if(!found[hash]){found[hash]=true;out.push(ep);}}
                Object.keys(registry).forEach(function(h){add(registry[h]);});episodes.forEach(add);list(release.rows).forEach(add);list(release.episodes).forEach(add);
                list(metadata.details.seasons).forEach(function(season){var n=Math.min(10000,+season.episode_count || 0);for(var i=1;i<=n;i++)add({season:String(season.season_number),number:String(i)});});
                Object.keys(metadata.seasons).forEach(function(season){list(metadata.seasons[season]).forEach(function(ep){add({season:String(ep.season_number || season),number:String(ep.episode_number)});});});
                if(Lampa.Timeline && Lampa.Timeline.filename && Lampa.Timeline.link){var card=Object.assign({},movie);if(series())card.original_name=card.original_name || card.original_title || card.name || card.title;
                    var current=Lampa.Timeline.link(card,1,1),stored=object(Lampa.Storage.get(Lampa.Timeline.filename(),{}));
                    Object.keys(stored).forEach(function(hash){var t=stored[hash];if(current && t && t.card===current.card){if(series())add({season:String(t.season),number:String(t.episode)});else add({season:'',number:''});}});
                }return out;
            }
            function episodeActions(ep){
                if(busy)return;
                var restore=streamKey(ep),items=[{title:'Воспроизведение',separator:true}];
                function add(title,id){items.push({title:title,value:id});}
                if(Lampa.Platform && Lampa.Platform.is('webos'))add('Запустить плеер - WebOS','webos');
                add('Запустить плеер - Lampa','lampa');items.push({title:'Выбранное',separator:true});
                add('Пометить','mark');add('Снять отметку','unmark');add('Сбросить тайм-код','reset');add('Копировать ссылку на видео','copy');items.push({title:'Общие',separator:true});
                if(series() && Lampa.Api && typeof Lampa.Api.subscribeToTranslation==='function')add('Подписаться на озвучку','subscribe');
                add('Очистить все метки','clear_marks');add('Очистить все тайм-коды','clear_times');
                function back(){self.start();}
                function refresh(){renderEpisodes(restore);}
                function clear(id){workEpisodes().forEach(function(e){if(id==='clear_marks')setMark(e,false);else resetTime(e);});refresh();}
                Lampa.Select.show({title:'Действие',items:items,onBack:back,onSelect:function(item){
                    if(item.separator)return;
                    if(item.value==='webos' || item.value==='lampa'){back();play(ep,false,item.value);return;}
                    if(item.value==='mark' || item.value==='unmark'){setMark(ep,item.value==='mark');refresh();return;}
                    if(item.value==='reset'){resetTime(ep);refresh();return;}
                    if(item.value==='clear_marks' || item.value==='clear_times')return Lampa.Select.show({title:item.title+' - только это произведение?',items:[{title:'Отмена',value:'cancel'},{title:'Очистить',value:'confirm'}],onBack:back,onSelect:function(answer){if(answer.value==='confirm')clear(item.value);else back();}});
                    if(item.value==='subscribe'){back();Lampa.Api.subscribeToTranslation({card:movie,voice:voiceOf(ep).title,season:+ep.season,episode:+ep.number},function(){Lampa.Noty.show('Подписка на озвучку оформлена.');},function(){Lampa.Noty.show('Не удалось оформить подписку. Проверьте вход в аккаунт CUB и доступность уведомлений.');});return;}
                    if(item.value==='copy'){begin('Получаем ссылку…');var target=cell(ep);resolveCell(target,function(){finish();if(Lampa.Utils.copyTextToClipboard)Lampa.Utils.copyTextToClipboard(target.url,function(){Lampa.Noty.show('Ссылка на видео скопирована.');back();},function(){Lampa.Noty.show('Не удалось скопировать ссылку в этом браузере.');back();});else{Lampa.Noty.show('Копирование недоступно в этой версии Lampa.');back();}},failed,false);}
                }});
            }
            function markStarted(ep){if(ep.unavailable)return;var items=object(setting('started',{})),hash=episodeHash(movie,ep.season,ep.number,series(),Lampa.Utils.hash);items[hash]=Date.now();var keys=Object.keys(items).sort(function(a,b){return items[b]-items[a];});keys.slice(2000).forEach(function(k){delete items[k];});save('started',items);}
            function snapshot(ep,view) {
                var r=resultSelected, storedResult={};
                ['id','title','original','url','year','widget','translation'].forEach(function (k) {if (r[k]!==undefined) storedResult[k]=r[k];});
                if (r.rows && r.rows.length) storedResult.rows=[r.rows[0]];
                return {source:source.id,sourceTitle:source.title,result:storedResult,voice:{id:voiceOf(ep).id,title:voiceOf(ep).title},
                    season:ep.season,number:ep.number,episodeTitle:series()?episodeName(ep):'',thumbnail:series()?thumbnail(ep):'',
                    time:+view.time||0,duration:+view.duration||0,percent:+view.percent||0,hash:view.hash,series:series(),updated:Date.now()};
            }
            function record(snapshot) {saveResume(key,snapshot);}
            function showcaseImage() {
                return nativeBackground && nativeBackground.attr('src') || imageURL(movie.backdrop_path,'w1280') || absolute(movie.background_image || '') || imageURL(metadata.details.backdrop_path,'w1280') || '';
            }
            function renderHero() {
                var onContinue=last && $(last).hasClass('lp-continue');
                hero.empty();var d=metadata.details, resume=savedResume();
                var image=imageURL(d.backdrop_path || d.poster_path,'w780') || release && release.image || '';
                if(!resultsVisible && (view()==='vertical' || series() && view()==='horizontal'))image=showcaseImage() || image;
                hero.removeClass('lp-has-cover');
                if (image && (resultsVisible || view()!=='card')) hero.append(setImage($('<img class="lp-cover" alt="">').on('load',function () {hero.addClass('lp-has-cover');}),image));
                var content=$('<div class="lp-hero-content"></div>'), title=$('<div class="lp-title-slot"></div>');
                if (metadata.logo) title.append(setImage($('<img class="lp-title-logo" alt="">').attr('alt',initialQuery),metadata.logo));
                else title.append($('<div class="lp-name"></div>').text(d.title||d.name||initialQuery));
                content.append(title);
                var row=$('<div class="lp-resume-row"></div>'), info=$('<div class="lp-resume-info"></div>');
                if (resume || episodes.length) {
                    var ep=episodes.filter(function(e){return !e.loadSeason && !e.unavailable;})[0];
                    var label=(resume?'Продолжить':'Смотреть')+((resume?resume.series:series())?' · S'+(resume?resume.season:ep.season)+' E'+(resume?resume.number:ep.number):'');
                    row.append(interactive($('<div class="lp-continue"></div>').append(PLAY,$('<span></span>').text(label)),resume?resumePlay:function(){play(ep);}));
                    if (resume) {
                        info.append($('<div class="lp-resume-title"></div>').text(resume.episodeTitle || ''));
                        info.append($('<div class="lp-resume-detail"></div>').text([resume.sourceTitle,resume.voice.title].filter(function(v,i,a){return v && a.indexOf(v)===i;}).join(' · ')));

                    } else info.append($('<div class="lp-resume-detail"></div>').text([source.title,voice && voice.title].filter(function(v,i,a){return v && a.indexOf(v)===i;}).join(' · ')));
                } else info.append($('<div class="lp-resume-detail"></div>').text('Выберите '+(!series()?'озвучку':'серию')+' для просмотра'));
                row.append(info);
                if(!resultsVisible && !series() && row.find('.lp-continue').length){
                    var action=row.find('.lp-continue'),label=action.attr('aria-label') || action.text();
                    action.find('span').remove();action.attr('aria-label',label);
                    action.append(info);row.empty().append(action);
                    content.append(row);
                }else content.append(row);
                hero.append(content);
                if(onContinue) last=hero.find('.lp-continue')[0];
            }
            function resumePlay() {
                var saved=savedResume();if (!saved || busy) return;
                var savedProvider=providers.filter(function(p){return p.id===saved.source;})[0];
                if(!savedProvider){pendingResume=null;Lampa.Noty.show('Сохранённый источник отключён. Выполняется поиск в '+source.title+'.');search();return;}
                pendingResume=saved;source=savedProvider;
                saveSource(movie,source.id);openRelease(saved.result);
            }
            function resumeWhenReady() {
                if (!pendingResume) return;
                var saved=pendingResume;
                var ep=episodes.filter(function (e) {return !e.loadSeason && String(e.season)===String(saved.season) && String(e.number)===String(saved.number) && String(voiceOf(e).id)===String(saved.voice.id);})[0];
                pendingResume=null;
                if (!ep) return failed(new Error('Последняя серия или озвучка сейчас недоступна. Выберите другой вариант.'));
                play(ep,true);
            }
            function renderEpisodes(restore) {
                if (!release || destroyed) return;var restoreControl=openingEpisode?'':lastControl;
                if(openingEpisode){var saved=savedResume();if(saved && saved.source===source.id && resultSelected && String(saved.result.id)===String(resultSelected.id)){var ep=visibleEpisodes().filter(function(e){return String(e.season)===String(saved.season)&&String(e.number)===String(saved.number)&&String(voiceOf(e).id)===String(saved.voice.id);})[0];if(ep)restore=streamKey(ep);}}
                stopProbes();geometryStamp='';body.empty();refreshControls();renderHero();setStatus('');
                var ticket=generation;
                visibleEpisodes().forEach(function (ep) {
                    if (ep.loadSeason) {body.append(interactive($('<div class="lamplay__item"></div>').text(ep.title),loadEpisodes));return;}
                    var v=voiceOf(ep), m=series()?detailFor(ep):metadata.details, p=progress(ep);
                    var node=interactive($('<div class="lamplay__item lp-episode"></div>'),function () {play(ep);});
                    node[0]._lpEpisodeKey=streamKey(ep);
                    node.on('hover:long',function(){episodeActions(ep);});
                    var picture=$('<div class="lp-picture"></div>');node.toggleClass('lp-started',isStarted(ep,p));picture.append($('<span class="lp-focus-play"></span>').append(PLAY));
                    var img=series()?thumbnail(ep):'';
                    if (img) picture.append(setImage($('<img alt="" loading="lazy">'),img));
                    if (series()) picture.append($('<span class="lp-episode-number"></span>').text('S'+ep.season+':E'+ep.number));
                    var badge=$('<span class="lp-quality"></span>');picture.append(badge);
                    var duration=+p.duration || +m.runtime*60 || +ep.duration || 0;
                    picture.append($('<span class="lp-runtime"></span>').text(+p.time>0?clock(p.time)+' / '+clock(duration):duration?movieDuration(duration):''));
                    if(+p.time>0) picture.append($('<span class="lp-percent"></span>').text(Math.round(+p.percent || p.time/duration*100)+'%'));
                    var line=$('<div class="lp-progress"><i></i></div>');line.find('i').css('width',Math.max(0,Math.min(100,+p.percent||0))+'%');picture.append(line);
                    var info=$('<div class="lp-episode-info"></div>');
                    info.append($('<div class="lamplay__item-title"></div>').text(series()?episodeName(ep):v.title));
                    if(listLayout()) {
                        info.prepend($('<span class="lp-row-duration"></span>').text(duration?movieDuration(duration):''));
                        info.append(line.clone());
                        info.append($('<div class="lp-watched"></div>').text(p.time?progressText(Object.assign({},p,{duration:duration}),false):' '));
                    }
                    var details=[];if (series() && +m.vote_average>0) details.push('★ '+Number(m.vote_average).toFixed(1));
                    if (m.air_date || m.release_date) details.push(formatDate(m.air_date || m.release_date));
                    var meta=$('<div class="lamplay__item-detail lp-episode-meta"></div>').append($('<span></span>').text(series()?(+m.vote_average>0?'★ '+Number(m.vote_average).toFixed(1):''):details[0] || ''));
                    var qualityMeta=$('<span class="lp-quality-meta"></span>');meta.append(qualityMeta,$('<span class="lp-air-date"></span>').text(series()?formatDate(m.air_date || m.release_date):details.slice(1).join(' · ')));
                    node.toggleClass('lp-no-episode-meta',series() && !m.air_date && !(+m.vote_average>0));
                    if(listLayout()) {if(meta.children().first().text() && meta.find('.lp-air-date').text())meta.children().first().after('<span class="lp-meta-separator">•</span>');info.append(meta);}else info.prepend(meta);
                    var desc=series()?(m.overview || ep.description):m.tagline;
                    if (series() || desc) info.append($('<div class="lp-description"></div>').text(desc || ''));
                    if(!series()){
                        var date=formatDate(m.release_date),tag=m.tagline || '';
                        info.find('.lp-episode-meta,.lp-description').remove();
                        info.append($('<div class="lp-film-footer"></div>').append($('<div class="lp-film-caption"></div>').text([date,tag].filter(Boolean).join(' · ')),$('<div class="lp-stream-info"></div>')));
                        picture.hide();
                    }
                    node.append(picture,info);body.append(node);
                    if(ep.unavailable){
                        var futureNotice=availability(m.air_date),notice=futureNotice || 'Недоступна в данной озвучке';if(futureNotice){info.find('.lp-row-duration').remove();meta.children().first().empty();meta.find('.lp-meta-separator').remove();}
                        node.addClass('lp-unavailable').attr({'aria-disabled':'true','data-lp-availability':notice});
                        picture.find('.lp-episode-number,.lp-focus-play,.lp-runtime,.lp-percent,.lp-quality').remove();picture.find('.lp-progress i').css('width','0%');
                        picture.append($('<span class="lp-unavailable-number"></span>').text(('0'+ep.number).slice(-Math.max(2,String(ep.number).length))));
                        info.find('.lp-watched,.lp-quality-meta,.lp-description').remove();info.find('.lp-progress i').css('width','0%');info.find('.lamplay__item-title').text(m.name || 'Эпизод '+ep.number);
                        var availabilityNode=$('<div class="lp-availability"></div>').text(notice);
                        if(listLayout())meta.append(availabilityNode);else {
                            var heading=$('<div class="lp-unavailable-heading"></div>');
                            heading.append(info.find('.lamplay__item-title'),meta.find('.lp-air-date'));meta.remove();info.prepend(heading);info.append(availabilityNode);
                        }
                        return;
                    }
                    var task={ep:ep,node:node,badge:badge,qualityMeta:qualityMeta,ticket:ticket,source:source.id,key:streamKey(ep),release:release};node[0]._lpProbe=task;
                    var hit=cache[task.key];if (hit && Date.now()-hit.time<60000) showQuality(task,hit.streams);
                });
                if (root.IntersectionObserver) {
                    observed=new root.IntersectionObserver(function (entries) {entries.forEach(function (entry) {if (entry.isIntersecting && entry.target._lpProbe) enqueueProbe(entry.target._lpProbe);});},{root:bodyPane[0],rootMargin:'0px'});
                    body.find('.lp-episode').each(function () {observed.observe(this);});
                }
                last=restore?body.find('.lp-episode').filter(function () {return this._lpEpisodeKey===restore;})[0]:null;
                last=restoreControl && controlTarget(restoreControl)[0] || last || body.find('.selector')[0] || tools.find('.selector')[0];openingEpisode=false;fitEpisodeGeometry();self.start();fitStrip();
            }
            function showQuality(task,streams) {
                if (!task.node[0].isConnected || task.ticket!==generation) return;
                var q=maxQuality(streams.quality);
                if(!series()){
                    var langs=[],range='',audio=streams.audio || streams.audio_tracks || [],languages=streams.languages || [];
                    if(Array.isArray(languages))languages.forEach(function(l){if(typeof l==='string' && /^[a-z]{2,3}$/i.test(l))langs.push(l.toUpperCase());});
                    if(Array.isArray(audio))audio.forEach(function(a){var l=a && (a.language || a.lang);if(typeof l==='string' && /^[a-z]{2,3}$/i.test(l))langs.push(l.toUpperCase());});
                    langs=langs.filter(function(l,i,a){return a.indexOf(l)===i;});
                    var value=String(streams.dynamic_range || streams.hdr || '').toUpperCase();
                    if(/^(HDR|HDR10|HDR10\+|SDR|HLG|DOLBY VISION)$/.test(value))range=value;
                    task.node.find('.lp-stream-info').text([langs.join(', '),range,q].filter(Boolean).join(' · '));
                }
                task.badge.text(q).toggle(!!q);if(task.qualityMeta) task.qualityMeta.text(q).toggle(!!q);
            }
            function enqueueProbe(task) {
                if (destroyed || busy || task.ticket!==generation) return;
                var hit=cache[task.key];if (hit && Date.now()-hit.time<60000) return showQuality(task,hit.streams);
                if (task.requested) return;task.requested=true;probeQueue.push(task);pumpProbes();
            }
            function pumpProbes() {
                while (probing<2 && probeQueue.length) {
                    var task=probeQueue.shift();if (task.ticket!==generation) continue;
                    probing++;(function (t) {
                        var provider=probeProviders.filter(function (p) {return p.id===t.source;})[0];
                        provider.resolve(t.release,t.ep,function (streams) {
                            if (t.ticket!==generation || destroyed) return;
                            cache[t.key]={time:Date.now(),streams:streams};showQuality(t,streams);probing--;pumpProbes();
                        },function () {if (t.ticket!==generation || destroyed) return;probing--;pumpProbes();});
                    })(task);
                }
            }
            function cell(ep) {
                var v=voiceOf(ep), m=detailFor(ep), view=progress(ep), state=snapshot(ep,view), handler=view.handler;
                view.handler=function (percent,time,duration) {
                    view.percent=percent;view.time=time;view.duration=duration;
                    if (handler) handler(percent,time,duration);
                    state.percent=percent;state.time=time;state.duration=duration;state.updated=Date.now();record(state);
                };
                return {_lpNextTitle:series()?episodeName(ep):v.title,title:series()?(flag(setting('full_episode_title',true),true)?'[S'+ep.season+':E'+ep.number+'] '+episodeName(ep):'Серия '+ep.number):v.title,
                    thumbnail:series()?thumbnail(ep):undefined,card:movie,timeline:view,
                    season:series()?+ep.season:undefined,episode:series()?+ep.number:undefined,
                    hls_type:source.id==='filmix'?(setting('filmix_hls','auto')==='auto'?(Lampa.Platform.is('webos') && root.MediaSource && root.MediaSource.isTypeSupported && root.MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"')?'hlsjs':undefined):setting('filmix_hls','auto')):undefined,_lamplay:state,_lpEpisode:ep,subtitles:false};
            }
            function resolveCell(item,done,fail,mark) {
                var ep=item._lpEpisode, hit=cache[streamKey(ep)];
                function ready(streams) {
                    try {streams=prepareStreams(streams,setting);item.url=chooseQuality(streams.quality,setting('quality','1080'));item.quality=streams.quality;item.subtitles=streams.subtitles && streams.subtitles.length?streams.subtitles:false;if (!item.url) throw new Error('Нет доступного видеопотока.');if(mark!==false)markStarted(ep);var previous=Lampa.Storage.field?Lampa.Storage.field('video_quality_default'):Lampa.Storage.get('video_quality_default',1080),chosen=Object.keys(item.quality).filter(function(k){return item.quality[k]===item.url;})[0];
                    try{Lampa.Storage.set('video_quality_default',qualityNumber(chosen));done();}finally{Lampa.Storage.set('video_quality_default',previous);}}
                    catch(e) {fail(e);}
                }
                if (hit && Date.now()-hit.time<60000) ready(hit.streams);else source.resolve(release,ep,ready,fail);
            }
            function play(ep,resuming,player) {
                if (busy) return;
                if(ep.unavailable){Lampa.Noty.show(availability(detailFor(ep).air_date) || 'Серия недоступна в данной озвучке');return;}
                begin('Получаем видеопоток…',function () {play(ep,resuming,player);});
                var items=episodes.filter(function (e) {return !e.loadSeason && !e.unavailable && (!series() || !season || String(e.season)===season);}).slice();
                if (series()) items.sort(function (a,b) {return +a.season-+b.season || +a.number-+b.number;});
                var playlist=items.map(cell), index=items.indexOf(ep), first=playlist[index];
                if (!first) return failed(new Error('Серия не найдена.'));
                playlist.forEach(function (item) {item.url=function (callback) {resolveCell(item,callback,function (e) {item.url='';Lampa.Noty.show(safeError(e));callback();});};});
                resolveCell(first,function () {
                    markStarted(ep);saveSource(movie,source.id);record(first._lamplay);finish();renderHero();
                    if (movie.id && Lampa.Favorite) Lampa.Favorite.add('history',movie,100);
                    if (resuming && first.timeline.time>0) { first._lpResumeAt=first.timeline.time;first.timeline.percent=0; }
                    if(player && Lampa.Player.runas)Lampa.Player.runas(player);
                    try{Lampa.Player.play(first);Lampa.Player.playlist(playlist);}finally{if(player && Lampa.Player.runas)Lampa.Player.runas(false);}

                },failed);
            }
            function metadataRequest(path,done,fail) {
                if (!Lampa.TMDB || !Lampa.TMDB.api || !Lampa.TMDB.key) return fail && fail();
                var url=Lampa.TMDB.api(path+(path.indexOf('?')<0?'?':'&')+'api_key='+encodeURIComponent(Lampa.TMDB.key()));
                metadataIo.request(url,null,'json',done,fail || function () {});
            }
            function loadMetadata(target) {
                if (!Lampa.TMDB) return;
                var related=type==='tv' && relatedSeason(movie,target);
                var sameCard = related || !target || [movie.title,movie.name,movie.original_title,movie.original_name].some(function (name) {return name && sameTitle(name,target.title);});
                var sourceType = target && release ? (series()?'tv':'movie') : type;
                var cardYear=String(movie.release_date||movie.first_air_date||'').slice(0,4);
                if (!related && target && target.year && cardYear && String(target.year)!==cardYear || sourceType!==type) sameCard=false;
                var directId = sameCard && (!movie.source || ['tmdb','cub'].indexOf(movie.source)>=0) ? movie.id : null;
                var name = target && target.title || initialQuery;
                var year = target && target.year || String(movie.release_date || movie.first_air_date || '').slice(0,4);
                var signature = sourceType+'|'+(directId || name+'|'+year);
                if (metadata.signature===signature) {if(target){if(metadata.id)metadata.request++;metadata.seasons={};if(season)loadSeasonMetadata(season);}return;}
                metadata.signature=signature;metadata.id=null;metadata.seasons={};metadata.logo='';
                metadata.details=sameCard?movie:{title:name};var ticket=++metadata.request;
                function detail(id) {
                    if (ticket!==metadata.request || destroyed) return;metadata.id=id;
                    metadataRequest(sourceType+'/'+id+'?language=ru&append_to_response=images&include_image_language=ru,en,null',function (d) {
                        if (destroyed || ticket!==metadata.request) return;metadata.details=d;
                        var logos=list(d.images && d.images.logos);var logo=logos.filter(function (l) {return l.iso_639_1==='ru';})[0] || logos.filter(function (l) {return l.iso_639_1==='en';})[0] || logos[0];
                        metadata.logo=logo && imageURL(logo.file_path,'w500');renderHero();refreshControls();
                        if (release && !busy && !errorMessage) {renderEpisodes(last && last._lpEpisodeKey);if (series()) loadSeasonMetadata(season);}
                    });
                }
                if (directId) return detail(directId);
                metadataRequest('search/'+sourceType+'?language=ru&query='+encodeURIComponent(name),function (data) {
                    if (destroyed || ticket!==metadata.request) return;
                    var items=list(data.results).map(function (r) {return {id:r.id,title:r.title||r.name,original:r.original_title||r.original_name,year:String(r.release_date||r.first_air_date||'').slice(0,4)};});
                    var card={title:name,release_date:year?year+'-01-01':''};var hit=exactResult(items,card,name);
                    if (hit) detail(hit.id);
                });
            }
            function splitRelease(){var id=seasonIdentity(resultSelected && resultSelected.title);return relatedSeason(movie,resultSelected) && !!(id.season || id.part || id.final);}
            function splitPart(){var id=seasonIdentity(resultSelected && resultSelected.title);return relatedSeason(movie,resultSelected) && (id.part || id.special);}
            function mappedSeason(s){
                if(!relatedSeason(movie,resultSelected))return String(s);
                var id=seasonIdentity(resultSelected.title),seasons=list(metadata.details.seasons).filter(function(x){return +x.season_number>0;});
                return String(id.season || (id.final && seasons.length?Math.max.apply(null,seasons.map(function(x){return +x.season_number;})):s));
            }
            function loadSeasonMetadata(s) {
                if (!metadata.id || !s || own(metadata.seasons,String(s))) return;
                metadata.seasons[String(s)]=[];var ticket=metadata.request;
                metadataRequest('tv/'+metadata.id+'/season/'+encodeURIComponent(mappedSeason(s))+'?language=ru',function (d) {
                    if (destroyed || ticket!==metadata.request) return;var rows=list(d.episodes),identity=seasonIdentity(resultSelected && resultSelected.title);
                    if(relatedSeason(movie,resultSelected) && identity.part){
                        // Match a reset part against its release year; never guess an offset from a part number.
                        var year=String(resultSelected.year || '');
                        rows=year?rows.filter(function(ep){return String(ep.air_date || '').slice(0,4)===year;}):[];
                        var available=episodes.filter(function(ep){return String(ep.season)===String(s) && !ep.loadSeason;}).length;
                        if(rows.length!==available)rows=[];
                        if(rows.length)rows=rows.map(function(ep,index){return Object.assign({},ep,{episode_number:index+1});});
                    }
                    metadata.seasons[String(s)]=rows.map(function(ep){return Object.assign({},ep,{season_number:+s});});
                    if (release && !errorMessage && String(season)===String(s)) renderEpisodes(last && last._lpEpisodeKey);
                },function () {delete metadata.seasons[String(s)];});
            }
            this.create=function () {activeScreen=self;renderHero();refreshControls();loadMetadata();search();return html;};
            this.render=function () {return html;};
            this.start=function () {fitEpisodeGeometry();
                if (!inActivity()) return;
                syncBackground(resultsVisible?'results':view());
                Lampa.Controller.add('content',{toggle:function () {
                    Lampa.Controller.collectionSet(html);
                    var target=last && html[0].contains(last)?last:body.find('.selector')[0] || tools.find('.selector')[0];
                    Lampa.Controller.collectionFocus(target || false,html);if (target) focusNode(target);
                },up:function () {move('up','head');},down:function () {move('down');},left:function () {move('left','menu');},right:function () {move('right');},back:self.back});
                Lampa.Controller.toggle('content');
            };
            function filterDrawer(){
                var originNode=last;
                function close(){self.start();if(originNode && html[0].contains(originNode))Lampa.Controller.collectionFocus(originNode,html);}
                function show(){
                    var entries=[{title:'Сбросить фильтр',action:function(){query=initialQuery;pendingResume=null;search();}},
                        {title:'Источник',subtitle:source.title,items:providers.map(function(p){return {title:p.title,value:p.id,selected:p.id===source.id};}),kind:'source'}];
                    if(release && series()){
                        entries.push({title:'Сезон',subtitle:'Сезон '+season,kind:'season',items:seasonList().map(function(s){return {title:'Сезон '+s,value:s,selected:String(s)===String(season)};})});
                        entries.push({title:'Перевод',subtitle:voice && voice.title || '',kind:'voice',items:release.voices.map(function(v){return {title:v.title,value:v.id,selected:voice && String(v.id)===String(voice.id)};})});
                    }
                    Lampa.Select.show({title:'Фильтр',items:entries,onBack:close,onSelect:function(entry){
                        if(entry.action){close();entry.action();return;}
                        if(entry.kind==='source'){sourceMenu(show);return;}
                        Lampa.Select.show({title:entry.title,items:entry.items,onBack:show,onSelect:function(item){
                            close();if(entry.kind==='source'){source=providers.filter(function(p){return p.id===item.value;})[0];saveSource(movie,source.id);pendingResume=null;search();}
                            else if(entry.kind==='season'){chooseSeason(item.value);}
                            else{chooseVoice(release.voices.filter(function(v){return String(v.id)===String(item.value);})[0]);}
                        }});
                    }});
                }show();
            }
            function move(dir,fallback) {
                var current=html.find('.selector.focus').first();if(!current.length && last) current=$(last);
                var filter=current.attr('data-lp-control'), parent=current.parent(), first=parent.children('.selector').first()[0]===current[0];
                function nearest(candidates,axis){var r=current[0].getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,best=null,score=Infinity;
                    candidates.each(function(){if(this===current[0])return;var t=this.getBoundingClientRect();if(!t.width || !t.height)return;var dx=t.left+t.width/2-cx,dy=t.top+t.height/2-cy;if(axis==='up' && dy>=-4 || axis==='down' && dy<=4 || axis==='left' && dx>=-4 || axis==='right' && dx<=4)return;var val=(axis==='up'||axis==='down')?Math.abs(dy)+Math.abs(dx)*.35:Math.abs(dx)+Math.abs(dy)*.35;if(val<score){score=val;best=this;}});return best;}
                function focus(target){if(target){Lampa.Controller.collectionFocus(target,html);return true;}return false;}
                if(resultsVisible && !errorMessage){
                    var rows=body.find('.lp-result'),controls=tools.find('.selector');
                    if(current.hasClass('lp-result')){
                        if(dir==='left'){focus(controlTarget(resultFilter)[0] || controls[0]);return;}
                        if(dir==='up' || dir==='down'){var pos=rows.index(current),target=rows[pos+(dir==='up'?-1:1)];if(target)focus(target);else if(dir==='up')Lampa.Controller.toggle('head');return;}
                        if(dir==='right')return;
                    }
                    if(filter){
                        if(dir==='right'){focus(lastResult && body[0].contains(lastResult)?lastResult:rows[0]);return;}
                        if(dir==='up' || dir==='down'){var index=controls.index(current),next=controls[index+(dir==='up'?-1:1)];if(next)focus(next);else if(dir==='up')Lampa.Controller.toggle('head');return;}
                    }
                }
                if(!series() && current.hasClass('lp-episode') && dir==='left'){
                    var destination=controlTarget(returnFilter || 'source')[0] || tools.find('.selector')[0];
                    focus(destination);return;
                }
                if(errorMessage && filter && dir==='right' && (listLayout() || resultsVisible)){focus(status.find('.lp-retry')[0]);return;}
                if(filter && (parent.hasClass('lp-strip') || parent[0]===tools[0] && !listLayout()) && (dir==='left' || dir==='right')){
                    var sibling=dir==='right'?current.nextAll('.selector').first():current.prevAll('.selector').first();
                    if(sibling.length){focus(sibling[0]);return;}
                }
                var retry=status.find('.lp-retry');
                if(current.hasClass('lp-retry')){
                    var exit=controlTarget(returnFilter || 'source')[0] || tools.find('.selector')[0] || filters.find('.selector')[0];
                    if(!focus(nearest(html.find('.selector').not('.lp-retry'),dir) || exit))Lampa.Controller.toggle('head');
                    return;
                }
                if(filter && parent[0]===tools[0] && dir==='down' && !listLayout()){
                    var candidates=retry.length?retry:body.find('.lp-episode');if(focus(nearest(candidates,'down')))return;
                }
                if(filter && parent[0]===tools[0] && listLayout() && dir==='right' && (retry.length || body.find('.lp-episode').length)){
                    if(focus(nearest(retry.length?retry:body.find('.lp-episode'),'right')))return;
                }
                if((filter || current.hasClass('lp-continue')) && dir==='up'){
                    if(!focus(nearest(html.find('.selector').not('.lp-retry,.lp-episode'),'up')))Lampa.Controller.toggle('head');return;
                }
                if(errorMessage && filter && dir==='down'){
                    if(!focus(nearest(tools.find('.selector'),'down')))focus(nearest(retry,'down'));return;
                }
                if(dir==='right' && (current.hasClass('lp-episode') && (listLayout() || current[0]===body.children('.lp-episode').last()[0]) || filter && parent.children('.selector').last()[0]===current[0] && (parent.hasClass('lp-strip') || parent[0]===tools[0] && !listLayout()))) return filterDrawer();
                var resume=hero.find('.lp-continue');
                if(dir==='left' && filter && first && resume.length) {returnFilter=filter;Lampa.Controller.collectionFocus(resume,html);return;}
                if(dir==='right' && current.hasClass('lp-continue')) {var next=controlTarget(returnFilter);if(!next.length) next=filters.find('.selector').first();if(next.length) {Lampa.Controller.collectionFocus(next,html);return;}}
                if (root.Navigator.canmove(dir)) root.Navigator.move(dir);else if (fallback) Lampa.Controller.toggle(fallback);
            }
            this.back=function () {if (busy && !release) return cancel();changeGeneration();buttonBindings.forEach(function(b){b.focusUntil=1;if(b.startComponent && b.direct) b.startComponent.last=b.direct[0];});Lampa.Activity.backward();setTimeout(function(){buttonBindings.forEach(initialFocus);},0);};
            this.pause=function () {releaseBackground();};this.stop=function () {releaseBackground();};
            var resizeHandler=function(){if(inActivity()) syncBackground(resultsVisible?'results':view());fitStrip();};root.addEventListener('resize',resizeHandler);
            this.playerClosed=function () {if (release && !busy && !errorMessage) renderEpisodes(lastEpisodeKey);else renderHero();};
            var healthStartTimer=setTimeout(checkSources,1200);
            this.destroy=function () {clearTimeout(healthStartTimer);if(geometryFrame){if(root.cancelAnimationFrame)root.cancelAnimationFrame(geometryFrame);else clearTimeout(geometryFrame);}healthPending=[];healthIo.clear();countIo.clear();countEpoch++;$(root).off('resize.lamplay',resized);clearTimeout(resizeTimer);html.find('.lp-scroll').each(function(){if(this._lpScrollFrame)root.cancelAnimationFrame(this._lpScrollFrame);});releaseBackground();vignette.remove();if(nativeBackground) nativeBackground.remove();root.removeEventListener('resize',resizeHandler);destroyed=true;if (activeScreen===self) activeScreen=null;changeGeneration();metadataIo.clear();html.remove();};
        }

        $('<style id="lamplay-style"></style>').text([
            ".lamplay-logo{width:1.6em;height:1.6em;flex-shrink:0;fill:currentColor}",
            "body.glass--style .settings-folder[data-component=lamplay] .settings-folder__icon{-webkit-filter:none!important;filter:none!important}",
            ".full-start-new__buttons .view--lamplay-direct{width:auto!important;max-width:none!important;flex-shrink:0;color:#fff}",
            ".full-start-new__buttons .view--lamplay-direct span{display:block!important;max-width:none!important;width:auto!important;opacity:1!important;visibility:visible!important;margin-left:.5em}",
            ".full-start-new__buttons .view--lamplay-direct.focus{color:#111;background:#fff}",
            ".lamplay{height:100%;min-height:0;position:relative;overflow:hidden;background:transparent;color:#fff;isolation:isolate;font-size:1.2em}",
            ".lp-backdrop{position:absolute;top:0;right:0;bottom:0;left:0;z-index:-1;pointer-events:none;background:transparent}",
            ".lp-backdrop img{width:100%;height:100%;object-fit:cover;opacity:1}",
            ".lamplay[data-view=card] .lp-backdrop img{opacity:1}.lp-backdrop:empty{display:none}",
            ".lp-backdrop:after{content:'';position:absolute;top:0;right:0;bottom:0;left:0;background:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.12)),linear-gradient(0deg,rgba(0,0,0,.5),transparent 75%)}",
            ".lp-panel{height:100%;box-sizing:border-box;padding:1em 1.3em;display:flex;gap:1em;min-height:0}",
            ".lp-side,.lp-main{min-width:0;min-height:0;display:flex;flex-direction:column;gap:.65em}",
            ".lp-side{width:30%;flex-shrink:0}.lp-main{overflow:hidden;flex:1}.lp-top{display:flex;gap:1em;min-height:0;flex-shrink:0}.lp-top>.lp-hero{width:32%}.lp-top>.lp-filters{flex:1;min-width:0}",
            ".lp-hero{height:26vh;min-height:9em;max-height:17em;flex-shrink:0;position:relative;overflow:hidden;border-radius:.6em;background:transparent}",
            ".lp-cover{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;object-fit:cover}",
            ".lp-hero.lp-has-cover:after{content:'';position:absolute;top:0;right:0;bottom:0;left:0;background:linear-gradient(0deg,rgba(0,0,0,.92),transparent 95%);pointer-events:none}",
            ".lp-hero-content{position:absolute;top:0;right:0;bottom:0;left:0;z-index:1;padding:.7em;display:flex;flex-direction:column;justify-content:flex-end;gap:.4em}",
            ".lp-title-logo{max-width:85%;height:3.1em;object-fit:contain;object-position:left center;align-self:flex-start}",
            ".lp-name{font-size:1.2em;font-weight:600;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
            ".lp-continue{padding:.5em .6em;border:1px solid rgba(255,255,255,.65);border-radius:.6em;align-self:flex-start;background:rgba(0,0,0,.45);font-weight:600}",
            ".lp-resume-detail{font-size:.86em;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
            ".lp-progress{height:.22em;background:rgba(255,255,255,.28);border-radius:.2em;overflow:hidden;min-height:3px}",
            ".lp-progress i{display:block;height:100%;background:#fff}",
            ".lp-scroll{overflow:auto;scrollbar-width:none;min-height:0;min-width:0;overscroll-behavior:contain}",
            ".lp-scroll::-webkit-scrollbar{display:none}",
            ".lp-tools{display:flex;flex-direction:column;gap:.4em;padding:.15em;flex-shrink:1}",
            ".lamplay__control{padding:.6em .8em;background:rgba(0,0,0,.45);border-radius:.4em;white-space:nowrap;flex-shrink:0;font-size:1em}",
            ".lp-selected{box-shadow:inset 0 0 0 1px rgba(255,255,255,.65);background:rgba(255,255,255,.16)}",
            ".lp-filters{display:flex;flex-direction:column;gap:.55em;flex-shrink:0;min-width:0}",
            ".lp-strip{display:flex;gap:.4em;padding:.2em;white-space:nowrap}",
            ".lp-caption{font-size:.9em;color:rgba(255,255,255,.8);margin-bottom:.25em}",
            ".lp-body-pane{flex:1;padding:.2em;box-sizing:border-box}",
            ".lamplay__items{display:flex;flex-direction:column;gap:.55em}",
            ".lamplay__item{padding:.65em;background:rgba(0,0,0,.35);border-radius:.45em;border:2px solid transparent;box-sizing:border-box;flex-shrink:0}",
            ".lamplay__item-title{font-size:1.12em;font-weight:600;line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
            ".lamplay__item-detail{font-size:.86em;color:rgba(255,255,255,.8);line-height:1.3;margin-top:.4em}",
            ".lp-episode{display:flex;gap:.65em;padding:.3em;align-items:stretch;min-height:6.3em}",
            ".lp-picture{color:#fff;position:relative;width:10em;min-width:10em;height:5.625em;background:transparent;overflow:hidden;border-radius:.3em}",
            ".lp-picture img{width:100%;height:100%;object-fit:cover;position:absolute;top:0;right:0;bottom:0;left:0}",
            ".lp-picture .lp-progress{position:absolute;bottom:.25em;left:.3em;right:.3em}",
            ".lp-episode-number,.lp-runtime,.lp-quality{position:absolute;padding:.15em .25em;background:rgba(0,0,0,.7);border-radius:.2em;font-size:.78em}",
            ".lp-episode-number{left:.3em;top:.3em}.lp-runtime{right:.3em;bottom:.8em}.lp-quality{right:.3em;top:.3em}.lp-quality:empty{display:none}",
            ".lp-episode-info{padding:.4em .35em;min-width:0;flex:1}",
            ".lp-watched{font-size:.86em;margin-top:.35em}",
            ".lp-description{font-size:.9em;line-height:1.35;margin-top:.45em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}",
            ".lp-series[data-view=vertical] .lp-description{display:none}",
            ".lp-film .lp-picture{width:3.6em;min-width:3.6em;height:auto;background:transparent}",
            ".lp-film .lp-runtime{display:none}.lp-film .lp-episode{min-height:4.1em}",
            ".lp-film .lp-picture .lp-progress{bottom:.4em}.lp-film .lp-quality{left:.15em;right:auto}",
            ".lp-series[data-view=horizontal] .lp-panel,.lp-series[data-view=card] .lp-panel{flex-direction:column}",
            ".lp-series[data-view=horizontal] .lp-side,.lp-series[data-view=horizontal] .lp-main,.lp-series[data-view=card] .lp-side,.lp-series[data-view=card] .lp-main{display:none}",
            ".lp-series[data-view=horizontal] .lp-hero,.lp-series[data-view=card] .lp-hero{grid-column:1;grid-row:1}",
            ".lp-series[data-view=horizontal] .lp-filters,.lp-series[data-view=card] .lp-filters{grid-column:2;grid-row:1;justify-content:space-between}",
            ".lp-series[data-view=horizontal] .lp-tools,.lp-series[data-view=card] .lp-tools{flex-direction:row}",
            ".lp-series[data-view=horizontal] .lp-body-pane,.lp-series[data-view=card] .lp-body-pane{flex:1;min-height:0;overflow-y:hidden}",
            ".lp-series[data-view=horizontal] .lamplay__items,.lp-series[data-view=card] .lamplay__items{flex-direction:row;align-items:flex-start;width:max-content;min-height:0}",
            ".lp-series[data-view=horizontal] .lp-episode,.lp-series[data-view=card] .lp-episode{width:23vw;max-width:24em;min-width:12em;flex-direction:column;gap:0;height:auto;overflow:hidden;background:transparent}",
            ".lp-series[data-view=horizontal] .lp-picture,.lp-series[data-view=card] .lp-picture{width:100%;min-width:0;flex-shrink:0;height:12.94vw;}",
            ".lp-series[data-view=horizontal] .lp-episode-info,.lp-series[data-view=card] .lp-episode-info{overflow:hidden}",
            ".lamplay[data-view=card] .lp-hero{background:transparent}.lamplay[data-view=card] .lp-cover,.lamplay[data-view=card] .lp-hero.lp-has-cover:after{display:none}",
            ".lamplay[data-view=card] .lp-hero-content{padding:.3em;justify-content:center}",
            ".lamplay[data-view=results] .lp-filters{display:none}",
            ".lamplay .selector.focus,.lamplay .selector:focus{outline:none;background:#fff;color:#111;border-color:#fff}",
            ".lamplay .selector.focus .lamplay__item-detail{color:#444}",
            ".lamplay .lp-episode.focus .lp-progress i{background:#999}",
            ".lamplay__status{position:absolute;top:.5em;left:50%;transform:translateX(-50%);max-width:85%;padding:.5em .8em;border-radius:.4em;z-index:5;background:#303030;box-shadow:0 2px 10px #0007;font-size:1em}",
            ".lamplay__status.lp-error{background:#582a30}.lp-retry{display:inline-block;padding:.35em;margin-left:.6em;text-decoration:underline}",
            "@media(max-height:650px){.lp-panel{padding:.65em .9em;gap:.65em}.lp-hero{min-height:8em}.lp-description{-webkit-line-clamp:2}.lp-caption{font-size:.78em}.lamplay__control{padding:.45em .6em}.lp-strip-group{min-height:0}}",
            "@media(max-width:700px){.lp-panel{padding:.5em;gap:.5em}.lp-picture{width:7em;min-width:7em}.lp-name{font-size:1em}.lamplay__control{font-size:.9em}.lp-hero{min-height:8em}.lp-episode-info{font-size:1em}}",
            ".lp-series[data-view=horizontal] .lp-episode-info,.lp-series[data-view=card] .lp-episode-info{flex:none}",
            ".lp-series[data-view=horizontal] .lp-episode.focus,.lp-series[data-view=card] .lp-episode.focus{background:transparent;color:#fff;border-color:transparent}",
            ".lp-series[data-view=horizontal] .lp-episode.focus .lp-picture,.lp-series[data-view=card] .lp-episode.focus .lp-picture{box-shadow:0 0 0 2px #fff}",
            ".lp-series[data-view=horizontal] .lp-episode.focus .lamplay__item-detail,.lp-series[data-view=card] .lp-episode.focus .lamplay__item-detail{color:rgba(255,255,255,.8)}",
            ".lp-series[data-view=horizontal] .lp-body-pane,.lp-series[data-view=card] .lp-body-pane{overflow-y:auto}",
            "\nbody.lp-active .head,body.lp-active .head__body{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}\nbody.lp-active .full-start__background:not(.lp-native-background){visibility:hidden}\n.lp-native-background{pointer-events:none!important}\n.lamplay .lp-backdrop{display:none!important}\n.lp-play{width:1em;height:1em;display:block;flex:none;fill:currentColor;overflow:visible}\n.lp-continue{display:flex;align-items:center;gap:.45em;border-width:2px;border-radius:1.3em;line-height:1.2;white-space:nowrap}\n.lp-title-slot{min-height:0;max-width:100%;display:flex;align-items:center}\n.lp-title-logo{width:auto;max-width:100%;height:3.7em;max-height:100%;object-fit:contain;object-position:left center}\n.lp-resume-row{display:flex;flex-direction:column;gap:.4em;min-width:0}\n.lp-resume-info{min-width:0;display:flex;flex-direction:column;gap:.18em}\n.lp-resume-title{font-size:.94em;font-weight:600;line-height:1.15}\n.lp-remaining{display:flex;align-items:center;gap:.45em;font-size:.75em}\n.lp-remaining>.lp-progress{flex:1;min-width:3em}.lp-remaining>span{flex:none}\n.lp-top{min-height:0}.lp-series[data-view=horizontal] .lp-top>.lp-hero{width:38%;height:auto;min-height:30vh;max-height:none;align-self:stretch}\n.lp-series[data-view=horizontal] .lp-filters{justify-content:space-between;gap:.75em}\n.lp-series[data-view=horizontal] .lp-panel{gap:1em}\n.lp-series[data-view=horizontal] .lp-hero-content{padding:.8em}\n.lamplay[data-view=card] .lp-panel{flex-direction:column}\n.lamplay[data-view=card] .lp-top{flex-direction:column;gap:.65em;flex:none}\n.lamplay[data-view=card] .lp-top>.lp-hero{width:100%;height:auto;min-height:0;max-height:none;overflow:visible;border-radius:0}\n.lamplay[data-view=card] .lp-hero-content{position:static;padding:.2em;justify-content:flex-start;gap:.4em}\n.lamplay[data-view=card] .lp-title-slot{height:3.8em;max-width:25em}\n.lamplay[data-view=card] .lp-title-logo{height:100%;max-width:100%}\n.lamplay[data-view=card] .lp-resume-row{flex-direction:row;align-items:center;gap:.9em}\n.lamplay[data-view=card] .lp-resume-info{max-width:28em;flex:1}.lamplay[data-view=card] .lp-continue{flex:none}\n.lamplay[data-view=card] .lp-filters{gap:.5em;font-size:.88em}\n.lamplay[data-view=card] .lp-tools{flex-direction:row}\n.lamplay[data-view=card] .lp-body-pane{flex:1;min-height:0}\n.lamplay[data-view=card] .lp-side,.lamplay[data-view=card] .lp-main{display:none}\n.lp-series[data-view=horizontal] .lp-body-pane,.lp-series[data-view=card] .lp-body-pane{padding:.45em .35em}\n.lp-series[data-view=horizontal] .lp-episode,.lp-series[data-view=card] .lp-episode{overflow:visible;border:0;padding:.15em .3em}\n.lp-series[data-view=horizontal] .lp-picture,.lp-series[data-view=card] .lp-picture{overflow:hidden;border-radius:.4em;box-shadow:none;outline:0 solid transparent;outline-offset:0;isolation:isolate}\n.lp-series[data-view=horizontal] .lp-episode.lp-started .lp-picture,.lp-series[data-view=card] .lp-episode.lp-started .lp-picture{outline:1px solid rgba(255,255,255,.5);outline-offset:1px}\n.lp-series[data-view=horizontal] .lp-episode.focus .lp-picture,.lp-series[data-view=card] .lp-episode.focus .lp-picture{box-shadow:none;outline:.17em solid #fff;outline-offset:.17em}\n.lp-picture:after{content:'';position:absolute;left:0;right:0;bottom:0;height:32%;background:linear-gradient(transparent,rgba(0,0,0,.75));z-index:0;pointer-events:none}\n.lp-picture .lp-progress,.lp-runtime,.lp-percent{z-index:1}\n.lp-picture .lp-progress{left:.4em;right:.4em;bottom:.4em;height:.22em;min-height:3px;background:rgba(255,255,255,.45)}\n.lp-runtime,.lp-percent{position:absolute;bottom:1.05em;font-size:.78em;line-height:1;font-weight:600;text-shadow:0 1px 3px #000;background:none;padding:0}\n.lp-runtime{right:.5em}.lp-percent{left:.5em}\n.lp-focus-play{display:none;position:absolute;top:0;right:0;bottom:0;left:0;z-index:2;align-items:center;justify-content:center;pointer-events:none}\n.lp-focus-play .lp-play{width:2em;height:2em;filter:drop-shadow(0 1px 3px #0006)}\n.lp-episode.focus .lp-focus-play{display:flex}\n.lp-series[data-view=horizontal] .lp-quality,.lp-series[data-view=card] .lp-quality{display:none!important}\n.lp-episode-meta{display:flex;align-items:center;gap:.5em;flex-wrap:wrap;margin:.15em 0 .4em;font-size:.76em}\n.lp-quality-meta{display:inline-block;padding:.1em .25em;border-radius:.2em;background:rgba(255,255,255,.25);font-weight:600}.lp-quality-meta:empty,.lp-episode-meta>span:empty{display:none}\n.lp-series[data-view=vertical] .lp-quality-meta{display:none}\n.lp-series[data-view=horizontal] .lp-description,.lp-series[data-view=card] .lp-description{display:block;-webkit-line-clamp:unset;overflow:visible;font-size:.8em;line-height:1.3}\n.lp-series[data-view=horizontal] .lp-episode-info,.lp-series[data-view=card] .lp-episode-info{overflow:visible;padding:.5em .05em .2em}\n.lp-series[data-view=horizontal] .lp-episode.focus .lp-progress i,.lp-series[data-view=card] .lp-episode.focus .lp-progress i{background:#fff}\n.full-start-new__title.lp-logo-slot,.full-start__title.lp-logo-slot{font-size:1em!important;display:flex;align-items:center;height:6.5em;max-height:22vh;padding:.55em 0 .85em;margin:0 0 .7em;overflow:visible;line-height:1}\n.lp-logo-slot+.full-start-new__tagline{margin-top:0}\n.lamplay-card-logo{display:block;width:auto;max-width:100%;max-height:100%;height:100%;object-fit:contain;object-position:left center}\n.lp-settings-icon{width:1.7em;height:1.7em;margin-right:.8em;display:flex;align-items:center;justify-content:center;flex:none;color:inherit}\n.lp-settings-icon svg{width:100%;height:100%;fill:currentColor}.lp-hd-icon{display:block;width:100%;height:100%;background:currentColor;mask-size:contain;-webkit-mask-size:contain;mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat}\n.lp-settings-row{display:flex;align-items:center}.lp-settings-row>.settings-param__name{flex:1}\nbody.glass--style .settings-folder[data-component^=lamplay_] .settings-folder__icon{filter:none!important;-webkit-filter:none!important}\n@media(max-height:650px){.lamplay[data-view=card] .lp-title-slot{height:2.8em}.lamplay[data-view=card] .lp-top{gap:.4em}.lamplay[data-view=card] .lp-filters{gap:.35em}.lp-series[data-view=horizontal] .lp-top>.lp-hero{min-height:27vh}.lp-hero-content{gap:.3em}.lp-title-logo{height:2.8em}}\n@media(max-width:700px){.lamplay[data-view=card] .lp-resume-row{flex-direction:column;align-items:flex-start}.lamplay[data-view=card] .lp-resume-info{max-width:100%}.lp-series[data-view=horizontal] .lp-top>.lp-hero{width:40%;min-height:11em}.lp-series[data-view=horizontal] .lp-hero-content{padding:.4em}.lp-continue{font-size:.85em}.lp-resume-detail{font-size:.75em}}\n"
            ,"\n.lp-search{display:flex;align-items:center;gap:.5em}.lp-search svg{width:1.25em;height:1.25em;flex:none}\n.lp-native-background{display:block;animation:none!important;max-width:none;visibility:visible!important}\n\n.lp-series[data-view=horizontal] .lp-top{height:31vh;min-height:0;flex:none}\n.lp-series[data-view=horizontal] .lp-top>.lp-hero{width:34%;height:100%;min-height:0;max-height:none;align-self:flex-start}\n.lp-series[data-view=horizontal] .lp-filters{justify-content:flex-start;gap:.4em;font-size:.85em}\n.lp-series[data-view=horizontal] .lp-tools{margin-top:auto}\n.lp-series[data-view=horizontal] .lp-title-slot{height:2.4em;width:65%;max-width:14em;align-self:center;justify-content:center;flex:none}\n.lp-series[data-view=horizontal] .lp-title-logo{height:auto;width:auto;max-width:100%;max-height:100%;object-position:center}\n.lp-series[data-view=horizontal] .lp-resume-row{flex-direction:row;align-items:center;gap:.5em;font-size:.8em}\n.lp-series[data-view=horizontal] .lp-resume-info{flex:1;font-size:.87em}\n.lp-series[data-view=horizontal] .lp-hero-content{padding:.6em .6em .9em}\n.lp-series[data-view=horizontal] .lp-remaining>.lp-progress{position:absolute;left:.6em;right:.6em;bottom:.35em}\n.lamplay[data-view=card] .lp-title-slot{height:2.8em;width:20em;max-width:30vw;flex:none}\n.lamplay[data-view=card] .lp-title-logo{height:auto;width:auto;max-width:100%;max-height:100%}\n.lamplay[data-view=card] .lp-hero-content{height:5.4em;box-sizing:border-box}\n.lp-series[data-view=horizontal] .lp-body-pane,.lp-series[data-view=card] .lp-body-pane{overflow-y:hidden}\n.lp-series[data-view=horizontal] .lp-description,.lp-series[data-view=card] .lp-description{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;font-size:.76em;line-height:1.3;max-height:3.9em;margin-top:.3em}\n.lp-series[data-view=horizontal] .lp-episode-info,.lp-series[data-view=card] .lp-episode-info{overflow:hidden;padding:.35em .05em .15em}\n.lp-series[data-view=horizontal] .lp-picture,.lp-series[data-view=card] .lp-picture{height:12.375vw}\n.lp-series[data-view=horizontal] .lp-episode,.lp-series[data-view=card] .lp-episode{width:22vw;min-width:0}\n.lp-series[data-view=horizontal] .lp-quality,.lp-series[data-view=card] .lp-quality{display:block!important;z-index:3}\n.lp-series[data-view=horizontal] .lp-quality:empty,.lp-series[data-view=card] .lp-quality:empty{display:none!important}\n.lp-series[data-view=horizontal] .lp-quality-meta,.lp-series[data-view=card] .lp-quality-meta{display:none!important}\n.lamplay[data-view=vertical] .lp-picture .lp-runtime,.lamplay[data-view=vertical] .lp-picture .lp-percent,.lamplay[data-view=vertical] .lp-picture .lp-progress,.lamplay[data-view=vertical] .lp-picture .lp-quality,.lamplay[data-view=vertical] .lp-picture:after{display:none!important}\n.lamplay[data-view=vertical] .lp-episode-info{position:relative;padding:.5em .7em;display:flex;flex-direction:column;gap:.2em}\n.lamplay[data-view=vertical] .lp-episode-info>.lamplay__item-title{padding-right:4em}\n.lp-row-duration{position:absolute;right:.7em;top:.6em;font-size:.78em}\n.lamplay[data-view=vertical] .lp-episode-info>.lp-progress{flex:none;margin:.2em 0 0;height:.18em;background:#ffffff55}\n.lamplay[data-view=vertical] .lp-watched{font-size:.72em;min-height:1.2em;margin:0}\n.lamplay[data-view=vertical] .lp-episode-meta{margin-top:auto;margin-bottom:0;padding-right:4em}\n.lamplay[data-view=vertical] .lp-quality-meta{display:block;position:absolute;right:.7em;bottom:.5em;background:none}\n.lamplay[data-view=vertical] .lp-quality-meta:empty{display:none}\n.lp-result{display:flex;align-items:center;gap:.8em;min-height:5.4em}.lp-result-info{min-width:0}.lp-result .lamplay__item-detail{margin-top:.3em}.lp-folder{width:2.5em;height:2.5em;flex:none}\n.lamplay[data-view=results] .lp-main{padding-top:2.5em}\n.full-start-new__title.lp-logo-slot,.full-start__title.lp-logo-slot{box-sizing:border-box;height:7em;max-height:23vh;width:36vw;max-width:25em;padding:1em 0;margin:0 0 .5em;align-items:center;justify-content:flex-start;display:flex!important}\n.lamplay-card-logo{height:auto!important;width:auto!important;max-height:100%!important;max-width:100%!important;object-fit:contain}\n.lp-settings-icon svg[fill=none],.settings-folder__icon svg[fill=none]{fill:none!important}\n.lp-settings-icon svg[fill=none] [fill=currentColor]{fill:currentColor}\n@media(max-height:650px){.lp-series[data-view=horizontal] .lp-top{height:32vh}.lamplay[data-view=card] .lp-hero-content{height:4em}.lamplay[data-view=card] .lp-title-slot{height:2.3em}.lp-series[data-view=horizontal] .lp-resume-row{font-size:.7em}.lp-series[data-view=horizontal] .lp-filters{font-size:.78em}.lp-episode-meta{font-size:.7em}.lp-series .lp-episode-info>.lamplay__item-title{font-size:.9em}.lp-panel{gap:.4em}.lamplay[data-view=card] .lp-top{gap:.25em}.lamplay[data-view=card] .lp-filters{gap:.2em;font-size:.78em}.lp-series[data-view=card] .lp-description{font-size:.7em}.lp-series[data-view=card] .lp-episode-info{padding-top:.2em}}\n@media(max-width:700px){.lp-series[data-view=horizontal] .lp-top{height:28vh}.lp-series[data-view=horizontal] .lp-top>.lp-hero{width:42%}.lp-series[data-view=horizontal] .lp-resume-row{flex-direction:column;align-items:flex-start}.lamplay[data-view=card] .lp-title-slot{max-width:65vw}.full-start-new__title.lp-logo-slot,.full-start__title.lp-logo-slot{width:65vw}.lamplay-card-logo{max-width:100%!important}}\n"
        ].join('\n')+"\n.lamplay__control,.lp-continue{display:flex;align-items:center;box-sizing:border-box;line-height:1.25;min-height:2.65em}\n.lamplay[data-view=vertical] .lp-tools>.lamplay__control{height:2.8em;min-height:2.8em;padding-top:.4em;padding-bottom:.4em}\n.lp-strip,.lp-tools{scroll-behavior:smooth}\n.lp-strip{mask-image:linear-gradient(to right,transparent,#000 1em,#000 calc(100% - 1em),transparent);-webkit-mask-image:linear-gradient(to right,transparent,#000 1em,#000 calc(100% - 1em),transparent);padding-left:.5em;padding-right:1em}\n.lp-series[data-view=horizontal] .lp-episode-meta,.lp-series[data-view=card] .lp-episode-meta{flex-wrap:nowrap;justify-content:space-between;gap:.6em}\n.lp-series[data-view=horizontal] .lp-air-date,.lp-series[data-view=card] .lp-air-date{margin-left:auto;text-align:right}\n.lp-meta-separator{margin:0 .35em}\n.lp-skeleton .lp-picture,.lp-skeleton-line{background:rgba(255,255,255,.13);border-radius:.3em}\n.lp-skeleton-line{height:.8em;margin:.45em 0;width:85%}.lp-skeleton-line:last-child{width:60%}\n.lp-series[data-view=horizontal] .lp-filters{justify-content:space-between;gap:.7em}\n.lp-series[data-view=horizontal] .lp-tools{margin-top:0}\n.lp-series[data-view=horizontal] .lp-resume-row{flex-direction:row;align-items:center;font-size:1em;gap:.6em}\n.lp-series[data-view=horizontal] .lp-resume-info{font-size:.9em;line-height:1.25}\n.lp-series[data-view=horizontal] .lp-continue{font-size:.9em}\n.lp-series[data-view=horizontal] .lp-title-slot{height:2.5em;width:65%}\n.lp-series[data-view=horizontal] .lp-top{height:34vh}\n\n.full-start-new__body.lp-logo-layout{align-items:flex-start!important}\n.full-start-new__title.lp-logo-slot,.full-start__title.lp-logo-slot{height:4.8em;max-height:15vh;padding:.3em 0;margin:0 0 .4em}\n.lp-logo-slot .lamplay-card-logo{max-height:4.2em!important}\n").appendTo('head');
        Lampa.Component.add(KEY, Screen);
        var buttonBindings = [];
        // CSS order wins over other plugins' prepends without a MutationObserver
        // reorder loop. The initial-focus guard ends on the first real user input.
        function focusPriority(binding) {
            var a=Lampa.Activity.active(),visible=a && a.activity && a.activity.render && a.activity.render();
            visible=visible && (visible[0] || visible);
            return flag(setting('button_first',true),true) && binding.focusUntil>0 && binding.direct &&
                root.document.documentElement.contains(binding.direct[0]) && (!visible || visible.contains(binding.direct[0]));
        }
        function initialFocus(binding) {
            if (!focusPriority(binding)) return;
            var enabled=Lampa.Controller.enabled && Lampa.Controller.enabled();
            if (enabled && enabled.name!=='content') return;
            if (binding.startComponent) binding.startComponent.last=binding.direct[0];
            if (!binding.direct.hasClass('focus')) Lampa.Controller.collectionFocus(binding.direct,binding.render);
        }
        function armPriority(binding,event) {
            binding.render=event.object.activity.render();
            binding.startComponent=event.link && event.link.items && event.link.items[0];
            binding.focusUntil=1;
            if (binding.startComponent && flag(setting('button_first',true),true)) binding.startComponent.last=(binding.direct || binding.button)[0];
            if (binding.direct) binding.direct.off('.lamplayPriority').on('hover:focus.lamplayPriority hover:touch.lamplayPriority',function () {
                if (binding.startComponent) binding.startComponent.last=this;
            });
            setTimeout(function () {initialFocus(binding);},0);
        }
        function userNavigated() {buttonBindings.forEach(function (b) {b.focusUntil=0;});}
        ['keydown','pointerdown','mousedown','touchstart'].forEach(function (name) {root.document.addEventListener(name,userNavigated,true);});
        var originalCollectionFocus=Lampa.Controller.collectionFocus;
        Lampa.Controller.collectionFocus=function (target,context) {
            var container=context && (context[0] || context);
            for (var i=buttonBindings.length-1;i>=0;i--) {
                var binding=buttonBindings[i];
                if (focusPriority(binding) && container && container.contains && container.contains(binding.direct[0])) {
                    target=binding.direct;
                    if (binding.startComponent) binding.startComponent.last=binding.direct[0];
                    break;
                }
            }
            var args=Array.prototype.slice.call(arguments);args[0]=target;
            return originalCollectionFocus.apply(this,args);
        };

        var nativeNavigatorFocus=root.Navigator && root.Navigator.focus;
        if(nativeNavigatorFocus) root.Navigator.focus=function(target) {
            for(var i=buttonBindings.length-1;i>=0;i--) if(focusPriority(buttonBindings[i])) {var context=buttonBindings[i].render[0], node=target && (target[0] || target);if(node && node.nodeType && context.contains(node)) {target=buttonBindings[i].direct[0];break;}}
            var args=Array.prototype.slice.call(arguments);args[0]=target;return nativeNavigatorFocus.apply(this,args);
        };
        function updateButton(binding) {
            var parent = binding.button.parent();
            if (!parent.length) return;
            if (binding.direct && binding.direct.parent().length && flag(setting('button_first', true), true)) {
                var directParent = binding.direct.parent();
                binding.direct.css('order','-2147483647');
            }
            if (binding.direct && !flag(setting('button_first',true),true)) binding.direct.css('order','');
            if (flag(setting('button_first', true), true)) {
                var first = parent.children('.full-start__button, .selector').first();
                if (first.length && first[0] !== binding.button[0]) first.before(binding.button);
            } else if (binding.marker.parent().length && binding.marker[0].nextSibling !== binding.button[0]) {
                binding.marker.after(binding.button);
            }
        }
        function updateButtons() {
            buttonBindings.forEach(updateButton);
        }
        function bindButton(button, marker, render) {
            var binding = { button: button, marker: marker, render: render, focusUntil: 0 };
            // Modern Lampa groups source buttons in a hidden container. Keep that source
            // and create a separate shortcut in the visible action row.
            var actions = render.find('.full-start-new__buttons').first();
            if (actions.length && actions[0] !== button.parent()[0]) {
                binding.direct = actions.children('.view--lamplay-direct').first();
                if (!binding.direct.length) {
                    binding.direct = $('<div class="full-start__button selector view--lamplay-direct">' + LOGO + '<span>LamPlay</span></div>');
                    binding.direct.on('hover:enter', function () { button.trigger('hover:enter'); });
                    actions.prepend(binding.direct);
                }
            }
            if (root.MutationObserver && button.parent().length) {
                binding.observer = new root.MutationObserver(function () {
                    updateButton(binding);
                    if (focusPriority(binding) && !binding.focusTimer) binding.focusTimer=setTimeout(function () {binding.focusTimer=null;initialFocus(binding);},16);
                });
                binding.observer.observe(button.parent()[0], { childList: true });
                if (binding.direct) binding.observer.observe(actions[0], { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
            }
            buttonBindings.push(binding); updateButton(binding);
        }
        if(Lampa.Manifest && !(Lampa.Manifest.plugins || []).some(function(p){return p.component===KEY;}))Lampa.Manifest.plugins={type:'video',version:VERSION,name:NAME,description:'Смотреть онлайн',component:KEY,
            onContextMenu:function(){return{name:'LamPlay',description:'Смотреть онлайн'};},
            onContextLauch:function(movie){cardBackgroundSnapshot=null;Lampa.Activity.push({component:KEY,title:NAME,movie:movie,page:1,url:''});}};
        var nativeSelectShow=Lampa.Select.show;
        Lampa.Select.show=function(options){
            if(options && options.items && flag(setting('button_first',true),true)){
                var index=options.items.map(function(i){return i.title===NAME && (i.subtitle==='Смотреть онлайн' || i.description==='Смотреть онлайн');}).indexOf(true);
                if(index>0){options.items=options.items.slice();options.items.unshift(options.items.splice(index,1)[0]);}
            }
            return nativeSelectShow.apply(this,arguments);
        };
        Lampa.Listener.follow('full', function (event) {
            if (event.type !== 'complite') return;
            buttonBindings = buttonBindings.filter(function (entry) {
                if (root.document.documentElement.contains(entry.button[0])) return true;
                if (entry.observer) entry.observer.disconnect();
                return false;
            });
            var render = event.object.activity.render();
            var existing = render.find('.view--lamplay').first();
            if (existing.length) {
                if (!buttonBindings.some(function (entry) { return entry.button[0] === existing[0]; })) {
                    var savedMarker = existing.parent().contents().filter(function () {
                        return this.nodeType === 8 && this.nodeValue === 'lamplay-original-button-position';
                    }).first();
                    if (!savedMarker.length) { savedMarker = $(root.document.createComment('lamplay-original-button-position')); existing.before(savedMarker); }
                    bindButton(existing, savedMarker, render);
                }
                var cachedBinding=buttonBindings.filter(function (b) {return b.button[0]===existing[0];})[0];
                if (cachedBinding) armPriority(cachedBinding,event);
                updateButtons(); return;
            }
            var button = $('<div class="full-start__button selector view--lamplay">' + LOGO + '<span>LamPlay</span></div>');
            button.on('hover:enter', function () {
                captureCardBackground(render);
                Lampa.Activity.push({ component: KEY, title: NAME, movie: event.data.movie, page: 1, url: '' });
            });
            var anchor = render.find('.view--torrent').first();
            var marker = $(root.document.createComment('lamplay-original-button-position'));
            if (anchor.length) anchor.after(marker);
            else render.find('.buttons--container, .full-start__buttons, .full-start-new__buttons').first().append(marker);
            marker.after(button);
            bindButton(button, marker, render);
            var binding = buttonBindings[buttonBindings.length - 1];
            armPriority(binding,event);
        });
        Lampa.SettingsApi.addComponent({ component: KEY, name: NAME,
            icon: LOGO });
        var cardLogoBindings=[],cardLogoCache={},cardLogoIo=new Transport(Lampa,setting);
        function updateCardLogo(binding) {
            var title=binding.title;
            if (!title.length || title[0]._lamplayLogoBinding!==binding || !root.document.documentElement.contains(title[0])) return;
            function restore() {title.closest('.full-start-new__body').removeClass('lp-logo-layout');title.removeClass('lp-logo-slot');if (title.find('.lamplay-card-logo').length) title.text(binding.name);}
            if (!flag(setting('card_logo',false))) return restore();
            var data=binding.movie,source=data.source || 'tmdb';
            if (!data.id || ['tmdb','cub'].indexOf(source)<0 || !Lampa.TMDB || !Lampa.TMDB.api || !Lampa.TMDB.key) return restore();
            var type=/^(movie|tv)$/.test(data.media_type)?data.media_type:data.name || data.first_air_date?'tv':'movie';
            var language=setting('logo_language',Lampa.Storage.get('language','ru')) || 'ru';
            var key=type+'|'+data.id+'|'+language;
            function apply(path) {
                if (title[0]._lamplayLogoBinding!==binding) return;
                if (!flag(setting('card_logo',false)) || !root.document.documentElement.contains(title[0])) return restore();
                if (!path) return restore();
                if (title.find('.lamplay-card-logo').attr('data-logo-path')===path) return;
                var img=$('<img class="lamplay-card-logo">').attr('alt',binding.name).attr('data-logo-path',path);
                img.on('error',function () {if (title.find('.lamplay-card-logo')[0]===this) {title.removeClass('lp-logo-slot').text(binding.name);}});
                title.closest('.full-start-new__body').addClass('lp-logo-layout');title.addClass('lp-logo-slot').empty().append(img);
                img.attr('src',Lampa.TMDB.image('/t/p/w500'+path.replace(/\.svg$/i,'.png')));
            }
            if (own(cardLogoCache,key)) return apply(cardLogoCache[key]);
            if (binding.loading===key) return;binding.loading=key;
            var url=Lampa.TMDB.api(type+'/'+encodeURIComponent(data.id)+'/images?api_key='+encodeURIComponent(Lampa.TMDB.key())+'&include_image_language='+encodeURIComponent(language+',en,null'));
            cardLogoIo.request(url,null,'json',function (response) {
                binding.loading=null;
                var logos=list(response && response.logos),logo=logos.filter(function (l) {return l.iso_639_1===language;})[0] || logos.filter(function (l) {return l.iso_639_1==='en';})[0] || logos[0];
                cardLogoCache[key]=logo && logo.file_path || '';apply(cardLogoCache[key]);
            },function () {binding.loading=null;restore();});
        }
        function updateCardLogos() {cardLogoBindings=cardLogoBindings.filter(function (b) {return root.document.documentElement.contains(b.title[0]);});cardLogoBindings.forEach(updateCardLogo);}
        Lampa.Listener.follow('full',function (event) {
            if (event.type!=='complite' && event.type!=='complete') return;
            var render=event.body || event.object && event.object.activity && event.object.activity.render();
            if (!render) return;
            $(render).find('.full-start-new__body').addClass('lp-poster-stable');var title=$(render).find('.full-start-new__title, .full-start__title').first(),movie=event.data && event.data.movie;
            if (!title.length || !movie) return;
            var binding={title:title,movie:movie,name:movie.title || movie.name || title.text()};title[0]._lamplayLogoBinding=binding;
            cardLogoBindings=cardLogoBindings.filter(function (b) {return b.title[0]!==title[0] && root.document.documentElement.contains(b.title[0]);});
            cardLogoBindings.push(binding);updateCardLogo(binding);
            // The host may emit complete immediately before attaching the card.
            setTimeout(function () {updateCardLogo(binding);},0);
        });

        // Integrated from Water-FAQ/lampa-plugins ratings.js (native Lampa metadata).
        function createIntegratedRatings() {
    var CACHE = 'lamplay_ratings_native_v1';
    var DAY = 86400000;
    var cache = {};
    var cards = [];
    var views = [];
    var started = false, enabled = false, observer = null, painted = [], lines = [];
    function active() {return enabled && !root.waterfaq_ratings;}
    var saveTimer, cleanTimer;
    var names = ['tmdb', 'imdb', 'kp'];
    var queue = [], pending = {}, retryUntil = {}, revisions = {};
    var running = 0, generation = 0, pumpTimer, intersection;

    function setting(name, fallback) { return Lampa.Storage.get('lamplay_ratings_' + name, fallback); }
    function rating(value) {
        if (typeof value !== 'number' && typeof value !== 'string') return 0;
        var text = String(value).trim().replace(',', '.');
        if (!/^\d+(\.\d+)?$/.test(text)) return 0;
        var n = Number(text);
        return isFinite(n) && n > 0 && n <= 10 ? n : 0;
    }
    function format(n) { return n === 10 ? '10' : n.toFixed(1); }
    function connected(node) { return !!node && document.documentElement.contains(node); }
    function type(data) {
        if (data.media_type === 'movie' || data.media_type === 'tv') return data.media_type;
        if (data.first_air_date) return 'tv';
        if (data.release_date) return 'movie';
        return data.original_name || (data.name && !data.title) ? 'tv' : 'movie';
    }
    function key(data, method) {
        var source = String(data.source || 'tmdb');
        if (source === 'cub') source = 'tmdb';
        return source + ':' + (method || type(data)) + ':' + String(data.id);
    }
    function valid(data) {
        if (!data || typeof data !== 'object') return null;
        if (data.data && !data.id) data = data.data;
        if (data.movie && !data.id) data = data.movie;
        return data && data.id && (data.title || data.name) && data.media_type !== 'person' && !data.known_for_department && data.source !== 'shikimori' ? data : null;
    }
    function cardData(node) {
        if (node.classList.contains('LMEShikimori')) return null;
        var candidates = [node.card_data, node._card, node.card, node.data];
        for (var i = 0; i < candidates.length; i++) {
            var found = valid(candidates[i]);
            if (found) return found;
        }
        if (window.$) {
            try {
                var jq = $(node), fields = ['card_data', 'card', 'item', 'data'];
                for (i = 0; i < fields.length; i++) {
                    found = valid(jq.data(fields[i]));
                    if (found) return found;
                }
            } catch (e) { /* Custom cards need not use jQuery data(). */ }
        }
        return null;
    }
    function extract(data) {
        var result = {}, fields = {tmdb: 'vote_average', imdb: 'imdb_rating', kp: 'kp_rating'};
        names.forEach(function (source) {
            if (Object.prototype.hasOwnProperty.call(data, fields[source])) result[source] = rating(data[fields[source]]);
        });
        return result;
    }
    function cached(id, source) {
        var entry = cache[id] && cache[id][source];
        return entry && Date.now() - entry.time < DAY ? entry : null;
    }
    function values(data, id) {
        var result = extract(data);
        names.forEach(function (source) {
            var entry = cached(id, source);
            if (entry) result[source] = entry.value;
        });
        return result;
    }
    function selected(data, id) {
        var scores = values(data, id);
        var priority = setting('priority', 'imdb');
        var order = priority === 'kp' ? ['kp', 'imdb', 'tmdb'] : priority === 'tmdb' ? ['tmdb', 'imdb', 'kp'] : ['imdb', 'kp', 'tmdb'];
        for (var i = 0; i < order.length; i++) if (rating(scores[order[i]])) return scores[order[i]];
        return 0;
    }
    function merge(id, incoming, full) {
        var changed = false, record = cache[id] || {};
        names.forEach(function (source) {
            if (!Object.prototype.hasOwnProperty.call(incoming, source)) return;
            var prev = cached(id, source), n = rating(incoming[source]);
            if (!full && prev && prev.full) return;
            if (!prev || prev.value !== n || (full && !prev.full)) {
                record[source] = {value: n, time: Date.now(), full: !!full};
                changed = true;
            }
        });
        if (changed) { cache[id] = record; save(); }
        return changed;
    }
    function save() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            var ids = Object.keys(cache);
            ids.sort(function (a, b) { return latest(cache[b]) - latest(cache[a]); });
            ids.forEach(function (id, index) { if (index >= 1000 || Date.now() - latest(cache[id]) >= DAY) delete cache[id]; });
            try { Lampa.Storage.set(CACHE, cache); } catch (e) { /* Keep the session cache if storage is full. */ }
        }, 350);
    }
    function latest(record) {
        var time = Number(record && record.checked) || 0;
        names.forEach(function (source) { if (record && record[source]) time = Math.max(time, Number(record[source].time) || 0); });
        return time;
    }
    function visible(node) {
        if (!connected(node)) return false;
        var rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > -250 && rect.right > -250 && rect.top < window.innerHeight + 250 && rect.left < window.innerWidth + 250;
    }
    function needsLoad(data, id) {
        var source = data.source || 'tmdb';
        if ((source !== 'tmdb' && source !== 'cub') || !/^\d+$/.test(String(data.id))) return false;
        if (retryUntil[id] > Date.now()) return false;
        if (rating(values(data, id)[setting('priority', 'imdb')])) return false;
        return !(cache[id] && Date.now() - cache[id].checked < DAY);
    }
    function preload(node) {
        if (!active()) return;
        if (!visible(node)) return;
        var data = cardData(node);
        if (!data) return;
        var id = key(data);
        if (!needsLoad(data, id)) return;
        if (pending[id]) {
            if (pending[id].nodes.indexOf(node) === -1) pending[id].nodes.push(node);
            return;
        }
        var job = {id: id, movie: String(data.id), method: type(data), source: data.source || 'tmdb', nodes: [node], generation: generation};
        pending[id] = job;
        queue.push(job);
        clearTimeout(pumpTimer);
        pumpTimer = setTimeout(pump, 50);
    }
    function wanted(job) {
        if (!active()) return false;
        return job.nodes.some(function (node) {
            var data = visible(node) && cardData(node);
            return data && key(data) === job.id && needsLoad(data, job.id);
        });
    }
    function metadata(job, done) {
        var network, timer, finished = false;
        function finish(json, error) {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            done(json, error);
        }
        try {
            if (!Lampa.TMDB || typeof Lampa.TMDB.api !== 'function' || typeof Lampa.TMDB.key !== 'function' || !Lampa.Reguest) throw new Error('Metadata API unavailable');
            var language = Lampa.Storage.get('tmdb_lang', Lampa.Storage.get('language', 'ru'));
            var imageLanguage = String(language || 'ru').split(/[-_]/)[0];
            // Match Lampa's primary full-metadata request. CUB enrichment is not
            // present in the stripped-down response with only external_ids.
            var path = job.method + '/' + encodeURIComponent(job.movie) + '?api_key=' + encodeURIComponent(Lampa.TMDB.key()) + '&language=' + encodeURIComponent(language) + '&append_to_response=content_ratings,release_dates,external_ids,keywords,alternative_titles,images&include_image_language=' + encodeURIComponent(imageLanguage + ',en,null');
            var url;
            // The native CUB metadata response contains IMDb/KP; the ordinary
            // TMDB proxy often returns only TMDB. Both use the same TMDB IDs.
            if (Lampa.Manifest && Lampa.Manifest.cub_domain) {
                var protocol = Lampa.Utils && Lampa.Utils.protocol ? Lampa.Utils.protocol() : 'https://';
                var account = Lampa.Storage.get('account', {});
                if (typeof account === 'string') { try { account = JSON.parse(account); } catch (e) { account = {}; } }
                url = protocol + 'tmdb.' + Lampa.Manifest.cub_domain + '/3/' + path + '&email=' + encodeURIComponent(account && account.email || '');
            } else url = Lampa.TMDB.api(path);
            network = new Lampa.Reguest();
            timer = setTimeout(function () { finish(null, true); network.clear(); }, 15000);
            network.timeout(12000);
            network.silent(url, function (json) { finish(json, false); }, function () { finish(null, true); });
        } catch (e) { finish(null, true); }
    }
    function pump() {
        clearTimeout(pumpTimer);
        while (running < 2 && queue.length) {
            var job = queue.shift();
            if (!wanted(job)) { if (pending[job.id] === job) delete pending[job.id]; continue; }
            execute(job);
        }
    }
    function execute(job) {
        running++;
        var revision = revisions[job.id] || 0;
        metadata(job, function (json, error) {
            running--;
            if (pending[job.id] === job) delete pending[job.id];
            if (job.generation === generation) {
                // A later native full-card update takes precedence over this response.
                if (error || !json || String(json.id) !== job.movie || (json.media_type && json.media_type !== job.method)) retryUntil[job.id] = Date.now() + 5 * 60000;
                else if ((revisions[job.id] || 0) === revision) {
                    var incoming = extract(json);
                    // A successful metadata response also confirms absent ratings.
                    if (!Object.prototype.hasOwnProperty.call(incoming, 'imdb')) incoming.imdb = 0;
                    if (!Object.prototype.hasOwnProperty.call(incoming, 'kp')) incoming.kp = 0;
                    merge(job.id, incoming, true);
                    if (!cache[job.id]) cache[job.id] = {};
                    cache[job.id].checked = Date.now();
                    save();
                    updateCards(job.id);
                }
            }
            pumpTimer = setTimeout(pump, 120);
        });
    }
    function color(n) {
        if (setting('scale', 'detailed') === 'simple') return n < 5 ? '#E57373' : n < 7 ? '#999999' : '#81C784';
        return n < 5 ? '#E57373' : n < 7 ? '#FFB74D' : n < 8 ? '#64B5F6' : '#81C784';
    }
    function paint(node, n, enabled) {
        if (!node) return;
        if (enabled && n) {
            if (!node._lpRatingsOriginalColor) {node._lpRatingsOriginalColor = [node.style.getPropertyValue('color'), node.style.getPropertyPriority('color')];painted.push(node);}
            var desired = color(n);
            if (node._lpRatingsColor !== desired || node.style.color !== node._lpRatingsAppliedColor) node.style.setProperty('color', desired, 'important');
            node._lpRatingsColor = desired;
            node._lpRatingsAppliedColor = node.style.color;
        } else if (node._lpRatingsOriginalColor) {
            node.style.removeProperty('color');
            if (node._lpRatingsOriginalColor[0]) node.style.setProperty('color', node._lpRatingsOriginalColor[0], node._lpRatingsOriginalColor[1]);
            delete node._lpRatingsOriginalColor;
            delete node._lpRatingsColor;
            delete node._lpRatingsAppliedColor;
        }
    }
    function drawCard(node) {
        if (!active()) return;
        var data = cardData(node), badge = node.querySelector('.lp-ratings-vote');
        if (!data) {
            node.classList.remove('lp-ratings-owned');
            if (badge) badge.classList.add('hide');
            var nativeBadge = node.querySelector('.card__vote');
            if (nativeBadge) paint(nativeBadge, rating(nativeBadge.textContent), setting('list_color', true));
            return;
        }
        var id = key(data);
        var n = selected(data, id);
        if (!n) {
            node.classList.remove('lp-ratings-owned');
            if (badge) badge.classList.add('hide');
            return;
        }
        if (!badge) {
            var container = node.querySelector('.card__view');
            if (!container) return;
            badge = document.createElement('div');
            badge.className = 'lp-ratings-vote';
            container.appendChild(badge);
        }
        if (badge.textContent !== format(n)) badge.textContent = format(n);
        badge.classList.remove('hide');
        node.classList.add('lp-ratings-owned');
        paint(badge, n, setting('list_color', true));
    }
    function updateCards(id) {
        if (!active()) return;
        cards.forEach(function (node) {
            if (!connected(node)) return;
            var data = cardData(node);
            if (!id || (data && key(data) === id)) drawCard(node);
        });
    }
    function bindCard(node) {
        if (!active()) return;
        if (!node._lpRatingsNativeRatingsBound) {
            node._lpRatingsNativeRatingsBound = true;
            var update = function () {
                if (!active()) return;
                var data = cardData(node);
                if (data && merge(key(data), extract(data), false)) updateCards(key(data));
                drawCard(node);
                preload(node);
            };
            node.addEventListener('visible', update);
            node.addEventListener('hover:focus', update);
            node.addEventListener('update', update);
            // A few custom builders attach card_data after insertion, without a DOM change.
            [100, 400, 1000].forEach(function (delay) { setTimeout(function () { if (connected(node)) update(); }, delay); });
        }
        if (cards.indexOf(node) === -1) cards.push(node);
        if (intersection) intersection.observe(node);
        var data = cardData(node);
        if (data && merge(key(data), extract(data), false)) updateCards(key(data));
        drawCard(node);
        preload(node);
    }
    function colorLine(line) {
        if (!active()) return;
        var badges = line.querySelectorAll('.full-start__rate');
        for (var i = 0; i < badges.length; i++) {
            var value = badges[i].firstElementChild;
            if (value) paint(value, rating(value.textContent), setting('full_color', true));
        }
        // No text, labels, visibility or order is changed in the full card.
    }
    function syncView(view) {
        if (!active()) return;
        if (view.root._lpRatingsNativeRatingsView !== view || !connected(view.root)) return;
        var line = view.root.querySelector('.full-start-new__rate-line, .full-start__rate-line');
        if (!line) return;
        var incoming = extract(view.data);
        names.forEach(function (source) {
            var badge = line.querySelector('.rate--' + source);
            if (!badge) return;
            var node = badge.firstElementChild;
            var n = rating(node && node.textContent);
            if (n && !badge.classList.contains('hide')) {
                incoming[source] = n;
                view.observed[source] = true;
            } else if (view.observed[source]) incoming[source] = 0;
        });
        if (merge(view.id, incoming, true)) {
            revisions[view.id] = (revisions[view.id] || 0) + 1;
            updateCards(view.id);
        }
        if (incoming.imdb !== undefined || incoming.kp !== undefined) {
            if (!cache[view.id]) cache[view.id] = {};
            if (!cache[view.id].checked || Date.now() - cache[view.id].checked >= DAY) { cache[view.id].checked = Date.now(); save(); }
        }
        colorLine(line);
        bindLine(line, view);
    }
    function bindLine(line, view) {
        if (!active()) return;
        if (!view) {
            var parent = line.parentNode;
            while (parent && !view) { view = parent._lpRatingsNativeRatingsView; parent = parent.parentNode; }
        }
        if (view) line._lpRatingsNativeRatingsView = view;
        if (lines.indexOf(line)<0) lines.push(line);
        if (!line._lpRatingsNativeRatingsObserver) {
            var timer;
            line._lpRatingsNativeRatingsObserver = new MutationObserver(function () {
                // Mutation observers run before paint: color new/changed values
                // immediately, while leaving cache/poster updates debounced.
                colorLine(line);
                clearTimeout(timer);
                timer = setTimeout(function () {
                    var current = line._lpRatingsNativeRatingsView;
                    if (current) syncView(current);
                    else colorLine(line);
                }, 40);
            });
            line._lpRatingsNativeRatingsObserver.observe(line, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class']});
        }
        colorLine(line);
    }
    function onFull(e) {
        if (!active()) return;
        if (e.type !== 'complite' && e.type !== 'complete') return;
        var object = e.object || {}, activity = object.activity;
        var rendered = e.body || (activity && activity.render && activity.render());
        var root = rendered && (rendered[0] || rendered);
        var data = e.data && e.data.movie || object.movie || object.card;
        if (!root || !root.querySelector || !data || !data.id) return;
        var method = object.method === 'tv' || object.method === 'movie' ? object.method : type(data);
        var view = {root: root, data: data, id: key(data, method), observed: {}};
        root._lpRatingsNativeRatingsView = view;
        views = views.filter(function (old) { return connected(old.root) && old.root !== root; });
        views.push(view);
        syncView(view);
        // The complete event can precede the activity's insertion into the document.
        setTimeout(function () { syncView(view); }, 0);
    }
    function discover(root) {
        if (!active()) return;
        if (!root || root.nodeType !== 1) return;
        if (root.matches('.card')) bindCard(root);
        else if (root.matches('.card__vote')) {
            var parent = root.closest ? root.closest('.card') : null;
            if (parent) bindCard(parent);
        }
        var found = root.querySelectorAll('.card');
        for (var i = 0; i < found.length; i++) bindCard(found[i]);
        if (root.matches('.full-start-new__rate-line, .full-start__rate-line')) {
            bindLine(root);
            if (root._lpRatingsNativeRatingsView) syncView(root._lpRatingsNativeRatingsView);
        }
        found = root.querySelectorAll('.full-start-new__rate-line, .full-start__rate-line');
        for (i = 0; i < found.length; i++) {
            bindLine(found[i]);
            if (found[i]._lpRatingsNativeRatingsView) syncView(found[i]._lpRatingsNativeRatingsView);
        }
    }
    function clean() {
        cards = cards.filter(function (node) {
            if (connected(node)) return true;
            if (intersection) intersection.unobserve(node);
            return false;
        });
        views = views.filter(function (view) { return connected(view.root); });
    }
    function refresh() {
        if (!active()) return;
        clean();
        views.forEach(syncView);
        updateCards();
        cards.forEach(preload);
        var lines = document.querySelectorAll('.full-start-new__rate-line, .full-start__rate-line');
        for (var i = 0; i < lines.length; i++) colorLine(lines[i]);
    }
    function clearCache() {
        if (root.waterfaq_ratings) {
            var external=Lampa.SettingsApi.getParam && Lampa.SettingsApi.getParam('wf_ratings');
            var clear=list(external).filter(function (p) {return p.param.name==='wf_ratings_clear';})[0];
            if (clear && clear.onChange) return clear.onChange();
        }
        cache={};generation++;queue=[];pending={};retryUntil={};clearTimeout(saveTimer);
        Lampa.Storage.set(CACHE,cache);refresh();Lampa.Noty.show('Кэш рейтингов очищен');
    }
    function init() {
        if (started || !window.Lampa || !document.body) return;
        started = true;
        try { cache = Lampa.Storage.get(CACHE, {}) || {}; } catch (e) { cache = {}; }
        if (typeof cache !== 'object' || Array.isArray(cache)) cache = {};
        // Deliberately ignore all caches from versions that used external APIs.
        Object.keys(cache).forEach(function (id) {
            if (!cache[id] || typeof cache[id] !== 'object') { delete cache[id]; return; }
            names.forEach(function (source) {
                var entry = cache[id][source];
                if (entry && (!isFinite(entry.time) || Date.now() - entry.time >= DAY || !isFinite(entry.value) || entry.value < 0 || entry.value > 10)) delete cache[id][source];
            });
        });
        var style = document.createElement('style');
        style.id = 'lp-ratings-style';
        style.textContent = '.card.lp-ratings-owned .card__vote{display:none!important}' +
            '.lp-ratings-vote{position:absolute;right:.3em;bottom:.3em;background:rgba(0,0,0,.5);color:#fff;font-size:1.3em;font-weight:700;padding:.2em .5em;border-radius:1em;z-index:1;pointer-events:none}' +
            '.lp-ratings-vote.hide{display:none!important}';
        document.head.appendChild(style);
        Lampa.Listener.follow('full', onFull);
        if (window.IntersectionObserver) intersection = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) { if (entry.isIntersecting) preload(entry.target); });
        }, {rootMargin: '250px'});
        observer = new MutationObserver(function (mutations) {
            if (!active()) {suspend();syncExternal();return;}
            var removed = false;
            mutations.forEach(function (m) {
                if (m.removedNodes.length) removed = true;
                // Native poster fields may be updated in place by Lampa.
                if (m.target.nodeType === 1 && m.target.matches('.card__vote')) {
                    var parent = m.target.closest ? m.target.closest('.card') : null;
                    if (parent) bindCard(parent);
                }
                for (var i = 0; i < m.addedNodes.length; i++) discover(m.addedNodes[i]);
            });
            if (removed) { clearTimeout(cleanTimer); cleanTimer = setTimeout(clean, 500); }
        });
        observer.observe(document.body, {childList: true, subtree: true});
        discover(document.body);
        if (!intersection) {
            var scanTimer;
            var scan = function () { clearTimeout(scanTimer); scanTimer = setTimeout(function () { clean(); cards.forEach(preload); }, 180); };
            document.addEventListener('scroll', scan, true);
            document.addEventListener('transitionend', scan, true);
            window.addEventListener('resize', scan);
        }
        try {
            var currentActivity = Lampa.Activity.active();
            if (currentActivity && currentActivity.activity && (currentActivity.movie || currentActivity.card)) onFull({type: 'complite', object: currentActivity, data: {movie: currentActivity.movie || currentActivity.card}});
        } catch (e) { /* No active activity yet. */ }
    }

    function suspend() {
        generation++;queue=[];pending={};clearTimeout(pumpTimer);clearTimeout(saveTimer);
        if (observer) observer.disconnect();if (intersection) intersection.disconnect();
        lines.forEach(function (line) {if (line._lpRatingsNativeRatingsObserver) line._lpRatingsNativeRatingsObserver.disconnect();});
        painted.forEach(function (node) {
            if (node._lpRatingsOriginalColor && node.style.color===node._lpRatingsAppliedColor) paint(node,0,false);
            else {delete node._lpRatingsOriginalColor;delete node._lpRatingsColor;delete node._lpRatingsAppliedColor;}
        });painted=[];
        cards.forEach(function (node) {node.classList.remove('lp-ratings-owned');var badge=node.querySelector('.lp-ratings-vote');if (badge) badge.remove();});
    }
    function syncExternal() {
        if (!enabled || !root.waterfaq_ratings || !Lampa.SettingsApi.getParam) return;
        var external=Lampa.SettingsApi.getParam('wf_ratings');if (!external) return;
        ['priority','list_color','full_color','scale'].forEach(function (name) {Lampa.Storage.set('wf_ratings_'+name,setting(name,name==='priority'?'imdb':name==='scale'?'detailed':true));});
        var param=list(external).filter(function (p) {return p.param.name==='wf_ratings_priority';})[0];
        if (param && param.onChange) param.onChange();
    }
    function setEnabled(value) {
        enabled=flag(value);
        if (!active()) {if (started) suspend();syncExternal();return;}
        if (!started) init();else {
            if (observer) observer.observe(document.body,{childList:true,subtree:true});
            lines.forEach(function (line) {if (connected(line) && line._lpRatingsNativeRatingsObserver) line._lpRatingsNativeRatingsObserver.observe(line,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});});
            discover(document.body);refresh();
        }
    }
    return {setEnabled:setEnabled,refresh:function () {if (root.waterfaq_ratings) syncExternal();else refresh();},clear:clearCache};

        }

        var menuIcons={"kodik": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" fill=\"currentColor\"><path d=\"M5 4h5v10h4L23 4h6L18 16l11 12h-6L14 18h-4v10H5Z\"/></svg>", "anilibria": "<svg version=\"1.0\" xmlns=\"http://www.w3.org/2000/svg\"\n width=\"512.000000pt\" height=\"512.000000pt\" viewBox=\"40 40 432 432\"\n preserveAspectRatio=\"xMidYMid meet\">\n<metadata>\nCreated by potrace 1.11, written by Peter Selinger 2001-2013\n</metadata>\n<g transform=\"translate(0.000000,512.000000) scale(0.100000,-0.100000)\"\nfill=\"currentColor\" stroke=\"none\">\n<path d=\"M2468 4660 c-5 -14 -21 -56 -35 -95 -13 -38 -37 -106 -53 -150 -16\n-44 -76 -213 -134 -375 -57 -162 -120 -340 -140 -395 -19 -55 -56 -158 -81\n-230 -26 -71 -62 -175 -82 -230 -19 -55 -38 -103 -41 -107 -6 -5 -126 198\n-503 855 -236 412 -422 733 -430 741 -4 5 -54 -21 -115 -60 -59 -38 -112 -71\n-117 -73 -5 -2 -41 -24 -81 -50 -39 -26 -105 -69 -147 -96 l-75 -48 99 -176\nc54 -97 110 -196 124 -221 14 -25 40 -70 56 -100 17 -30 41 -72 54 -92 13 -21\n23 -39 23 -42 0 -2 25 -48 56 -102 31 -55 66 -117 78 -139 13 -22 65 -114 116\n-205 51 -91 103 -183 115 -205 13 -22 121 -213 240 -425 203 -361 216 -387\n207 -415 -6 -16 -50 -140 -98 -275 -47 -135 -90 -256 -95 -270 -4 -14 -26 -77\n-49 -140 -23 -63 -55 -153 -71 -200 -16 -47 -32 -92 -36 -100 -3 -8 -7 -19 -9\n-25 -1 -5 -41 -118 -89 -250 -47 -132 -99 -278 -115 -325 -15 -47 -38 -109\n-49 -138 -12 -29 -21 -56 -21 -60 0 -4 161 -8 357 -7 l357 0 37 140 c20 77 80\n304 134 505 54 201 105 393 113 427 9 35 19 63 23 63 5 0 180 -305 327 -570\n14 -25 40 -71 58 -103 19 -32 34 -62 34 -68 0 -5 3 -9 6 -9 3 0 76 46 162 102\n279 180 315 204 448 290 72 47 149 97 172 112 l41 26 15 -53 c9 -28 27 -95 42\n-147 14 -52 28 -102 30 -110 5 -15 -50 -53 -616 -419 -63 -40 -119 -77 -124\n-82 -4 -4 4 -30 19 -58 l28 -51 31 19 c17 10 60 34 96 53 120 65 214 115 414\n223 109 59 202 103 206 98 4 -4 22 -62 39 -128 17 -66 41 -152 52 -190 l21\n-71 359 1 c198 0 359 2 359 5 0 3 -25 88 -56 190 -31 102 -58 196 -60 209 -3\n14 -8 29 -11 34 -3 5 -11 30 -18 55 -7 26 -26 90 -42 143 l-30 95 191 102\nc105 56 218 117 251 135 33 18 102 55 153 82 50 27 92 54 92 60 0 5 -23 72\n-51 147 -50 133 -52 137 -74 125 -12 -7 -100 -63 -196 -125 -422 -275 -433\n-282 -440 -269 -12 21 -93 307 -88 311 2 2 90 59 194 126 444 288 447 290 440\n308 -4 9 -52 152 -107 317 -56 165 -104 304 -108 308 -4 4 -145 -80 -314 -189\n-169 -108 -309 -194 -311 -192 -5 5 -169 547 -274 908 -17 58 -35 119 -41 135\n-5 17 -72 242 -150 500 -77 259 -151 506 -164 550 -14 44 -31 101 -38 128\nl-12 47 -96 0 c-52 1 -157 2 -234 3 l-138 2 -10 -25z m125 -927 c2 -16 57\n-219 122 -453 64 -234 119 -436 121 -449 3 -14 7 -28 10 -33 3 -4 7 -18 9 -29\n3 -12 15 -61 29 -108 22 -79 35 -130 41 -156 2 -5 10 -35 19 -66 9 -31 18 -65\n21 -75 2 -11 14 -53 25 -94 26 -89 60 -221 60 -229 0 -4 -15 -15 -32 -26 -18\n-10 -109 -67 -201 -127 -93 -59 -170 -108 -172 -108 -3 0 -194 328 -233 400\n-7 14 -22 39 -32 55 -11 17 -23 36 -26 44 -4 7 -33 58 -64 113 l-58 99 15 52\nc8 29 15 57 17 62 2 6 6 24 11 40 4 17 41 156 82 310 41 154 77 287 79 295 5\n22 19 72 48 180 14 52 40 150 58 217 17 67 34 120 38 118 4 -3 10 -17 13 -32z\"/>\n</g>\n</svg>\n", "extra": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 8h4m6 0h14M4 16h15m6 0h3M4 24h6m6 0h12\"/><circle cx=\"11\" cy=\"8\" r=\"3\"/><circle cx=\"22\" cy=\"16\" r=\"3\"/><circle cx=\"13\" cy=\"24\" r=\"3\"/></svg>", "rating": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m16 3.5 3.8 7.7 8.5 1.2-6.2 6 1.5 8.5-7.6-4-7.6 4 1.5-8.5-6.2-6 8.5-1.2Z\"/></svg>", "about": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"16\" cy=\"16\" r=\"12\"/><path d=\"M16 14v9\"/><circle cx=\"16\" cy=\"9.2\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/></svg>", "hdrezka": "<span class=\"lp-hd-icon\" style=\"mask-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIwAAACMCAYAAACuwEE+AAAHRElEQVR4nO2dv3YdNRCH53IoQrqko+U1aJ2OlKFMSUqeh5TQ4RK6+FXyCnGX0F0Ks3i90Uozo5nRaPf3neNzEvuutCt9Hmn1z5fr9UoAcPlm9A2Aufh29A0MpDe0XkzuYjLOIIxXm7uX7qFFOqIwoztl2/wPJdBRhBktSY31vU0vz8zCZJZkj+nlmU0YS0l6K6z3XqaUZxZheirHqzL20tXc63JNenGyC6Mp/NGFvs1f8gzpxckqjFSUtAVMT++N+1xpxckmzJFEKbHc77TiZBKGW4hpCq8DadS5UpLnziDMmUQpwY06KaLN6MlHjiwXOq4sa7jPOXT8aaQwrQc/iyhbOM89TJoRwlyJJ8vZ4UgTLk60MIgqMtJFm0hhEFX0pJEmSpjaAyGq8GiVU4g0EcK0ZAEyhkrjLQxk8WGYNJ7C1JYwQpZ+auXoJo2XMKdc7zqIUGk8hIEs8YRJYy0MZBlHiDSWwkCW8bhLYyUMZMmDqzQWwkCWfLhJM3p5A5iMXmEQXfLiEmV6hIEs+TGXRisMZJkHU2nQhwEiNMIgusyHWZSRCgNZ5sVEmuhtJtyb+7L69/POPD8prrkloneG6RERPavkdUtEfyvTDeUiOBTRIrpoOlqvqa8wtW8E4UsHCrwloj+M0+yqx95OL5oiX34n+90BXXXGFWbGw3uOhve2ElbaPREG0WUMFuKo644jDKJLTjzqpZmmNsJERpd/AvOajfCTuVrCILrkx7qOqulpIgz6Lvn4QXmduC4xl3QMPkZlVBvpRXNkxz0R/bz53pv/vl4Y5WF5StVuWrWR3tIPRpxt+4qI7oLzJLId6eWU2w0RfVCkLc2nBLuu0STl4Y76fyG1fRk2e8J4RBfAo6ectX2ZUp7FSIoIk5O0v5wQBogoCZOtOfpAj/Mnmq9ZeaW87nvldaxmqfSW5CnMTBUY/ZZkldcd6WVr1j2E2WdWYazze5IW+jBAxFaYbP0XEEuzH4MIA0RAGCACwgAREAaIgDBAxFoYvCEBosab0gwR5j09HmKs+ZqV35TXvTS9iw3rkd6ICIMFVHyiR3lbeV+I5ogwIBEQJidp59wgTD56ZNkuNDcHwuThhvojy63FjdTI8Herz8CVHraabLHaYkIUEF2IIEwklnKUcI8uRGiSjsJ3URlBmGMQdsIFhJmf0NFsCDM34VMfEGZOlvm1cPCWNB9DJ1QRYebgnpLMvq+FYW/IBiGsJXFdsrChumohukl6vfo391WwZ2kDkW4XYC1P7a5CbX6p2O58xKo7UHUAfRggAsIAERAGiNgKgzelc4PTG4AtEAaIiBTG8rgxqyPMetK5YaQlvf8Ww49m2zvYOcuhzkQPI57bkc6eAlo/h1U6e2lJ+oSc8q3dr0f9fJXmDMKU8p5VGC9ZJOlI0v8qvdGz1dwC/US8+ZTSQmvt52trcCN3MqZiT5gLldt772mCUr5EvAXUpaarRe3zPdGAmxY3vZ8UeUpgtyiRf5yCm95nKi9qbjUlGmH20FRw7fl65dtL26qO2OlI35IiwmpJFk5T84JkbzV7WHYsa5vTskzqiuq0JkzEA3FfDy0ix5+d12vKo/fP2RCVm6PlXt4VfvajQZ67z1prkohsmyVtdLKaruA0WXvpco4c0dyT9u2o1TxL6kh0vWbgLrK3Hxm2a8/ltcBJe2iQFeK6bAnjXWG3ZLcn+J7qJ1HVokutf+NZBr80fv5Zma7l+NLTHzaapFrm0oK0DK3Wb0kWz8jpLEvzcat4xb0QEa9JGtmblxSYdrO7ZxO7RL31/zPTrOueyUfrgt67WcmgFWfScPv5nvRabCPeXgQspdVbvq3JTxVcYUZGmb8G5u3B+53vc/orv5LfSaGsdDh9mAWv0UrO574Q0XPGvXBo9Sc0ae2lJ+2bLJ9/Q+Vxo1pZl9IsDQd01aNEmJ7MntFDpXOu4+QxuzC1/PeG/HvSk3ymSpQwIAfd9Sft9Hq8/oEYTH7ZNW9JkGY+zFoGLAIHIrTCIMrMg2m/syfCQJr8mL+k9DZJkCYvLm+06MMAERbCIMrkw228zCrCQJo8uA6uWjZJkGY87iPx1n0YSDOOkGkbj04vpIknbI7P6y0J0sQROiHs+Vpdkwbi9FMrR7fVA97jMJr1G6CN5e5MEREDd5DGlmGyEMWN9LakgThtWuUUsogtcmpAu08GtMsmbMVj9FwSRxqI8winPEKXx46YfORsjYA0PFHC11KPnK1GtCmTLqqsGb28gXvcxRnE4T7n0B0aow9FJOLvE1p+frQtLdxfhhTPnUGYhdoGrjXrz6QoRAXSiJnmOTMJQyTflThb1JlWlIVswixoxVlfmwVN/yvbM/xPVmEWNPugt5+NLnzPQ4CGk12YhZ4N9F4zupZvbulFWZhFmAWrExwsru9lGknWzCbMGkt5ophSkjUzC7MmszzTS7LmKMKs2VZQtECHEmTLEYXZ4rW++NBi7HEGYfY4ZYX3MnryEUzGv/vb+hViRPEVAAAAAElFTkSuQmCC);-webkit-mask-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIwAAACMCAYAAACuwEE+AAAHRElEQVR4nO2dv3YdNRCH53IoQrqko+U1aJ2OlKFMSUqeh5TQ4RK6+FXyCnGX0F0Ks3i90Uozo5nRaPf3neNzEvuutCt9Hmn1z5fr9UoAcPlm9A2Aufh29A0MpDe0XkzuYjLOIIxXm7uX7qFFOqIwoztl2/wPJdBRhBktSY31vU0vz8zCZJZkj+nlmU0YS0l6K6z3XqaUZxZheirHqzL20tXc63JNenGyC6Mp/NGFvs1f8gzpxckqjFSUtAVMT++N+1xpxckmzJFEKbHc77TiZBKGW4hpCq8DadS5UpLnziDMmUQpwY06KaLN6MlHjiwXOq4sa7jPOXT8aaQwrQc/iyhbOM89TJoRwlyJJ8vZ4UgTLk60MIgqMtJFm0hhEFX0pJEmSpjaAyGq8GiVU4g0EcK0ZAEyhkrjLQxk8WGYNJ7C1JYwQpZ+auXoJo2XMKdc7zqIUGk8hIEs8YRJYy0MZBlHiDSWwkCW8bhLYyUMZMmDqzQWwkCWfLhJM3p5A5iMXmEQXfLiEmV6hIEs+TGXRisMZJkHU2nQhwEiNMIgusyHWZSRCgNZ5sVEmuhtJtyb+7L69/POPD8prrkloneG6RERPavkdUtEfyvTDeUiOBTRIrpoOlqvqa8wtW8E4UsHCrwloj+M0+yqx95OL5oiX34n+90BXXXGFWbGw3uOhve2ElbaPREG0WUMFuKo644jDKJLTjzqpZmmNsJERpd/AvOajfCTuVrCILrkx7qOqulpIgz6Lvn4QXmduC4xl3QMPkZlVBvpRXNkxz0R/bz53pv/vl4Y5WF5StVuWrWR3tIPRpxt+4qI7oLzJLId6eWU2w0RfVCkLc2nBLuu0STl4Y76fyG1fRk2e8J4RBfAo6ectX2ZUp7FSIoIk5O0v5wQBogoCZOtOfpAj/Mnmq9ZeaW87nvldaxmqfSW5CnMTBUY/ZZkldcd6WVr1j2E2WdWYazze5IW+jBAxFaYbP0XEEuzH4MIA0RAGCACwgAREAaIgDBAxFoYvCEBosab0gwR5j09HmKs+ZqV35TXvTS9iw3rkd6ICIMFVHyiR3lbeV+I5ogwIBEQJidp59wgTD56ZNkuNDcHwuThhvojy63FjdTI8Herz8CVHraabLHaYkIUEF2IIEwklnKUcI8uRGiSjsJ3URlBmGMQdsIFhJmf0NFsCDM34VMfEGZOlvm1cPCWNB9DJ1QRYebgnpLMvq+FYW/IBiGsJXFdsrChumohukl6vfo391WwZ2kDkW4XYC1P7a5CbX6p2O58xKo7UHUAfRggAsIAERAGiNgKgzelc4PTG4AtEAaIiBTG8rgxqyPMetK5YaQlvf8Ww49m2zvYOcuhzkQPI57bkc6eAlo/h1U6e2lJ+oSc8q3dr0f9fJXmDMKU8p5VGC9ZJOlI0v8qvdGz1dwC/US8+ZTSQmvt52trcCN3MqZiT5gLldt772mCUr5EvAXUpaarRe3zPdGAmxY3vZ8UeUpgtyiRf5yCm95nKi9qbjUlGmH20FRw7fl65dtL26qO2OlI35IiwmpJFk5T84JkbzV7WHYsa5vTskzqiuq0JkzEA3FfDy0ix5+d12vKo/fP2RCVm6PlXt4VfvajQZ67z1prkohsmyVtdLKaruA0WXvpco4c0dyT9u2o1TxL6kh0vWbgLrK3Hxm2a8/ltcBJe2iQFeK6bAnjXWG3ZLcn+J7qJ1HVokutf+NZBr80fv5Zma7l+NLTHzaapFrm0oK0DK3Wb0kWz8jpLEvzcat4xb0QEa9JGtmblxSYdrO7ZxO7RL31/zPTrOueyUfrgt67WcmgFWfScPv5nvRabCPeXgQspdVbvq3JTxVcYUZGmb8G5u3B+53vc/orv5LfSaGsdDh9mAWv0UrO574Q0XPGvXBo9Sc0ae2lJ+2bLJ9/Q+Vxo1pZl9IsDQd01aNEmJ7MntFDpXOu4+QxuzC1/PeG/HvSk3ymSpQwIAfd9Sft9Hq8/oEYTH7ZNW9JkGY+zFoGLAIHIrTCIMrMg2m/syfCQJr8mL+k9DZJkCYvLm+06MMAERbCIMrkw228zCrCQJo8uA6uWjZJkGY87iPx1n0YSDOOkGkbj04vpIknbI7P6y0J0sQROiHs+Vpdkwbi9FMrR7fVA97jMJr1G6CN5e5MEREDd5DGlmGyEMWN9LakgThtWuUUsogtcmpAu08GtMsmbMVj9FwSRxqI8winPEKXx46YfORsjYA0PFHC11KPnK1GtCmTLqqsGb28gXvcxRnE4T7n0B0aow9FJOLvE1p+frQtLdxfhhTPnUGYhdoGrjXrz6QoRAXSiJnmOTMJQyTflThb1JlWlIVswixoxVlfmwVN/yvbM/xPVmEWNPugt5+NLnzPQ4CGk12YhZ4N9F4zupZvbulFWZhFmAWrExwsru9lGknWzCbMGkt5ophSkjUzC7MmszzTS7LmKMKs2VZQtECHEmTLEYXZ4rW++NBi7HEGYfY4ZYX3MnryEUzGv/vb+hViRPEVAAAAAElFTkSuQmCC)\"></span>"};
        function menuIcon(item,id) {if(!item.find('.lp-settings-icon').length) item.addClass('lp-settings-row').prepend($('<span class="lp-settings-icon" aria-hidden="true"></span>').append(menuIcons[id]));}
        var childMenus = [];
        function param(name, type, label, value, values, description, component, onChange) {
            Lampa.SettingsApi.addParam({ component: component || KEY, param: { name: KEY + '_' + name, type: type, 'default': value, values: values, placeholder: 'Не задано' },
                field: { name: label, description: description || '' }, onChange: onChange });
        }
        function buttonParam(component, name, label, action, description, onRender) {
            Lampa.SettingsApi.addParam({ component: component, param: { name: KEY + '_' + name, type: 'button' },
                field: { name: label, description: description || '' }, onChange: action, onRender: onRender });
        }
        function submenu(id, title, iconId, parentMenu) {
            parentMenu=parentMenu || KEY;
            childMenus.push(id);
            Lampa.SettingsApi.addComponent({ component: id, name: title,
                icon: menuIcons[iconId] || LOGO });
            var returnIndex = 0, returnScroll = null;
            buttonParam(parentMenu, id + '_open', title + ' ›', function () {
                Lampa.Settings.create(id, { onBack: function () { Lampa.Settings.create(parentMenu, { last_index: returnIndex, lamplay_scroll: returnScroll }); } });
            }, '', function (item) {
                menuIcon(item,iconId);item.on('hover:enter', function () {
                    returnIndex = item.parent().find('.selector').index(item);
                    var scroll = item.closest('.scroll')[0];
                    returnScroll = scroll && scroll.Scroll && scroll.Scroll.position ? scroll.Scroll.position() : null;
                });
            });
        }
        var rezkaMenu = KEY + '_rezka_settings', kodikMenu = KEY + '_kodik_settings';
        var libriaMenu = KEY + '_libria_settings', extraMenu = KEY + '_extra_settings';
        var ratingsMenu=KEY+'_ratings_settings';submenu(ratingsMenu,'Рейтинг','rating');
        submenu(extraMenu,'Настройки источников','extra');
        submenu(rezkaMenu,'HDrezka','hdrezka',extraMenu);submenu(kodikMenu,'Kodik','kodik',extraMenu);submenu(libriaMenu,'AniLiberty','anilibria',extraMenu);
        menuIcons.filmix='<svg viewBox="0 0 58 57" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 20.4V45h6.8V34.1h9.9V27h-9.9v-2.6c0-2.8 2.1-4.6 4.4-4.6H39V13H26.8c-3.1 0-6.8 2.5-6.8 7.4Z" fill="currentColor"/><rect x="2" y="2" width="54" height="53" rx="5" stroke="currentColor" stroke-width="4"/></svg>';
        var filmixMenu=KEY+'_filmix_settings';submenu(filmixMenu,'Filmix','filmix',extraMenu);
        menuIcons.veoveo='<svg viewBox="0 0 48 48" fill="none"><path d="M5 12l10 24 10-24M23 12l10 24 10-24" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/></svg>';
        var veoMenu=KEY+'_veoveo_settings';submenu(veoMenu,'VeoVeo','veoveo',extraMenu);
        param('source', 'select', 'Источник по умолчанию', 'rezka', { kodik: 'Kodik', rezka: 'HDrezka', libria: 'AniLiberty', filmix: 'Filmix', cdnvideohub:'CDNvideohub', kinotochka: 'KinoTochka',veoveo:'VeoVeo' });
        param('remember_source', 'trigger', 'Запоминать источник для каждого произведения', true);
        param('quality', 'select', 'Предпочитаемое качество', '1080', { auto: 'Лучшее доступное', '2160': '2160p', '1080': '1080p', '720': '720p', '480': '480p', '360': '360p' });
        param('button_first', 'trigger', 'Кнопка LamPlay всегда первая', true, undefined,
            'Размещать LamPlay перед остальными кнопками просмотра в карточке.', KEY, updateButtons);
        param('card_logo','trigger','Логотип вместо названия в карточке',false,undefined,'Использовать найденный логотип в основной карточке Lampa. Если логотип недоступен, остаётся название.',KEY,updateCardLogos);
        param('prefer_http', 'trigger', 'Предпочитать видеопоток по HTTP', false, undefined,
            'Меняет протокол видеоссылок. Используйте при открытии самой Lampa по HTTP.');
        param('full_episode_title', 'trigger', 'Полный формат названия серии', true, undefined,
            'Сезон, номер и название эпизода в плеере. Название произведения отображается в шапке.');
        buttonParam(KEY, 'clear_source_history', 'Очистить историю источников', function () {
            var history = object(setting('source_history', {})), count = Object.keys(history).length;
            save('source_history', {});
            Lampa.Noty.show('История источников очищена: ' + count + '.');
        }, 'Сбрасывает запомненные источники. История просмотров и таймкоды сохраняются.');

        var authIo = new Transport(Lampa, setting), authSession = new RezkaSession(authIo, setting, save, Lampa);
        var passwordDraft = String(setting('rezka_password', '') || ''), authBusy = false, authStatusNode = null, passwordStatusNode = null;
        function rezkaHost() { return hostSetting(setting('rezka_host', ''), 'https://rezka.ag'); }
        function updateAuthStatus(message) {
            var confirmed=!authBusy && authSession.confirmed(rezkaHost());$('.lp-rezka-settings .lp-auth-dot').toggleClass('lp-auth-confirmed',confirmed).attr('aria-label',confirmed?'Вход подтверждён':'Вход не подтверждён');
            if (authStatusNode) authStatusNode.text(message || authSession.status(rezkaHost()));
            if (passwordStatusNode) passwordStatusNode.text(passwordDraft || 'Не задано');
        }
        function passwordInput(callback) {
            Lampa.Input.edit({ title: 'Пароль HDrezka', value: passwordDraft, free: true,
                nosave: true, password: false }, function (value) {
                passwordDraft = String(value || ''); save('rezka_password', passwordDraft); updateAuthStatus();
                Lampa.Controller.toggle('settings_component');
                if (callback && passwordDraft) callback();
            });
        }
        param('rezka_host', 'input', 'Зеркало', 'https://rezka.ag', '', 'Вход и запросы выполняются непосредственно на этом сайте.', rezkaMenu, function () {
            authIo.clear(); authBusy = false; updateAuthStatus();
        });
        param('rezka_login', 'input', 'Логин или почта', '', '', '', rezkaMenu);
        buttonParam(rezkaMenu, 'rezka_password', 'Пароль', function () { passwordInput(); }, '', function (item) {
            passwordStatusNode = $('<div class="settings-param__value"></div>'); item.append(passwordStatusNode); updateAuthStatus();
        });
        buttonParam(rezkaMenu, 'rezka_signin', 'Войти', function attemptLogin() {
            if (authBusy) return;
            var host = rezkaHost(), login = String(setting('rezka_login', '') || '').trim();
            if (!login) { Lampa.Noty.show('Сначала укажите логин или почту HDrezka.'); return; }
            if (!passwordDraft) { passwordInput(attemptLogin); return; }
            var password = passwordDraft;
            authBusy = true; updateAuthStatus('Выполняется вход…');
            authSession.login(host, login, password, function () {
                authBusy = false; updateAuthStatus(); Lampa.Noty.show('HDrezka: вход подтверждён.');
            }, function (error) {
                authBusy = false; updateAuthStatus(safeError(error)); Lampa.Noty.show(safeError(error));
            });
        });
        buttonParam(rezkaMenu, 'rezka_signout', 'Выйти', function () {
            if (authBusy) return;
            authBusy = true; updateAuthStatus('Выполняется выход…');
            authSession.logout(rezkaHost(), function () {
                authBusy = false; updateAuthStatus(); Lampa.Noty.show('HDrezka: выход подтверждён.');
            }, function (error) { authBusy = false; updateAuthStatus(safeError(error)); Lampa.Noty.show(safeError(error)); });
        });
        buttonParam(rezkaMenu, 'rezka_auth_status', 'Состояние входа', function () { updateAuthStatus(); }, '', function (item) {
            item.addClass('lp-rezka-settings');item.find('.settings-param__name').append('<span class="lp-auth-dot" aria-label="Вход не подтверждён"></span>');authStatusNode = $('<div class="settings-param__descr"></div>'); item.append(authStatusNode); updateAuthStatus();
        });
        param('prefer_mp4', 'trigger', 'Предпочитать поток MP4', true, undefined, '', rezkaMenu);
        param('rezka_fix_stream', 'trigger', 'Фиксация видеопотока', false, undefined,
            'Автоматически корректировать домен видеопотока для Voidboost / Ukrtelcdn.', rezkaMenu);
        param('kodik_host', 'input', 'Адрес API', 'https://kodik-api.com', '', '', kodikMenu);
        param('kodik_token', 'input', 'Свой API-токен', '', '', 'Пусто - подбор через get-player. Свой токен включает поиск через API.', kodikMenu);
        param('libria_host', 'input', 'Адрес API', 'https://aniliberty.top', '', '', libriaMenu);
        var filmixStatusItem=null,filmixTokenItem=null;
        function filmixStatus(profile){
            var u=profile && profile.user, text=u && u.login ? u.login+' - '+(flag(u.is_pro_plus)?'PRO PLUS':flag(u.is_pro)?'PRO':'NO PRO')+(u.pro_date && (flag(u.is_pro_plus)||flag(u.is_pro))?' · '+u.pro_date:''):'Не авторизован';
            save('filmix_status',text);if(filmixStatusItem) filmixStatusItem.find('.settings-param__value').text(text);return text;
        }
        buttonParam(filmixMenu,'filmix_add_device','Добавить устройство на Filmix',function(){
            var network=new Transport(Lampa,setting),provider=new Filmix(network,setting),timer=null,closed=false,inflight=false;
            var modal=$('<div><div class="broadcast__text">Введите код на странице https://filmix.gg/consoles в своём аккаунте Filmix. Не закрывайте это окно до завершения привязки.</div><div class="broadcast__device selector" style="text-align:center">Получаем код…</div></div>');
            function close(){closed=true;clearTimeout(timer);network.clear();Lampa.Modal.close();Lampa.Controller.toggle('settings_component');}
            Lampa.Modal.open({title:'Привязка Filmix',html:modal,onBack:close});
            provider.requestToken(function(data){if(closed)return;modal.find('.broadcast__device').text(data.user_code);
                var expires=Date.now()+Math.max(60000,Math.min(900000,(+data.expire*1000-Date.now())||600000));
                function poll(){if(closed||inflight)return;if(Date.now()>expires){modal.find('.broadcast__device').text('Код истёк. Откройте привязку заново.');return;}inflight=true;
                    provider.profile(function(profile){inflight=false;if(closed)return;if(profile.user && profile.user.login){save('filmix_token',data.code);filmixStatus(profile);if(filmixTokenItem)filmixTokenItem.find('.settings-param__value').text(data.code);close();Lampa.Noty.show('Filmix: устройство привязано');}else timer=setTimeout(poll,10000);},function(){inflight=false;if(!closed)timer=setTimeout(poll,10000);},data.code);
                }timer=setTimeout(poll,1000);
            },function(e){if(!closed)modal.find('.broadcast__device').text(safeError(e));});
        });
        Lampa.SettingsApi.addParam({component:filmixMenu,param:{name:KEY+'_filmix_status',type:'button'},field:{name:'Статус Filmix'},onRender:function(item){filmixStatusItem=item;if(!item.find('.settings-param__value').length)item.append('<div class="settings-param__value"></div>');item.find('.settings-param__value').text(setting('filmix_status','Не авторизован'));}});
        param('filmix_route','select','Подключение Filmix','auto',{auto:'Автоматически',tv:'FilmixTV (HTTPS)',mobile:'Мобильный API'},'В браузере используется FilmixTV с публичными ссылками до 480p. Привязка и качество аккаунта относятся к мобильному API.',filmixMenu);
        param('filmix_hls','select','Обработка HLS Filmix','auto',{auto:'Автоматически',hlsjs:'Программная (HLS.js)',native:'Системная'},'На LG при поддержке MediaSource автоматически используется HLS.js. Если поток не запускается, попробуйте системную обработку.',filmixMenu);
        param('filmix_host','input','Filmix - адрес API','http://filmixapp.cyou','','Адрес сервиса API. Для HTTP-адреса сама Lampa также должна быть открыта по HTTP.',filmixMenu);
        buttonParam(filmixMenu,'filmix_api_mirrors','Выбрать адрес API Filmix',function(){var hosts=['http://filmixapp.cyou','http://filmixapp.vip','http://fxapp.biz'];Lampa.Select.show({title:'Адрес API Filmix',items:hosts.map(function(host){return{title:host,value:host,selected:host===setting('filmix_host','http://filmixapp.cyou')};}),onSelect:function(item){save('filmix_host',item.value);sourceHealth={};Lampa.Noty.show('Адрес Filmix сохранён. Повторно откройте источник.');Lampa.Controller.toggle('settings_component');},onBack:function(){Lampa.Controller.toggle('settings_component');}});},'Альтернативные адреса мобильного API. Смена адреса не снимает ограничения браузера.');
        Lampa.SettingsApi.addParam({component:filmixMenu,param:{name:KEY+'_filmix_token',type:'input',default:'',values:''},field:{name:'Токен устройства Filmix',description:'Сохраняется автоматически после привязки устройства.'},onRender:function(item){filmixTokenItem=item;},onChange:function(){filmixStatus(null);}});
        param('filmix_device_id','input','Идентификатор устройства',setting('filmix_device_id',''),'','Сохраняется между запусками. Для токена укажите связанный с ним идентификатор устройства.',filmixMenu);
        buttonParam(filmixMenu,'filmix_profile','Проверить доступ аккаунта',function(){var network=new Transport(Lampa,setting);new Filmix(network,setting).profile(function(p){Lampa.Noty.show('Filmix: '+filmixStatus(p));},function(e){Lampa.Noty.show(safeError(e));});},'Проверяет токен прямым запросом к API Filmix.');
        param('veoveo_fallback','trigger','Резервный API VeoVeo',true,undefined,'При ошибке автоматически проверяет второй из известных адресов. Пользовательский адрес не заменяется.',veoMenu);
        buttonParam(veoMenu,'veoveo_api_mirrors','Выбрать адрес API VeoVeo',function(){var hosts=['https://api.rstprgapipt.com','https://tazaromikaz.link'];Lampa.Select.show({title:'Адрес API VeoVeo',items:hosts.map(function(h){return{title:h,value:h,selected:h===setting('veoveo_host',hosts[0])};}),onSelect:function(i){save('veoveo_host',i.value);sourceHealth={};Lampa.Noty.show('Адрес VeoVeo сохранён. Повторно откройте источник.');Lampa.Controller.toggle('settings_component');},onBack:function(){Lampa.Controller.toggle('settings_component');}});},'Основной и резервный адреса API. Работа tazaromikaz.link подтверждена на LG.');
        param('veoveo_host','input','VeoVeo - адрес API','https://api.rstprgapipt.com','','Каталог и видео запрашиваются напрямую. В браузере доступ зависит от разрешений API источника.',veoMenu);
        param('kinotochka_host','input','KinoTochka - сайт','https://kinovibe.cc','','Прямые запросы требуют поддержки сайтом CORS либо нативных запросов устройства.',extraMenu);
        param('timeout', 'select', 'Ожидание ответа', '15', { '10': '10 сек.', '15': '15 сек.', '30': '30 сек.' }, '', extraMenu);
        var ratingsModule=createIntegratedRatings();
        param('ratings_enabled','trigger','Включить функцию рейтингов',false,undefined,'Приоритет и окраска рейтингов по всей Lampa.',ratingsMenu,function () {ratingsModule.setEnabled(setting('ratings_enabled',false));});
        function ratingsParam(name,type,title,value,values) {param('ratings_'+name,type,title,value,values,'',ratingsMenu,function () {ratingsModule.refresh();});}
        ratingsParam('priority','select','Приоритет рейтинга','imdb',{imdb:'IMDb',kp:'Кинопоиск',tmdb:'TMDB'});
        ratingsParam('list_color','trigger','Цветной рейтинг в списках',true);
        ratingsParam('full_color','trigger','Цветные рейтинги внутри карточки',true);
        ratingsParam('scale','select','Цветовая шкала','detailed',{detailed:'Подробная - четыре цвета',simple:'Простая - три цвета'});
        buttonParam(ratingsMenu,'ratings_clear','Очистить кэш рейтингов',function () {ratingsModule.clear();},'Оценки хранятся сутки и загружаются через источник метаданных Lampa.');
        ratingsModule.setEnabled(setting('ratings_enabled',false));
        buttonParam(KEY, 'about', 'О плагине', function () {
            Lampa.Noty.show('LamPlay by WaterFAQ · ' + VERSION + ' · Дата версии: ' + RELEASE_DATE + ' · Тестовая версия.');
        },'',function(item){menuIcon(item,'about');});
        $('<style></style>').text('.lamplay[data-view=card] .lamplay__control{min-height:2.3em;padding:.45em .7em}.lamplay[data-view=card] .lp-strip{padding-top:.1em;padding-bottom:.1em}.lp-series[data-view=horizontal] .lp-body-pane,.lp-series[data-view=card] .lp-body-pane{display:flex;align-items:flex-end;padding-bottom:.6em}.lp-series[data-view=horizontal] .lp-episode-info,.lp-series[data-view=card] .lp-episode-info{height:7.8em;flex:none;box-sizing:border-box}@media(max-height:650px){.lp-series[data-view=horizontal] .lp-episode-info,.lp-series[data-view=card] .lp-episode-info{height:7em}}.full-start-new__body.lp-poster-stable{align-items:flex-start!important}.lp-series[data-view=horizontal] .lp-description,.lp-series[data-view=card] .lp-description{height:3.9em}.lp-series[data-view=horizontal] .lp-episode-meta,.lp-series[data-view=card] .lp-episode-meta{min-height:1.3em}.lp-series[data-view=horizontal] .lamplay__item-title,.lp-series[data-view=card] .lamplay__item-title{height:2.4em}.lp-picture{background:rgba(255,255,255,.08)}.lp-auth-dot{display:inline-block;width:.55em;height:.55em;margin-left:.6em;border-radius:50%;background:#ef5350;vertical-align:middle}.lp-auth-dot.lp-auth-confirmed{background:#4caf50}.lamplay__status.lp-error{pointer-events:auto}.lp-retry{display:inline-flex;align-items:center;min-height:2.5em;padding:.35em .7em;margin-left:.5em;border:1px solid currentColor;border-radius:.3em}.lp-drawer{position:absolute;right:0;top:0;bottom:0;width:28em;max-width:42vw;background:rgba(27,29,38,.98);z-index:25;padding:1em;overflow:auto}.lp-drawer-title{font-size:1.4em;margin-bottom:1em}.lp-drawer-item{padding:1em;min-height:3em;display:flex;align-items:center;border-radius:.25em}.lp-drawer-item.focus{background:#fff;color:#111}.lp-original-title{min-height:1.25em}.lp-original-title:empty{opacity:.25}').appendTo('head');
        $('<style></style>').text("/* Shared geometry and readable filter values. */\n.lamplay__control{gap:.35em;overflow:hidden;min-width:0}\n.lp-control-label{flex:none}.lp-control-value{opacity:.72;min-width:0;overflow:hidden;white-space:nowrap;display:block;mask-image:linear-gradient(to right,#000 calc(100% - .8em),transparent);-webkit-mask-image:linear-gradient(to right,#000 calc(100% - .8em),transparent)}\n.lamplay__control.focus .lp-control-value{opacity:.65}.lp-search svg{flex:none}\n.lamplay[data-view=vertical] .lp-side,.lamplay[data-view=results] .lp-side{width:34%;overflow-y:auto;padding:.25em}\n.lamplay[data-view=vertical] .lp-hero,.lamplay[data-view=results] .lp-hero,.lp-series[data-view=horizontal] .lp-top>.lp-hero{width:100%;height:auto;min-height:0;max-height:none;aspect-ratio:16/9;flex:none}\n.lp-series[data-view=horizontal] .lp-top>.lp-hero{width:34%;align-self:flex-start}\n.lp-series[data-view=horizontal] .lp-top{height:auto;min-height:0}\n.lamplay[data-view=vertical] .lp-resume-row,.lamplay[data-view=results] .lp-resume-row,.lp-series[data-view=horizontal] .lp-resume-row{flex-direction:row;align-items:center;gap:.6em;font-size:.9em}\n.lp-resume-row .lp-continue{font-size:.9em;flex-shrink:0;max-width:100%}.lp-resume-info{overflow:hidden}.lp-resume-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n.lp-hero-content{padding:.8em}.lp-title-slot{flex-shrink:1;min-height:0}.lp-title-logo{max-height:100%}\n.lamplay[data-view=vertical] .lp-title-slot,.lamplay[data-view=results] .lp-title-slot,.lp-series[data-view=horizontal] .lp-title-slot{height:2.5em;width:65%}\n.lp-series[data-view=horizontal] .lp-filters{justify-content:space-between;gap:.65em}\n.lp-series[data-view=horizontal] .lp-body-pane,.lp-series[data-view=card] .lp-body-pane{padding:1em .65em .6em}\n.lp-picture{transition:transform .16s ease;transform-origin:center bottom}\n.lp-series[data-view=horizontal] .lp-episode.focus .lp-picture,.lp-series[data-view=card] .lp-episode.focus .lp-picture{transform:scale(1.045)}\n.lp-series[data-view=vertical] .lp-episode{transition:transform .16s ease;transform-origin:center;position:relative;border-color:transparent;outline:none}\n.lp-series[data-view=vertical] .lp-episode.lp-started{box-shadow:0 0 0 1px rgba(255,255,255,.48)}\n.lp-series[data-view=vertical] .lp-episode.focus,.lp-series[data-view=vertical] .lp-episode:focus{background:rgba(0,0,0,.35);color:#fff;border-color:transparent;box-shadow:0 0 0 .16em #fff;transform:scale(1.015);z-index:1}\n.lp-series[data-view=vertical] .lp-episode.focus .lamplay__item-detail{color:rgba(255,255,255,.8)}\n.lp-series[data-view=vertical] .lp-body-pane{padding:.65em}\n\n.lamplay__status.lp-error{position:static;transform:none;max-width:100%;width:100%;align-self:stretch;box-sizing:border-box;margin:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1em;padding:1.5em;text-align:center;box-shadow:none;background:rgba(35,23,27,.85);min-height:9em}\n.lamplay__status.lp-error>span:first-child{max-width:38em;line-height:1.45;overflow-wrap:anywhere}\n.lp-error .lp-retry{margin:0;padding:.65em 1.1em;text-decoration:none;border:2px solid rgba(255,255,255,.65);border-radius:.4em;line-height:1.25;justify-content:center;color:#fff;background:transparent}\n.lamplay .lp-error .lp-retry.focus,.lamplay .lp-error .lp-retry:focus{background:#fff;color:#111;border-color:#fff}\n/* Narrow or shallow windows use document flow, with room for Lampa navigation. */\n@media(max-width:900px),(max-height:500px){\n.lamplay{overflow-y:auto;height:100%;font-size:1em;padding-bottom:6em;box-sizing:border-box}\n.lp-panel{height:auto;min-height:100%;padding:.65em;overflow:visible}\n.lp-main,.lp-side{overflow:visible!important}.lp-body-pane{overflow:visible;flex:none;min-height:0}\n.lp-series[data-view=horizontal] .lp-body-pane,.lp-series[data-view=card] .lp-body-pane{align-items:flex-start;overflow-x:auto;overflow-y:hidden;flex:none;padding:1em .6em}\n.lp-series[data-view=horizontal] .lp-episode,.lp-series[data-view=card] .lp-episode{width:38vw;min-width:11em;max-width:20em}\n.lp-series[data-view=horizontal] .lp-picture,.lp-series[data-view=card] .lp-picture{height:auto;aspect-ratio:16/9}\n.lp-series[data-view=horizontal] .lp-filters{justify-content:flex-start;gap:.7em}\n.lamplay[data-view=card] .lp-resume-row{flex-wrap:wrap}.lamplay[data-view=card] .lp-top{gap:.7em}\n.lamplay[data-view=vertical] .lp-resume-row,.lamplay[data-view=results] .lp-resume-row,.lp-series[data-view=horizontal] .lp-resume-row{flex-wrap:wrap}\n.lamplay[data-view=vertical] .lp-side,.lamplay[data-view=results] .lp-side{width:34%}\n.lp-hero-content{padding:.5em}.lp-hero .lp-continue{font-size:.8em;min-height:2.4em;padding:.35em .5em}\n}\n@media(max-width:600px){\n.lp-panel,.lp-top{flex-direction:column!important;height:auto!important}\n.lamplay[data-view=vertical] .lp-side,.lamplay[data-view=results] .lp-side,.lp-series[data-view=horizontal] .lp-top>.lp-hero{width:100%}\n.lp-hero{aspect-ratio:16/9;min-height:0!important}.lp-main{flex:none;width:100%}\n.lamplay[data-view=vertical] .lp-tools,.lamplay[data-view=results] .lp-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible}\n.lamplay[data-view=vertical] .lp-tools>.lamplay__control{height:2.8em;font-size:1em}\n.lp-series[data-view=vertical] .lp-picture{width:30%;min-width:0;height:auto;aspect-ratio:16/9;align-self:center}\n.lp-series[data-view=vertical] .lp-episode-info{font-size:.85em;padding:.35em;position:relative}\n.lp-series[data-view=vertical] .lp-row-duration{position:static;float:right;margin-left:.5em}\n.lp-series[data-view=horizontal] .lp-episode,.lp-series[data-view=card] .lp-episode{width:68vw;min-width:0}\n.lp-series[data-view=horizontal] .lp-resume-row,.lamplay[data-view=vertical] .lp-resume-row,.lamplay[data-view=results] .lp-resume-row{flex-wrap:nowrap;font-size:1em}\n.lp-series[data-view=horizontal] .lp-hero .lp-continue,.lamplay[data-view=vertical] .lp-hero .lp-continue{font-size:.9em}\n.lamplay[data-view=card] .lp-title-slot{height:auto;min-height:2.8em}.lamplay[data-view=card] .lp-title-logo{max-height:3em}\n}\n.lp-control-value{mask-image:none;-webkit-mask-image:none}.lp-control-value.lp-clipped{mask-image:linear-gradient(to right,#000 calc(100% - .8em),transparent);-webkit-mask-image:linear-gradient(to right,#000 calc(100% - .8em),transparent)}\n.lamplay[data-view=vertical] .lp-side,.lamplay[data-view=results] .lp-side{padding:0}\n").appendTo('head');
        $('<style id="lamplay-090-style"></style>').text([
            '.lp-vignette{position:fixed;inset:0;z-index:0;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,.82),rgba(0,0,0,.22) 35%,transparent 65%),linear-gradient(0deg,rgba(0,0,0,.85),rgba(0,0,0,.12) 60%),radial-gradient(ellipse at 57% 40%,transparent 28%,rgba(0,0,0,.46) 100%)}',
            '.lp-vignette-edge{position:absolute;top:0;bottom:0;background:linear-gradient(90deg,#000,rgba(0,0,0,.35) 18%,transparent 42%)}',
            '',
            '.lamplay[data-view=horizontal] .lp-hero-content,.lamplay[data-view=vertical] .lp-hero-content{padding:.65em!important;gap:.4em;justify-content:flex-end}',
            '.lamplay[data-view=horizontal] .lp-title-slot,.lamplay[data-view=vertical] .lp-title-slot{height:2.5em;width:65%;max-width:14em;align-self:flex-start;justify-content:flex-start}',
            '.lamplay[data-view=horizontal] .lp-title-logo,.lamplay[data-view=vertical] .lp-title-logo{width:auto;height:100%;max-height:100%;max-width:100%;object-fit:contain;object-position:left center;align-self:flex-start}',
            '.lamplay[data-view=horizontal] .lp-resume-row,.lamplay[data-view=vertical] .lp-resume-row{flex-direction:row;align-items:center;font-size:.9em;gap:.6em}',
            '.lamplay[data-view=horizontal] .lp-resume-info,.lamplay[data-view=vertical] .lp-resume-info{font-size:.9em;line-height:1.25;flex:1}',
            '.lamplay[data-view=horizontal] .lp-resume-detail,.lamplay[data-view=vertical] .lp-resume-detail{font-size:.86em}',
            '.lamplay[data-view=horizontal] .lp-continue,.lamplay[data-view=vertical] .lp-continue{font-size:.9em}',
            '.lamplay__status.lp-error{background:transparent!important;border:0!important;border-radius:0;box-shadow:none!important}',
            '.lp-series[data-view=horizontal] .lp-body-pane,.lp-series[data-view=card] .lp-body-pane{padding:1.35em .85em .65em;scroll-behavior:auto}',
            '.lp-series[data-view=horizontal] .lp-episode,.lp-series[data-view=card] .lp-episode{padding-top:.6em;overflow:visible}',
            '.lp-series[data-view=horizontal] .lp-episode.lp-started .lp-picture,.lp-series[data-view=card] .lp-episode.lp-started .lp-picture{outline:2px solid rgba(255,255,255,.65);outline-offset:2px}',
            '.lp-series[data-view=vertical] .lp-episode.lp-started{box-shadow:0 0 0 2px rgba(255,255,255,.65)}',
            '.lp-series[data-view=horizontal] .lp-episode.focus .lp-picture,.lp-series[data-view=card] .lp-episode.focus .lp-picture{outline:.17em solid white;outline-offset:.17em}',
            '.lp-series[data-view=vertical] .lp-episode.focus{box-shadow:0 0 0 .16em white}',
            '.lp-unavailable .lp-picture{background:rgba(255,255,255,.025)}.lp-unavailable .lp-picture img{opacity:.28}.lp-unavailable .lp-episode-info{color:rgba(255,255,255,.58)}',
            '.lp-unavailable-number{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.7em;font-weight:400;color:rgba(255,255,255,.48);z-index:1}',
            '.lp-availability{font-size:.78em;line-height:1.35;margin-top:.4em}.lp-unavailable .lp-episode-meta{color:rgba(255,255,255,.5)}',
            '@media(max-width:900px),(max-height:500px){.lamplay[data-view=horizontal] .lp-hero-content,.lamplay[data-view=vertical] .lp-hero-content{padding:.5em!important}.lamplay[data-view=horizontal] .lp-resume-row,.lamplay[data-view=vertical] .lp-resume-row{flex-wrap:wrap}}',
            '@media(max-width:600px){.lamplay[data-view=horizontal] .lp-resume-row,.lamplay[data-view=vertical] .lp-resume-row{font-size:1em;flex-wrap:nowrap}}'
        ].join('\n')).appendTo('head');
        $('<style id="lamplay-010-style"></style>').text([
            '.lp-vignette-bottom{position:absolute;left:0;right:0;bottom:0;pointer-events:none}',
            '.lp-series[data-view=horizontal] .lp-body-pane,.lp-series[data-view=card] .lp-body-pane{align-items:flex-start;padding-top:1.3em;padding-bottom:1.2em}',
            '.lp-series[data-view=horizontal] .lamplay__items,.lp-series[data-view=card] .lamplay__items{margin-top:auto;flex-shrink:0;padding-top:.5em;padding-bottom:.3em}',
            '.lp-series[data-view=horizontal] .lp-episode-info,.lp-series[data-view=card] .lp-episode-info{height:8.9em;min-height:8.9em}',
            '.lp-series[data-view=horizontal] .lp-unavailable .lp-episode-info,.lp-series[data-view=card] .lp-unavailable .lp-episode-info{height:auto;min-height:0;overflow:visible}',
            '.lp-series[data-view=horizontal] .lp-unavailable .lamplay__item-title,.lp-series[data-view=card] .lp-unavailable .lamplay__item-title{height:auto;min-height:0;margin-top:.2em}',
            '.lp-unavailable .lp-picture{background:transparent}.lp-unavailable .lp-picture:after{display:none}.lp-unavailable .lp-progress{background:rgba(255,255,255,.28)}.lp-unavailable .lp-progress i{width:0!important}',
            '.lp-unavailable .lamplay__item-title{color:rgba(255,255,255,.58)}.lp-unavailable .lp-availability{color:rgba(255,255,255,.5)}',
            '.lp-series[data-view=horizontal] .lp-unavailable.focus .lp-picture,.lp-series[data-view=card] .lp-unavailable.focus .lp-picture,.lp-series[data-view=horizontal] .lp-unavailable:focus .lp-picture,.lp-series[data-view=card] .lp-unavailable:focus .lp-picture{outline-color:rgba(255,255,255,.45)}',
            '.lp-series[data-view=vertical] .lp-unavailable,.lp-series[data-view=vertical] .lp-unavailable.focus{background:transparent}',
            '.lp-series[data-view=vertical] .lp-unavailable.focus,.lp-series[data-view=vertical] .lp-unavailable:focus{box-shadow:0 0 0 .16em rgba(255,255,255,.45)}',
            '.lamplay[data-view=vertical] .lp-unavailable .lp-episode-meta{display:flex;align-items:center;flex-wrap:wrap;gap:.45em}.lamplay[data-view=vertical] .lp-unavailable .lp-availability{margin:0 0 0 auto;text-align:right;font-size:1em}',
            '.lp-source-dot{display:inline-block;width:.55em;height:.55em;border-radius:50%;margin-left:.65em;background:#999;vertical-align:middle}.lp-source-dot[data-state=ok]{background:#4caf50}.lp-source-dot[data-state=error]{background:#ef5350}',
            '.lp-strip,.lp-tools{scroll-behavior:auto}',
            '.lp-series[data-view=horizontal] .lp-body-pane,.lp-series[data-view=card] .lp-body-pane{overflow-y:auto}',
            '.lp-series[data-view=horizontal] .lp-episode,.lp-series[data-view=card] .lp-episode{flex-shrink:0}',
            '.lp-unavailable-heading{display:flex;align-items:baseline;justify-content:space-between;gap:.5em;min-width:0}.lp-unavailable-heading .lamplay__item-title{flex:1;min-width:0}.lp-unavailable-heading .lp-air-date{flex:none;font-size:.72em;white-space:nowrap}',
            '.lamplay[data-view=vertical] .lp-unavailable .lp-episode-meta{width:100%;padding-right:0}.lamplay[data-view=vertical] .lp-unavailable .lp-availability{flex:1;text-align:right;white-space:nowrap}',
            '.lp-series[data-view=horizontal] .lp-episode-info,.lp-series[data-view=card] .lp-episode-info{height:7.8em;min-height:7.8em;overflow:visible}.lp-series[data-view=horizontal] .lp-description,.lp-series[data-view=card] .lp-description{height:3.3em;overflow:hidden}',

            '@media(min-width:901px) and (max-height:650px){.lp-series[data-view=horizontal] .lp-episode-info,.lp-series[data-view=card] .lp-episode-info{height:7em;min-height:7em}.lp-series[data-view=horizontal] .lp-description,.lp-series[data-view=card] .lp-description{height:2.6em;-webkit-line-clamp:2}}',
            '@media(max-height:650px){.lp-series[data-view=horizontal] .lp-episode-info,.lp-series[data-view=card] .lp-episode-info{font-size:.8em}}'
        ].join('\n')).appendTo('head');
        $('<style id="lamplay-012-style"></style>').text([
            '.lp-series[data-view=horizontal] .lp-episode-info,.lp-series[data-view=card] .lp-episode-info{height:auto;min-height:0;display:flex;flex-direction:column;overflow:visible;padding-bottom:.25em}',
            '.lp-series[data-view=horizontal] .lp-description,.lp-series[data-view=card] .lp-description{height:3.9em;min-height:3.9em;max-height:3.9em;flex:none;line-height:1.3;-webkit-line-clamp:3;margin-top:.3em}',
            '.lp-series[data-view=horizontal] .lp-episode-info>.lamplay__item-title,.lp-series[data-view=card] .lp-episode-info>.lamplay__item-title{height:2.3em;min-height:2.3em;line-height:1.15;flex:none;margin-bottom:0}',
            '.lp-series[data-view=horizontal] .lp-body-pane,.lp-series[data-view=card] .lp-body-pane{padding-top:.8em;padding-bottom:1em}',
            '.lp-series[data-view=horizontal] .lamplay__items,.lp-series[data-view=card] .lamplay__items{margin-top:0}',
            '.lamplay[data-view=results] .lp-hero-content{padding:.65em;gap:.4em;justify-content:flex-end}',
            '.lamplay[data-view=results] .lp-title-slot{height:2.5em;width:65%;max-width:14em;align-self:flex-start;justify-content:flex-start}',
            '.lamplay[data-view=results] .lp-title-logo{width:auto;height:100%;max-height:100%;max-width:100%;object-fit:contain;object-position:left center}',
            '.player-panel .player-next.lp-next-action{pointer-events:auto;cursor:pointer}.player-panel .player-next.lp-next-action.focus{outline:2px solid currentColor;outline-offset:3px}'
        ].join('\n')).appendTo('head');

        $('<style id="lamplay-013-style"></style>').text([
            '.lamplay:not([data-view=results]) .lp-panel{padding-bottom:0}.lamplay:not([data-view=results]) .lp-main{overflow:visible}',
            '.lamplay:not([data-view=results]) .lp-strip,.lamplay:not([data-view=results]) .lp-tools{padding-right:.25em}',
            '.lp-series[data-view=horizontal] .lp-body-pane,.lp-series[data-view=card] .lp-body-pane{padding-top:.65em;padding-bottom:.65em}',
            '.lp-series[data-view=horizontal] .lp-episode-info>.lamplay__item-title,.lp-series[data-view=card] .lp-episode-info>.lamplay__item-title{height:auto;min-height:1.15em;max-height:2.3em;margin:0}',
            '.lp-series[data-view=horizontal] .lp-description,.lp-series[data-view=card] .lp-description{height:3.9em;min-height:3.9em;max-height:3.9em;margin-top:.25em;-webkit-line-clamp:3;line-height:1.3}',
            '.lamplay[data-view=card] .lp-top{gap:.25em}.lamplay[data-view=card] .lp-filters{gap:.25em}',
            '.lp-series.lp-tight .lp-panel{padding-top:.65em;gap:.35em}.lp-series.lp-tight .lp-filters{gap:.35em}.lp-series.lp-tight .lp-body-pane{padding-top:.4em;padding-bottom:.4em}',
            '.lp-series.lp-tight[data-view=card] .lp-hero-content{height:4em;gap:.2em}.lp-series.lp-tight[data-view=card] .lp-title-slot{height:2.3em}.lp-series.lp-tight[data-view=card] .lp-filters{font-size:.78em;gap:.25em}.lp-series.lp-tight[data-view=card] .lamplay__control{min-height:2.3em;padding:.35em .7em}.lp-series.lp-tight[data-view=card] .lp-caption{margin-bottom:.15em}',
            '.lp-series.lp-tight .lp-panel{padding-top:.4em;gap:.25em}.lp-series.lp-tight .lp-body-pane{padding-top:.3em}.lp-series.lp-tight .lamplay__items{padding-top:0}.lp-series.lp-tight .lp-episode{padding-top:.4em}.lp-series.lp-tight .lp-episode-info{padding-top:.2em}',
            '.lp-series[data-view=vertical] .lp-skeleton .lp-episode-info{max-height:6.3em;overflow:hidden}',
            '.lp-series[data-view=horizontal] .lp-episode.lp-started:not(.focus):not(:focus) .lp-picture,.lp-series[data-view=card] .lp-episode.lp-started:not(.focus):not(:focus) .lp-picture{outline-offset:0}',
            '.lp-series[data-view=vertical] .lp-episode{padding:0;border-width:0;overflow:visible;border-radius:.45em}',
            '.lp-series[data-view=vertical] .lp-episode .lp-picture{height:auto;align-self:stretch;width:11.2em;min-width:11.2em;border-radius:.45em 0 0 .45em}',
            '.lp-series[data-view=vertical] .lp-body-pane{padding-bottom:.65em}',
            '.player-panel .player-next.lp-next-action{border-radius:1em;outline:0;outline-offset:0;box-shadow:none;overflow:hidden}',
            '.player-panel .player-next.lp-next-action .player-next__episode{align-items:stretch}',
            '.player-panel .player-next.lp-next-action .player-next__thumbnail{margin:0;flex:none;border-radius:1em;overflow:hidden}',
            '.player-panel .player-next.lp-next-action .player-next__thumbnail-img{border-radius:0}',
            '.player-panel .player-next.lp-next-action .player-next__body{margin:0;padding:.35em 1em;align-self:center}',
            '.player-panel .player-next.lp-next-action.focus{outline:0;outline-offset:0;box-shadow:0 0 0 2px currentColor;background:rgba(255,255,255,.14)}',
            '@media(max-width:600px){.lp-series[data-view=vertical] .lp-episode .lp-picture{width:30%;min-width:0}}'
        ].join('\n')).appendTo('head');

        $('<style id="lamplay-014-style"></style>').text(".lp-scroll{scroll-behavior:auto}\n.lp-picture,.lp-series[data-view=vertical] .lp-episode{transition:transform .26s cubic-bezier(.4,0,.2,1)}\n.lp-loader{height:3px;min-height:3px;position:relative;overflow:hidden;flex:none;opacity:0;pointer-events:none}\n.lp-loader i{display:block;position:absolute;width:26%;height:100%;background:rgba(255,255,255,.8);border-radius:2px}\n.lp-loading .lp-loader{opacity:1}.lp-loading .lp-loader i{animation:lp-loading-run 1.6s ease-in-out infinite}\n@keyframes lp-loading-run{0%{left:-28%}100%{left:102%}}\n.lamplay .lamplay__status.lp-busy{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);background:none}\n.lp-skeleton .lp-picture,.lp-skeleton-line,.lp-loading-group .lamplay__control{position:relative;overflow:hidden}\n.lp-skeleton .lp-picture:before,.lp-skeleton-line:before,.lp-loading-group .lamplay__control:before{content:'';position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent);animation:lp-shimmer 1.8s ease-in-out infinite}\n@keyframes lp-shimmer{to{transform:translateX(100%)}}\n.lp-episode:not(.lp-skeleton){animation:lp-ready .16s ease-out}\n@keyframes lp-ready{from{opacity:.35}to{opacity:1}}\n.lp-search .lp-control-value{flex:1;white-space:nowrap;overflow:hidden;min-width:0;display:block;padding-right:.2em}\n.lamplay:not([data-view=card]):not([data-view=results]) .lp-hero .lp-title-slot{width:100%;max-width:100%;justify-content:center}\n.lamplay:not([data-view=card]):not([data-view=results]) .lp-hero .lp-title-logo{transform:scale(.7);transform-origin:center;object-position:center}\n.lamplay.lp-film[data-view=card] .lp-panel{flex-direction:row}\n.lamplay.lp-film[data-view=card] .lp-side,.lamplay.lp-film[data-view=card] .lp-main{display:flex}\n.lamplay.lp-film[data-view=card] .lp-side{width:34%;flex:none;padding:0}\n.lamplay.lp-film[data-view=card] .lp-main{flex:1;min-height:0;min-width:0}\n.lamplay.lp-film[data-view=card] .lp-tools{flex-direction:column}\n.lamplay.lp-film[data-view=card] .lp-tools>.lamplay__control{height:2.8em;min-height:2.8em;padding:.4em .8em}\n.lamplay.lp-film[data-view=card] .lp-hero{width:100%;aspect-ratio:16/9;height:auto;min-height:0;max-height:none;flex:none;background:none}\n.lamplay.lp-film[data-view=card] .lp-hero-content{position:absolute;height:100%;padding:.8em;justify-content:flex-end;gap:.4em}\n.lamplay.lp-film[data-view=card] .lp-title-slot{height:2.5em;width:100%;max-width:100%}\n.lamplay.lp-film[data-view=card] .lp-title-logo{max-height:100%;max-width:70%;object-position:center}\n.lamplay.lp-film[data-view=card] .lp-resume-row{font-size:.9em;gap:.6em;flex-direction:row}\n.lamplay.lp-film .lp-continue{border:0;border-radius:.4em;background:transparent;padding:.35em .25em;min-height:2.65em;width:100%;align-items:center;text-align:left;gap:.65em}\n.lamplay.lp-film .lp-continue.focus{background:rgba(255,255,255,.12);color:white;box-shadow:0 0 0 2px rgba(255,255,255,.75)}\n.lamplay.lp-film .lp-continue .lp-play{width:1.05em;height:1.05em;flex:none}\n.lamplay.lp-film .lp-resume-info{flex:1;max-width:none;font-size:.9em}\n.lamplay.lp-film .lp-resume-progress{width:100%;flex:none}\n.lamplay.lp-film .lp-episode>.lp-picture{display:none!important}\n.lamplay.lp-film .lp-episode{padding:.7em .85em;gap:0;min-height:5.9em;position:relative;border:0;outline:none;overflow:hidden;background:rgba(0,0,0,.35)}\n.lamplay.lp-film .lp-episode.focus,.lamplay.lp-film .lp-episode:focus{background:rgba(255,255,255,.15);color:white;box-shadow:inset 0 0 0 2px rgba(255,255,255,.75)}\n.lamplay.lp-film .lp-episode-info{padding:0;display:flex;flex-direction:column;gap:.28em;position:relative;min-height:4.5em;width:100%}\n.lamplay.lp-film .lp-episode-info>.lamplay__item-title{padding-right:6.5em;line-height:1.2;min-height:1.2em;max-height:2.4em}\n.lamplay.lp-film .lp-row-duration{position:absolute;right:0;top:0;font-size:.8em;line-height:1.5;float:none}\n.lamplay.lp-film .lp-episode-info>.lp-progress{position:static;display:block;width:100%;flex:none;margin:.12em 0 0;background:rgba(255,255,255,.28);height:.22em;min-height:3px}\n.lamplay.lp-film .lp-episode-info>.lp-progress i{background:rgba(255,255,255,.9)}\n.lamplay.lp-film .lp-watched{margin:0;font-size:.76em;line-height:1.3;color:rgba(255,255,255,.8)}\n.lp-film-caption{font-size:.78em;line-height:1.3;margin:0;color:rgba(255,255,255,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.lp-stream-info{font-size:.76em;line-height:1.3;min-height:1.3em;text-align:right;margin-top:0;flex:none;font-weight:600}\n.lamplay.lp-film .lp-skeleton .lp-episode-info{height:4.5em;min-height:4.5em;gap:.28em;justify-content:flex-start}\n.lamplay.lp-film .lp-skeleton-line{margin:.15em 0}\nbody.lp-card-background .lp-vignette{opacity:.32}\nbody.lp-card-background .lp-vignette-edge{background:linear-gradient(90deg,rgba(0,0,0,.35),transparent 30%,transparent 80%,rgba(0,0,0,.15))}\nbody.lp-card-background .lp-vignette-bottom{background:linear-gradient(transparent,rgba(0,0,0,.28))}\n\n@media(max-width:600px){.lamplay.lp-film[data-view=card] .lp-side{width:100%}.lamplay.lp-film[data-view=card] .lp-main{flex:none;width:100%}.lamplay.lp-film[data-view=card] .lp-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.lamplay.lp-film[data-view=card] .lp-hero{min-height:0}.lamplay.lp-film .lp-episode{padding:.65em}}\n@media(prefers-reduced-motion:reduce){.lp-loading .lp-loader i,.lp-skeleton .lp-picture:before,.lp-skeleton-line:before,.lp-episode{animation:none}.lp-picture,.lp-episode{transition:none}}\n").appendTo('head');

        $('<style></style>').text('.lp-series.lp-tight[data-view=card] .lp-panel{gap:.1em;padding-top:.25em}.lp-film-footer{display:flex;gap:.7em;align-items:center;margin-top:auto;min-width:0}.lp-film-caption{min-width:0;flex:1}.lamplay.lp-film .lp-resume-row{min-height:2.9em}').appendTo('head');
        $('<style id="lamplay-015-style"></style>').text("\n.head__title .lp-header-logo{display:inline-block;width:1.05em;height:1.05em;vertical-align:-.12em;margin-right:.35em}\n.lamplay.lp-film[data-view=card] .lp-title-slot{justify-content:center}\n/* Movie headers use the real content height; no empty cover rectangle in Showcase. */\n.lamplay.lp-film[data-view=card] .lp-hero{aspect-ratio:auto;height:auto;min-height:0}\n.lamplay.lp-film[data-view=card] .lp-hero-content{position:relative;inset:auto;height:auto;justify-content:flex-start;padding:.4em .65em .6em;gap:.6em}\n.lamplay.lp-film[data-view=card] .lp-title-slot{height:2.5em;flex:none}\n.lamplay.lp-film .lp-resume-row{min-height:2em;font-size:1em;flex:none}\n.lamplay.lp-film .lp-hero .lp-continue{font-size:1em;min-height:0;padding:.25em 0;justify-content:center;gap:.65em}\n.lamplay.lp-film .lp-hero .lp-resume-info{flex:0 1 auto;font-size:1em;text-align:center;overflow:hidden}\n.lamplay.lp-film .lp-hero .lp-resume-detail{font-size:1em;line-height:1.3}\n.lamplay.lp-film .lp-hero .lp-resume-title:empty{display:none}\n.lamplay.lp-film[data-view=vertical] .lp-hero-content{padding-bottom:.6em!important}\n.lamplay.lp-film .lp-main{position:relative;gap:0}\n.lamplay.lp-film .lp-main>.lp-filters:empty{display:none}\n.lamplay.lp-film .lp-main>.lp-loader{position:absolute;top:0;left:.65em;right:.65em;z-index:3}\n.lamplay.lp-film .lp-body-pane{padding-top:0;padding-bottom:0}\n").appendTo('head');
        var settingsObserver = null;
        function arrangeSettings(body) {
            childMenus.forEach(function (id) {
                var child = body.find('[data-component="' + id + '"]');
                if (child.css('display') !== 'none') child.hide();
            });
            var item = body.find('[data-component="' + KEY + '"]').first();
            if (!item.length) return;
            var visible = item.parent().children('[data-component]').filter(function () {
                return this !== item[0] && childMenus.indexOf($(this).attr('data-component')) < 0 && $(this).css('display') !== 'none';
            });
            if (visible.length) {
                // Insert after the first visible item only when not already second.
                var first = visible.first();
                if (first[0].nextElementSibling !== item[0]) first.after(item);
            } else if (item.parent().children().first()[0] !== item[0]) item.parent().prepend(item);
        }
        Lampa.Settings.listener.follow('open', function (event) {
            if (settingsObserver) { settingsObserver.disconnect(); settingsObserver = null; }
            if(event.name===KEY)updateAuthStatus();
            if ((event.name === KEY || childMenus.indexOf(event.name)>=0) && event.params && event.params.last_index !== undefined) {
                var expected = event.body;
                var restore = function () {
                    if (!expected[0] || !root.document.documentElement.contains(expected[0])) return;
                    var target = expected.find('.selector').eq(event.params.last_index);
                    var element = expected.is('.scroll') ? expected[0] : expected.closest('.scroll')[0];
                    var scroll = element && element.Scroll;
                    if (scroll && event.params.lamplay_scroll !== null && event.params.lamplay_scroll !== undefined && scroll.position && scroll.shift) {
                        scroll.shift(scroll.position() - event.params.lamplay_scroll);
                    } else if (scroll && target.length) {
                        if (scroll.immediate) scroll.immediate(target, true); else scroll.update(target, true);
                    } else if (target.length && element) keepVisible(element, target[0]);
                };
                // The settings controller focuses before layout/height is applied.
                // Restore after that layout, rather than merely restoring the focus index.
                setTimeout(function () { if (root.requestAnimationFrame) root.requestAnimationFrame(restore); else restore(); }, 0);
            }
            if (event.name === 'main') {
                arrangeSettings(event.body);
                var item = event.body.find('[data-component="' + KEY + '"]').first();
                if (root.MutationObserver && item.parent().length) {
                    settingsObserver = new root.MutationObserver(function () { arrangeSettings(event.body); });
                    settingsObserver.observe(item.parent()[0], { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] });
                }
            }
            if (event.name === rezkaMenu) updateAuthStatus();
        });
        Lampa.Settings.listener.follow('close', function () {
            if (settingsObserver) { settingsObserver.disconnect(); settingsObserver = null; }
        });
        $('<style id="lamplay-019-style"></style>').text("\n.lamplay.lp-series{--lp-inset:.9em;--lp-column:32%;--lp-caption-gap:.5em}\n.lamplay.lp-series .lp-panel{padding-left:var(--lp-inset);padding-right:var(--lp-inset);gap:var(--lp-inset)}\n.lamplay.lp-series .lp-strip,.lamplay.lp-series .lp-tools{padding:0;overflow-x:auto;overflow-y:hidden;scroll-padding:.18em}\n.lamplay.lp-series .lp-strip-group{min-width:0}\n.lamplay.lp-series .lp-caption{margin-bottom:var(--lp-caption-gap)}\n.lamplay.lp-series .lp-count-control{display:flex;flex-direction:column;align-items:flex-start;gap:.2em;height:auto;min-height:3.4em}\n.lamplay.lp-series .lp-strip .lamplay__control{box-sizing:border-box;border:0;outline:none}.lamplay.lp-series .lp-strip .lamplay__control.focus{box-shadow:inset 0 0 0 2px #fff}\n.lp-count{font-size:.76em;line-height:1.2;min-height:1.2em;opacity:.8}\n.lamplay.lp-series[data-view=vertical] .lp-side{width:var(--lp-column);padding:0}\n.lamplay.lp-series[data-view=vertical] .lp-side .lp-tools{width:100%;padding:0;overflow:visible}\n.lamplay.lp-series[data-view=vertical] .lp-main{overflow:hidden}\n.lamplay.lp-series[data-view=vertical] .lp-episode.lp-started{box-shadow:inset 0 0 0 1px rgba(255,255,255,.48)}\n.lamplay.lp-series[data-view=vertical] .lp-episode.focus,.lamplay.lp-series[data-view=vertical] .lp-episode:focus{box-shadow:inset 0 0 0 .16em #fff}\n.lamplay.lp-series[data-view=vertical] .lp-body-pane{padding-left:0;padding-right:0}\n.lamplay.lp-series[data-view=vertical] .lp-filters{padding-left:0;padding-right:0}\n.lamplay.lp-series[data-view=vertical] .lp-hero,.lamplay.lp-series[data-view=horizontal] .lp-top>.lp-hero{width:100%;height:auto;aspect-ratio:16/9;min-height:0;max-height:none}\n.lamplay.lp-series[data-view=horizontal] .lp-top{gap:var(--lp-inset);align-items:stretch}\n.lamplay.lp-series[data-view=horizontal] .lp-top>.lp-hero{width:var(--lp-column);flex:none}\n.lamplay.lp-series[data-view=horizontal] .lp-filters{gap:.6em;justify-content:space-between}\n.lamplay.lp-series[data-view=horizontal] .lp-top{min-height:13.5em}\n.lamplay.lp-series[data-view=vertical] .lp-hero,.lamplay.lp-series[data-view=horizontal] .lp-top>.lp-hero{min-height:13.5em}\n.lamplay.lp-series[data-view=card] .lp-hero-content{padding-left:0;padding-right:0}\n.lamplay.lp-series[data-view=card] .lp-filters{gap:.7em;justify-content:flex-start}\n.lamplay.lp-series[data-view=card] .lp-top{gap:.7em}\n.lamplay.lp-series[data-view=horizontal] .lp-episode,.lamplay.lp-series[data-view=card] .lp-episode{padding-left:0;padding-right:0;min-width:0}\n.lamplay.lp-series[data-view=horizontal] .lp-body-pane,.lamplay.lp-series[data-view=card] .lp-body-pane{padding-top:.18em;align-items:flex-start}\n.lamplay.lp-series[data-view=horizontal] .lp-panel,.lamplay.lp-series[data-view=card] .lp-panel{row-gap:.35em}\n.lamplay.lp-series[data-view=horizontal] .lamplay__items,.lamplay.lp-series[data-view=card] .lamplay__items{padding-top:0;padding-bottom:0}\n.lamplay.lp-series[data-view=horizontal] .lp-episode,.lamplay.lp-series[data-view=card] .lp-episode{padding-top:.18em;padding-bottom:.18em}\n.lamplay.lp-series[data-view=horizontal] .lp-episode-info,.lamplay.lp-series[data-view=card] .lp-episode-info{height:7.8em;min-height:7.8em;overflow:hidden}\n.lamplay.lp-series[data-view=card] .lp-top{padding-bottom:.4em}\n.lamplay.lp-series .lp-loader{position:relative;top:auto;left:auto;right:auto;min-height:3px;margin:0;flex:none;z-index:0}\n.lp-series .lp-no-episode-meta .lp-episode-meta{display:none}\n.lp-series .lp-no-episode-meta .lp-episode-info{padding-top:.3em}\n.lamplay__status.lp-empty{background:rgba(35,23,27,.65)}\n@media(max-width:600px){.lamplay.lp-series[data-view=horizontal] .lp-top>.lp-hero,.lamplay.lp-series[data-view=vertical] .lp-side{width:100%}.lamplay.lp-series[data-view=horizontal] .lp-top{min-height:0}}\n").appendTo('head');
        $('<style id="lamplay-018-style"></style>').text("/* Focus changes only decoration, never the geometry or raster scale of episode content. */\n.lamplay.lp-series[data-view] .lp-episode,.lamplay.lp-series[data-view] .lp-episode.focus,.lamplay.lp-series[data-view] .lp-episode:focus,.lamplay.lp-series[data-view] .lp-episode .lp-picture,.lamplay.lp-series[data-view] .lp-episode.focus .lp-picture,.lamplay.lp-series[data-view] .lp-episode:focus .lp-picture{transform:none}\n.lamplay.lp-series[data-view] .lp-episode,.lp-series .lp-picture{transition:background-color .16s ease}\n.lp-series[data-view=horizontal] .lp-episode.focus .lp-picture,.lp-series[data-view=card] .lp-episode.focus .lp-picture,.lp-series[data-view=horizontal] .lp-episode:focus .lp-picture,.lp-series[data-view=card] .lp-episode:focus .lp-picture{outline:.17em solid #fff;outline-offset:0;box-shadow:none}\n.lp-series[data-view=horizontal] .lp-episode.lp-unavailable.focus .lp-picture,.lp-series[data-view=card] .lp-episode.lp-unavailable.focus .lp-picture,.lp-series[data-view=horizontal] .lp-episode.lp-unavailable:focus .lp-picture,.lp-series[data-view=card] .lp-episode.lp-unavailable:focus .lp-picture{outline-color:rgba(255,255,255,.45)}\n.lamplay.lp-series[data-view] .lp-episode .lp-progress i,.lamplay.lp-series[data-view] .lp-episode.focus .lp-progress i,.lamplay.lp-series[data-view] .lp-episode:focus .lp-progress i{background:#fff}\n.lamplay[data-view=results] .lp-main{padding-top:0}\n.lamplay[data-view=results] .lp-main{position:relative}\n.lamplay[data-view=results] .lp-loader{position:absolute;top:0;left:0;right:0;z-index:3}\n.lamplay[data-view=results] .lp-body-pane{padding-top:0}\n.lamplay[data-view=results] .lp-result.focus,.lamplay[data-view=results] .lp-result:focus{background:rgba(255,255,255,.15);color:#fff;border-color:transparent;outline:none;box-shadow:inset 0 0 0 2px rgba(255,255,255,.75)}\n.lamplay[data-view=results] .lp-result.focus .lamplay__item-detail,.lamplay[data-view=results] .lp-result:focus .lamplay__item-detail{color:rgba(255,255,255,.8)}\n").appendTo('head');
    }
    function start() { install(root.Lampa, root.jQuery || root.$); }
    if (root.Lampa) {
        if (root.appready) start();
        else root.Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
    }
})(typeof window !== 'undefined' ? window : globalThis);
