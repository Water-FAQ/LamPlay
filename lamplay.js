/* LamPlay by WaterFAQ — 0.4.0 (experimental)
 * Independent Lampa plugin. Direct connections only; no proxy or remote code execution.
 * Providers: Kodik, HDrezka, AniLibria / AniLiberty.
 */
(function (root) {
    'use strict';
    var VERSION = '0.4.0';
    var KEY = 'lamplay';
    var NAME = 'LamPlay';
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
    function qualityNumber(label) { return /4k/i.test(label) ? 2160 : parseInt(label, 10) || 0; }

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
            if (value && /^(kodik|rezka|libria)$/.test(value.source)) result[id] = { source: value.source, time: +value.time || 0 };
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
            var target = hostSetting(settings('rezka_stream_host', ''), 'https://femeretes.org');
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
                return fail(new Error('Lampa открыта по HTTPS, а источник — по HTTP. Укажите HTTPS-адрес источника.'));
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
                if (key !== 'onHeaders' && key !== 'browserRequest') params[key] = extra[key];
            });
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
                    'Не удалось выполнить прямой запрос. Возможны CORS, ошибка TLS или недоступность источника.';
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
            items.push({ id: url, url: url, title: text(card.querySelector('.enty')) || text(link), year: year ? year[0] : '', description: info });
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
                    done({ quality: qualities(entries), subtitles: labelledLinks(response.subtitle).map(function (entry) {
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
                    year: row.year, rows: [], description: row.type || '' };
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
                    var params = { token: value, title: query, hasPlayer: false,
                        url: root.location && root.location.href || 'http://lampa.mx/' };
                    var year = String(movie.release_date || movie.first_air_date || '').slice(0, 4);
                    if (/^\d{4}$/.test(year)) params.year = year;
                    io.request(hostSetting(settings('kodik_host', ''), 'https://kodik-api.com') + '/get-player?' + form(params), null, 'json', function (response) {
                        var url = absolute(response && response.link, 'https://kodikplayer.com');
                        if (response && response.allowed === 0) return fail(new Error('Kodik не разрешил доступ к этому плееру.'));
                        done(url ? [{ id: url, title: query, year: year, url: url, widget: true,
                            description: 'Подбор Kodik', translation: response.translation }] : []);
                    }, fail);
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
        this.id = 'libria'; this.title = 'AniLibria';
        function base() { return hostSetting(settings('libria_host', ''), 'https://api.anilibria.app') + '/api/v1/'; }
        this.search = function (query, movie, done, fail) {
            io.request(base() + 'app/search/releases?query=' + encodeURIComponent(query), null, 'json', function (rows) {
                if (!Array.isArray(rows)) return fail(new Error('AniLibria: неожиданный формат поиска.'));
                done(rank(rows.map(function (row) { return { id: row.id, title: row.name && row.name.main || row.alias,
                    original: row.name && row.name.english, year: row.year, description: 'Серий: ' + (row.episodes_total || '—') }; }), movie));
            }, fail);
        };
        this.open = function (result, done, fail) {
            io.request(base() + 'anime/releases/' + encodeURIComponent(result.id), null, 'json', function (release) {
                if (!release || typeof release !== 'object') return fail(new Error('AniLibria: неожиданный ответ релиза.'));
                if (release.is_blocked_by_geo || release.is_blocked_by_copyrights) return fail(new Error('AniLibria сообщила об ограничении доступа к релизу.'));
                var episodes = list(release.episodes).slice().sort(function (a, b) { return +a.ordinal - +b.ordinal; });
                done({ id: result.id, title: result.title, episodes: episodes, voices: [{ id: 'libria', title: 'AniLibria' }] });
            }, fail);
        };
        this.episodes = function (release, voice, done) {
            done(release.episodes.map(function (ep) { return { season: '1', number: ep.ordinal,
                title: 'Серия ' + ep.ordinal + (ep.name ? ' · ' + ep.name : ''), data: ep, voice: voice }; }));
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
    function maxQuality(map) {var keys=Object.keys(map||{}).filter(function (k) {return !!map[k];}).sort(function (a,b) {return qualityNumber(b)-qualityNumber(a);});var q=keys.length?qualityNumber(keys[0]):0;return q>=2160?'4K':q?q+'p':'';}
    function formatDate(value) {var d=new Date(value+'T12:00:00');return isNaN(d.getTime())?'':d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});}
    function progressText(p,remaining) {
        var time=Math.max(0,+p.time||0),duration=Math.max(0,+p.duration||0);
        if (!duration) return time?'Просмотрено '+Math.floor(time/60)+' мин.':'';
        return remaining?'Осталось '+Math.ceil(Math.max(0,duration-time)/60)+' мин.':
            'Просмотрено '+Math.floor(time/60)+' из '+Math.ceil(duration/60)+' мин. · '+Math.round(+p.percent||time/duration*100)+'%';
    }
    function keepVisible(pane,target) {
        if (!pane || !target || !pane.contains(target)) return;
        var box=pane.getBoundingClientRect(),rect=target.getBoundingClientRect(),gap=8;
        if (pane.scrollHeight>pane.clientHeight) {
            if (rect.bottom>box.bottom-gap) pane.scrollTop+=rect.bottom-box.bottom+gap;
            if (rect.top<box.top+gap) pane.scrollTop-=box.top-rect.top+gap;
        }
        if (pane.scrollWidth>pane.clientWidth) {
            if (rect.right>box.right-gap) pane.scrollLeft+=rect.right-box.right+gap;
            if (rect.left<box.left+gap) pane.scrollLeft-=box.left-rect.left+gap;
        }
    }

    var Core = { exactResult: exactResult, searchNames: searchNames, maxQuality: maxQuality, keepVisible: keepVisible, progressText: progressText, VERSION: VERSION, form: form, absolute: absolute, hostSetting: hostSetting, rank: rank,
        rezkaDecode: rezkaDecode, kodikDecode: kodikDecode, labelledLinks: labelledLinks, chooseQuality: chooseQuality,
        parseRezkaSearch: parseRezkaSearch, parseRezkaPage: parseRezkaPage, rezkaEpisodes: rezkaEpisodes,
        kodikResults: kodikResults, parseKodikPlayer: parseKodikPlayer, kodikEndpoint: kodikEndpoint, kodikCatalog: kodikCatalog,
        Transport: Transport, Rezka: Rezka, Kodik: Kodik, Libria: Libria, flag: flag, movieKey: movieKey,
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
        function buildProviders(io) {
            return [new Kodik(io, setting), new Rezka(io, setting, new RezkaSession(io, setting, save, Lampa)), new Libria(io, setting)];
        }
        function saveResume(key, value) {
            var all=object(setting('resume',{})),updated={};
            Object.keys(all).forEach(function (k) {updated[k]=all[k];});updated[key]=value;
            Object.keys(updated).sort(function (a,b) {return (+updated[b].updated||0)-(+updated[a].updated||0);}).slice(500).forEach(function (k) {delete updated[k];});
            save('resume',updated);
        }
        var currentPlayback = null, lastProgressSave = 0, activeScreen = null;
        function paintNextLabel(event) {
            if (!Lampa.PlayerPanel || !Lampa.PlayerPanel.render || !currentPlayback) return;
            var rendered=Lampa.PlayerPanel.render();
            rendered.find('.player-next__title').text(currentPlayback._lamplay.series ? 'Следующая серия' : 'Следующая озвучка');
            var list=event && event.playlist || Lampa.PlayerPlaylist && Lampa.PlayerPlaylist.get && Lampa.PlayerPlaylist.get();
            var next=event && event.playlist ? list[event.position+1] : null;
            if (!next && list) for (var i=0;i<list.length-1;i++) if (list[i]===currentPlayback || list[i].url===currentPlayback.url) {next=list[i+1];break;}
            if (next && next._lpNextTitle) rendered.find('.player-next__episode-title').text(next._lpNextTitle);
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
            return flag(setting('remember_source', true), true) && entry && entry.source || setting('source', 'kodik');
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
            var source = providers.filter(function (p) { return p.id === historySource(movie); })[0] || providers[0];
            var initialQuery = movie.title || movie.name || movie.original_title || movie.original_name || '';
            var query = initialQuery, release = null, resultSelected = null, voice = null, season = '', episodes = [], results = null;
            var lastEpisodeKey = null;
            var busy = false, destroyed = false, last = null, generation = 0, reverse = false, pendingResume = null;
            var cache = {}, probeQueue = [], probing = 0, observed = null, metadata = { details: movie, seasons: {}, id: null, request: 0, signature: '' };
            var type = /^(tv|movie)$/.test(movie.media_type) ? movie.media_type : movie.name || movie.first_air_date ? 'tv' : 'movie';
            var html = $('<div class="lamplay"></div>'), backdrop = $('<div class="lp-backdrop"></div>');
            var top = $('<div class="lp-top"></div>');
            var panel = $('<div class="lp-panel"></div>'), side = $('<aside class="lp-side"></aside>');
            var hero = $('<div class="lp-hero"></div>'), main = $('<main class="lp-main"></main>');
            var filters = $('<div class="lp-filters"></div>'), tools = $('<div class="lamplay__controls lp-scroll lp-tools"></div>');
            var bodyPane = $('<div class="lp-scroll lp-body-pane"></div>'), body = $('<div class="lamplay__items"></div>');
            var status = $('<div class="lamplay__status" role="status"></div>');
            var statusText = $('<span></span>'), retryAction = null, lastBackground = '';
            status.append(statusText);side.append(hero);main.append(filters,bodyPane.append(body));panel.append(side,main);
            html.append(backdrop,status,panel);
            function inActivity() { var a = Lampa.Activity.active(); return !destroyed && a && a.activity === self.activity; }
            function savedResume() { return object(setting('resume', {}))[key]; }
            function series() { return release && typeof release.series === 'boolean' ? release.series : type === 'tv'; }
            function view() { var v = setting(series() ? 'view_series' : 'view_movie', series() ? 'horizontal' : 'vertical'); return ['horizontal','vertical','card'].indexOf(v) < 0 || !series() && v === 'horizontal' ? 'vertical' : v; }
            function focusNode(node) {
                node = $(node);last = node[0];if (last && last._lpEpisodeKey) lastEpisodeKey=last._lpEpisodeKey;
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
            function thumbnail(ep) { return imageURL(detailFor(ep).still_path,'w500') || imageURL(metadata.details.backdrop_path || metadata.details.poster_path,'w780'); }
            function voiceOf(ep) { return ep.voice || voice || { id:'default',title:'' }; }
            function streamKey(ep) { return [source.id,release.id,voiceOf(ep).id,ep.season,ep.number].join('|'); }
            function stopProbes() {
                probeIo.clear();probeQueue=[];probing=0;
                if (observed) observed.disconnect();observed=null;
            }
            function changeGeneration() { generation++;stopProbes();io.clear(); }
            function setStatus(message,error) {
                statusText.text(message || '');status.toggle(!!message);status.toggleClass('lp-error',!!error).toggleClass('lp-busy',busy);
                status.find('.lp-retry').remove();
                if (error && retryAction) status.append(interactive($('<span class="lp-retry">Повторить попытку</span>'),function () { retryAction(); }));
            }
            function begin(message,retry) { changeGeneration();busy=true;retryAction=retry;setStatus(message);refreshControls();self.start(); }
            function finish() { busy=false;setStatus('');refreshControls(); }
            function failed(e) { if (destroyed) return;busy=false;setStatus(safeError(e),true);refreshControls();self.start(); }
            function cancel() { changeGeneration();busy=false;setStatus('Загрузка отменена. Измените поиск или источник.');refreshControls();self.start(); }
            function layout() {
                var v = release ? view() : 'results';
                html.attr('data-view',v).toggleClass('lp-series',!!release && series()).toggleClass('lp-film',!!release && !series());
                if (release && series() && v !== 'vertical') {
                    side.detach();main.detach();filters.append(tools);top.append(hero,filters);panel.append(top,bodyPane);
                } else {
                    top.detach();side.append(hero,tools);main.append(filters,bodyPane);panel.append(side,main);
                }
                var bg = imageURL(metadata.details.backdrop_path || metadata.details.poster_path,'original');
                if (bg && bg!==lastBackground && Lampa.Background && Lampa.Background.change) {Lampa.Background.change(bg);lastBackground=bg;}
                backdrop.empty();
                if (v==='card' && bg) backdrop.append(setImage($('<img alt="">'),bg));
            }
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
            function refreshControls() {
                tools.empty();filters.empty();
                if (release && series()) {
                    var seasons = seasonList();
                    var seasonStrip = $('<div class="lp-strip-group"><div class="lp-caption">Сезоны</div><div class="lp-scroll lp-strip"></div></div>');
                    seasons.forEach(function (s) {control('Сезон '+s,function () {season=String(s);loadEpisodes();},seasonStrip.find('.lp-strip'),String(s)===String(season));});
                    var voicesStrip = $('<div class="lp-strip-group"><div class="lp-caption">Перевод</div><div class="lp-scroll lp-strip"></div></div>');
                    release.voices.forEach(function (v) {control(v.title,function () {voice=v;loadEpisodes();},voicesStrip.find('.lp-strip'),String(v.id)===String(voice.id));});
                    filters.append(seasonStrip,voicesStrip);
                }
                control('Источник: '+source.title,function () {
                    select('Источник',providers.map(function (p) {return {title:p.title,value:p.id};}),source.id,function (id) {
                        source=providers.filter(function (p) {return p.id===id;})[0];saveSource(movie,id);pendingResume=null;search();
                    });
                });
                if (release && series()) control('Порядок: '+(reverse?'Обратный':'Стандартный'),function () {reverse=!reverse;renderEpisodes();});
                if (release) control('Вид: '+({horizontal:'Горизонтальный',vertical:'Вертикальный',card:'Карточка'}[view()]),function () {
                    var names=series()?['horizontal','vertical','card']:['vertical','card'];
                    var next=names[(names.indexOf(view())+1)%names.length];
                    save(series()?'view_series':'view_movie',next);renderEpisodes(lastEpisodeKey);
                });
                control('Сбросить фильтр',function () {query=initialQuery;pendingResume=null;search();});
                control('Поиск: '+query,searchMenu).attr('aria-label','Поиск');
                if (release) control('К результатам',backToResults);
                if (busy) control('Отменить',cancel);
                layout();
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
                    if (!items.length && query===initialQuery && original && normal(original)!==normal(query)) source.search(original,movie,found,failed);
                    else found(items);
                },failed);
            }
            function showResults() {
                body.empty();refreshControls();renderHero();
                setStatus(results && results.length ? 'Выберите подходящий результат: '+results.length : 'Ничего не найдено. Измените запрос или источник.');
                (results||[]).forEach(function (r) {
                    var node=interactive($('<div class="lamplay__item lp-result"></div>'),function () {openRelease(r);});
                    node.append($('<div class="lamplay__item-title"></div>').text(r.title),$('<div class="lamplay__item-detail"></div>').text([r.description || r.year,r.original].filter(Boolean).join(' · ')));
                    body.append(node);
                });
                last=body.find('.selector')[0] || tools.find('.selector')[0];self.start();
            }
            function backToResults() {changeGeneration();busy=false;pendingResume=null;release=null;voice=null;episodes=[];showResults();}
            function openRelease(result) {
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
                var values=[];episodes.forEach(function (ep) {var s=String(ep.season||'');if (s && values.indexOf(s)<0) values.push(s);});return values.sort(numSort);
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
                    finish();renderEpisodes();loadSeasonMetadata(season);resumeWhenReady();
                },failed,season);
            }
            function visibleEpisodes() {var items=episodes.filter(function (ep) {return !series() || !season || String(ep.season)===season;});return reverse?items.slice().reverse():items;}
            function progress(ep) {
                var base='wf_online|'+(movie.source||'tmdb')+':'+(movie.id||movie.original_title||movie.title||release.title)+'|'+source.id+'|'+release.id+'|'+ep.season+'|'+ep.number;
                var hash=Lampa.Utils.hash(base+'|voice='+voiceOf(ep).id);
                var view=Lampa.Timeline?Lampa.Timeline.view(hash):{hash:hash,time:0,duration:0,percent:0};
                var resume = savedResume();
                if (!view.time && resume && resume.hash===hash) ['time','duration','percent'].forEach(function (k) {view[k]=+resume[k]||0;});
                if (!view.time && !view.percent && Lampa.Timeline && String(voiceOf(ep).id)===String(release.voices[0].id)) {
                    var previous=Lampa.Timeline.view(Lampa.Utils.hash(base));
                    ['time','duration','percent'].forEach(function (k) {if (previous[k]) view[k]=previous[k];});
                }
                return view;
            }
            function snapshot(ep,view) {
                var r=resultSelected, storedResult={};
                ['id','title','original','url','year','widget','translation'].forEach(function (k) {if (r[k]!==undefined) storedResult[k]=r[k];});
                if (r.rows && r.rows.length) storedResult.rows=[r.rows[0]];
                return {source:source.id,sourceTitle:source.title,result:storedResult,voice:{id:voiceOf(ep).id,title:voiceOf(ep).title},
                    season:ep.season,number:ep.number,episodeTitle:series()?episodeName(ep):'',thumbnail:series()?thumbnail(ep):'',
                    time:+view.time||0,duration:+view.duration||0,percent:+view.percent||0,hash:view.hash,series:series(),updated:Date.now()};
            }
            function record(snapshot) {saveResume(key,snapshot);}
            function renderHero() {
                hero.empty();var d=metadata.details, resume=savedResume();
                var image=imageURL(d.backdrop_path || d.poster_path,'w780');
                hero.removeClass('lp-has-cover');
                if (image) hero.append(setImage($('<img class="lp-cover" alt="">').on('load',function () {hero.addClass('lp-has-cover');}),image));
                var content=$('<div class="lp-hero-content"></div>');
                if (metadata.logo) content.append(setImage($('<img class="lp-title-logo" alt="">').attr('alt',initialQuery),metadata.logo));
                else content.append($('<div class="lp-name"></div>').text(d.title||d.name||initialQuery));
                if (resume) {
                    var label='Продолжить'+(resume.series?' · S'+resume.season+' E'+resume.number:'');
                    content.append(interactive($('<div class="lp-continue"></div>').text('▶ '+label),resumePlay));
                    content.append($('<div class="lp-resume-detail"></div>').text([resume.sourceTitle,resume.voice.title,resume.episodeTitle,progressText(resume,true)].filter(Boolean).join(' · ')));
                    content.append($('<div class="lp-progress"><i></i></div>').find('i').css('width',Math.max(0,Math.min(100,resume.percent))+'%').end());
                } else content.append($('<div class="lp-resume-detail"></div>').text('Выберите '+(release && !series()?'озвучку':'серию')+' для просмотра'));
                hero.append(content);
            }
            function resumePlay() {
                var saved=savedResume();if (!saved || busy) return;
                pendingResume=saved;
                source=providers.filter(function (p) {return p.id===saved.source;})[0] || source;
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
                if (!release || destroyed) return;stopProbes();body.empty();refreshControls();renderHero();setStatus('');
                var ticket=generation;
                visibleEpisodes().forEach(function (ep) {
                    if (ep.loadSeason) {body.append(interactive($('<div class="lamplay__item"></div>').text(ep.title),loadEpisodes));return;}
                    var v=voiceOf(ep), m=series()?detailFor(ep):metadata.details, p=progress(ep);
                    var node=interactive($('<div class="lamplay__item lp-episode"></div>'),function () {play(ep);});
                    node[0]._lpEpisodeKey=streamKey(ep);
                    var picture=$('<div class="lp-picture"></div>');
                    var img=series()?thumbnail(ep):'';
                    if (img) picture.append(setImage($('<img alt="" loading="lazy">'),img));
                    if (series()) picture.append($('<span class="lp-episode-number"></span>').text('S'+ep.season+':E'+ep.number));
                    var badge=$('<span class="lp-quality"></span>');picture.append(badge);
                    var duration=+p.duration || (series()?+m.runtime*60:+m.runtime*60) || 0;
                    picture.append($('<span class="lp-runtime"></span>').text(duration?Math.ceil(duration/60)+' мин.':''));
                    var line=$('<div class="lp-progress"><i></i></div>');line.find('i').css('width',Math.max(0,Math.min(100,+p.percent||0))+'%');picture.append(line);
                    var info=$('<div class="lp-episode-info"></div>');
                    info.append($('<div class="lamplay__item-title"></div>').text(series()?episodeName(ep):v.title));
                    if (p.time) info.append($('<div class="lp-watched"></div>').text(progressText(p,false)));
                    var details=[];if (series() && +m.vote_average>0) details.push('★ '+Number(m.vote_average).toFixed(1));
                    if (m.air_date || m.release_date) details.push(formatDate(m.air_date || m.release_date));
                    if (!series() && duration) details.push(Math.ceil(duration/60)+' мин.');
                    info.append($('<div class="lamplay__item-detail"></div>').text(details.join(' · ')));
                    var desc=series()?m.overview:m.tagline;
                    if (desc) info.append($('<div class="lp-description"></div>').text(desc));
                    node.append(picture,info);body.append(node);
                    var task={ep:ep,node:node,badge:badge,ticket:ticket,source:source.id,key:streamKey(ep),release:release};node[0]._lpProbe=task;
                    var hit=cache[task.key];if (hit && Date.now()-hit.time<60000) showQuality(task,hit.streams);
                });
                if (root.IntersectionObserver) {
                    observed=new root.IntersectionObserver(function (entries) {entries.forEach(function (entry) {if (entry.isIntersecting && entry.target._lpProbe) enqueueProbe(entry.target._lpProbe);});},{root:bodyPane[0],rootMargin:'0px'});
                    body.find('.lp-episode').each(function () {observed.observe(this);});
                }
                last=restore?body.find('.lp-episode').filter(function () {return this._lpEpisodeKey===restore;})[0]:null;
                last=last || body.find('.selector')[0] || tools.find('.selector')[0];self.start();
            }
            function showQuality(task,streams) {
                if (!task.node[0].isConnected || task.ticket!==generation) return;
                var q=maxQuality(streams.quality);task.badge.text(q).toggle(!!q);
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
                    _lamplay:state,_lpEpisode:ep,subtitles:false};
            }
            function resolveCell(item,done,fail) {
                var ep=item._lpEpisode, hit=cache[streamKey(ep)];
                function ready(streams) {
                    try {streams=prepareStreams(streams,setting);item.url=chooseQuality(streams.quality,setting('quality','1080'));item.quality=streams.quality;item.subtitles=streams.subtitles && streams.subtitles.length?streams.subtitles:false;if (!item.url) throw new Error('Нет доступного видеопотока.');done();}
                    catch(e) {fail(e);}
                }
                if (hit && Date.now()-hit.time<60000) ready(hit.streams);else source.resolve(release,ep,ready,fail);
            }
            function play(ep,resuming) {
                if (busy) return;
                begin('Получаем видеопоток…',function () {play(ep,resuming);});
                var items=episodes.filter(function (e) {return !e.loadSeason && (!series() || !season || String(e.season)===season);}).slice();
                if (series()) items.sort(function (a,b) {return +a.season-+b.season || +a.number-+b.number;});
                var playlist=items.map(cell), index=items.indexOf(ep), first=playlist[index];
                if (!first) return failed(new Error('Серия не найдена.'));
                playlist.forEach(function (item) {item.url=function (callback) {resolveCell(item,callback,function (e) {item.url='';Lampa.Noty.show(safeError(e));callback();});};});
                resolveCell(first,function () {
                    saveSource(movie,source.id);record(first._lamplay);finish();renderHero();
                    if (movie.id && Lampa.Favorite) Lampa.Favorite.add('history',movie,100);
                    if (resuming && first.timeline.time>0) { first._lpResumeAt=first.timeline.time;first.timeline.percent=0; }
                    Lampa.Player.play(first);Lampa.Player.playlist(playlist);

                },failed);
            }
            function metadataRequest(path,done,fail) {
                if (!Lampa.TMDB || !Lampa.TMDB.api || !Lampa.TMDB.key) return fail && fail();
                var url=Lampa.TMDB.api(path+(path.indexOf('?')<0?'?':'&')+'api_key='+encodeURIComponent(Lampa.TMDB.key()));
                metadataIo.request(url,null,'json',done,fail || function () {});
            }
            function loadMetadata(target) {
                if (!Lampa.TMDB) return;
                var sameCard = !target || [movie.title,movie.name,movie.original_title,movie.original_name].some(function (name) {return name && sameTitle(name,target.title);});
                var sourceType = target && release ? (series()?'tv':'movie') : type;
                var cardYear=String(movie.release_date||movie.first_air_date||'').slice(0,4);
                if (target && target.year && cardYear && String(target.year)!==cardYear || sourceType!==type) sameCard=false;
                var directId = sameCard && (!movie.source || ['tmdb','cub'].indexOf(movie.source)>=0) ? movie.id : null;
                var name = target && target.title || initialQuery;
                var year = target && target.year || String(movie.release_date || movie.first_air_date || '').slice(0,4);
                var signature = sourceType+'|'+(directId || name+'|'+year);
                if (metadata.signature===signature) return;
                metadata.signature=signature;metadata.id=null;metadata.seasons={};metadata.logo='';
                metadata.details=sameCard?movie:{title:name};var ticket=++metadata.request;
                function detail(id) {
                    if (ticket!==metadata.request || destroyed) return;metadata.id=id;
                    metadataRequest(sourceType+'/'+id+'?language=ru&append_to_response=images&include_image_language=ru,en,null',function (d) {
                        if (destroyed || ticket!==metadata.request) return;metadata.details=d;
                        var logos=list(d.images && d.images.logos);var logo=logos.filter(function (l) {return l.iso_639_1==='ru';})[0] || logos.filter(function (l) {return l.iso_639_1==='en';})[0] || logos[0];
                        metadata.logo=logo && imageURL(logo.file_path,'w500');renderHero();layout();
                        if (release && !busy) {renderEpisodes(last && last._lpEpisodeKey);if (series()) loadSeasonMetadata(season);}
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
            function loadSeasonMetadata(s) {
                if (!metadata.id || !s || own(metadata.seasons,String(s))) return;
                metadata.seasons[String(s)]=[];var ticket=metadata.request;
                metadataRequest('tv/'+metadata.id+'/season/'+encodeURIComponent(s)+'?language=ru',function (d) {
                    if (destroyed || ticket!==metadata.request) return;metadata.seasons[String(s)]=list(d.episodes);
                    if (release && String(season)===String(s)) renderEpisodes(last && last._lpEpisodeKey);
                },function () {delete metadata.seasons[String(s)];});
            }
            this.create=function () {activeScreen=self;renderHero();refreshControls();loadMetadata();search();return html;};
            this.render=function () {return html;};
            this.start=function () {
                if (!inActivity()) return;
                renderHero();
                Lampa.Controller.add('content',{toggle:function () {
                    Lampa.Controller.collectionSet(html);
                    var target=last && html[0].contains(last)?last:body.find('.selector')[0] || tools.find('.selector')[0];
                    Lampa.Controller.collectionFocus(target || false,html);if (target) focusNode(target);
                },up:function () {move('up','head');},down:function () {move('down');},left:function () {move('left','menu');},right:function () {move('right');},back:self.back});
                Lampa.Controller.toggle('content');
            };
            function move(dir,fallback) {if (root.Navigator.canmove(dir)) root.Navigator.move(dir);else if (fallback) Lampa.Controller.toggle(fallback);}
            this.back=function () {if (busy) return cancel();if (release) return backToResults();Lampa.Activity.backward();};
            this.pause=function () {};this.stop=function () {};
            this.playerClosed=function () {if (release && !busy) renderEpisodes(lastEpisodeKey);else renderHero();};
            this.destroy=function () {destroyed=true;if (activeScreen===self) activeScreen=null;changeGeneration();metadataIo.clear();html.remove();};
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
            ".lamplay-card-logo{display:block;max-width:100%;max-height:5.5em;object-fit:contain;object-position:left center}"
        ].join('\n')).appendTo('head');
        Lampa.Component.add(KEY, Screen);
        var buttonBindings = [];
        // CSS order wins over other plugins' prepends without a MutationObserver
        // reorder loop. The initial-focus guard ends on the first real user input.
        function focusPriority(binding) {
            var a=Lampa.Activity.active(),visible=a && a.activity && a.activity.render && a.activity.render();
            visible=visible && (visible[0] || visible);
            return flag(setting('button_first',true),true) && binding.focusUntil>Date.now() && binding.direct &&
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
            binding.focusUntil=Date.now()+1800;
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
            function restore() {if (title.find('.lamplay-card-logo').length) title.text(binding.name);}
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
                img.on('error',function () {if (title.find('.lamplay-card-logo')[0]===this) title.text(binding.name);});
                title.empty().append(img);
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
            var title=$(render).find('.full-start-new__title, .full-start__title').first(),movie=event.data && event.data.movie;
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

        var childMenus = [];
        function param(name, type, label, value, values, description, component, onChange) {
            Lampa.SettingsApi.addParam({ component: component || KEY, param: { name: KEY + '_' + name, type: type, 'default': value, values: values, placeholder: 'Не задано' },
                field: { name: label, description: description || '' }, onChange: onChange });
        }
        function buttonParam(component, name, label, action, description, onRender) {
            Lampa.SettingsApi.addParam({ component: component, param: { name: KEY + '_' + name, type: 'button' },
                field: { name: label, description: description || '' }, onChange: action, onRender: onRender });
        }
        function submenu(id, title) {
            childMenus.push(id);
            Lampa.SettingsApi.addComponent({ component: id, name: title,
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h6l2 3h8v13H4z"/></svg>' });
            var returnIndex = 0, returnScroll = null;
            buttonParam(KEY, id + '_open', title + ' ›', function () {
                Lampa.Settings.create(id, { onBack: function () { Lampa.Settings.create(KEY, { last_index: returnIndex, lamplay_scroll: returnScroll }); } });
            }, '', function (item) {
                item.on('hover:enter', function () {
                    returnIndex = item.parent().find('.selector').index(item);
                    var scroll = item.closest('.scroll')[0];
                    returnScroll = scroll && scroll.Scroll && scroll.Scroll.position ? scroll.Scroll.position() : null;
                });
            });
        }
        param('card_logo','trigger','Логотип вместо названия в карточке',false,undefined,'Использовать найденный логотип в основной карточке Lampa. Если логотип недоступен, остаётся название.',KEY,updateCardLogos);
        param('source', 'select', 'Источник по умолчанию', 'kodik', { kodik: 'Kodik', rezka: 'HDrezka', libria: 'AniLibria' });
        param('quality', 'select', 'Предпочитаемое качество', '1080', { auto: 'Лучшее доступное', '2160': '2160p', '1080': '1080p', '720': '720p', '480': '480p', '360': '360p' });
        param('button_first', 'trigger', 'Кнопка LamPlay всегда первая', true, undefined,
            'Размещать LamPlay перед остальными кнопками просмотра в карточке.', KEY, updateButtons);
        param('prefer_http', 'trigger', 'Предпочитать видеопоток по HTTP', false, undefined,
            'Меняет протокол видеоссылок. Используйте при открытии самой Lampa по HTTP.');
        param('full_episode_title', 'trigger', 'Полный формат названия серии', true, undefined,
            'Сезон, номер и название эпизода в плеере. Название произведения отображается в шапке.');
        param('remember_source', 'trigger', 'Запоминать источник для каждого произведения', true);
        buttonParam(KEY, 'clear_source_history', 'Очистить историю источников', function () {
            var history = object(setting('source_history', {})), count = Object.keys(history).length;
            save('source_history', {});
            Lampa.Noty.show('История источников очищена: ' + count + '.');
        }, 'Сбрасывает запомненные источники. История просмотров и таймкоды сохраняются.');

        var rezkaMenu = KEY + '_rezka_settings', kodikMenu = KEY + '_kodik_settings';
        var libriaMenu = KEY + '_libria_settings', extraMenu = KEY + '_extra_settings';
        submenu(rezkaMenu, 'HDrezka'); submenu(kodikMenu, 'Kodik'); submenu(libriaMenu, 'AniLibria'); submenu(extraMenu, 'Дополнительно');
        var authIo = new Transport(Lampa, setting), authSession = new RezkaSession(authIo, setting, save, Lampa);
        var passwordDraft = String(setting('rezka_password', '') || ''), authBusy = false, authStatusNode = null, passwordStatusNode = null;
        function rezkaHost() { return hostSetting(setting('rezka_host', ''), 'https://rezka.ag'); }
        function updateAuthStatus(message) {
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
            authStatusNode = $('<div class="settings-param__descr"></div>'); item.append(authStatusNode); updateAuthStatus();
        });
        param('prefer_mp4', 'trigger', 'Предпочитать поток MP4', true, undefined, '', rezkaMenu);
        param('rezka_fix_stream', 'trigger', 'Фиксация видеопотока', false, undefined,
            'Использовать указанный ниже домен CDN для потоков Voidboost / Ukrtelcdn, сохраняя путь и параметры ссылки.', rezkaMenu);
        param('rezka_stream_host', 'input', 'Фиксированный домен видеопотока', 'https://femeretes.org', '',
            'Применяется при включённой фиксации потока. Работа зависит от доступности CDN.', rezkaMenu);
        param('kodik_host', 'input', 'Адрес API', 'https://kodik-api.com', '', '', kodikMenu);
        param('kodik_token', 'input', 'Свой API-токен', '', '', 'Пусто — подбор через get-player. Свой токен включает поиск через API.', kodikMenu);
        param('libria_host', 'input', 'Адрес API', 'https://api.anilibria.app', '', '', libriaMenu);
        param('timeout', 'select', 'Ожидание ответа', '15', { '10': '10 сек.', '15': '15 сек.', '30': '30 сек.' }, '', extraMenu);
        var ratingsMenu=KEY+'_ratings_settings';
        submenu(ratingsMenu,'Рейтинг');
        var ratingsModule=createIntegratedRatings();
        param('ratings_enabled','trigger','Включить функцию рейтингов',false,undefined,'Приоритет и окраска рейтингов по всей Lampa.',ratingsMenu,function () {ratingsModule.setEnabled(setting('ratings_enabled',false));});
        function ratingsParam(name,type,title,value,values) {param('ratings_'+name,type,title,value,values,'',ratingsMenu,function () {ratingsModule.refresh();});}
        ratingsParam('priority','select','Приоритет рейтинга','imdb',{imdb:'IMDb',kp:'Кинопоиск',tmdb:'TMDB'});
        ratingsParam('list_color','trigger','Цветной рейтинг в списках',true);
        ratingsParam('full_color','trigger','Цветные рейтинги внутри карточки',true);
        ratingsParam('scale','select','Цветовая шкала','detailed',{detailed:'Подробная — четыре цвета',simple:'Простая — три цвета'});
        buttonParam(ratingsMenu,'ratings_clear','Очистить кэш рейтингов',function () {ratingsModule.clear();},'Оценки хранятся сутки и загружаются через источник метаданных Lampa.');
        ratingsModule.setEnabled(setting('ratings_enabled',false));
        buttonParam(KEY, 'about', 'О плагине', function () {
            Lampa.Noty.show('LamPlay by WaterFAQ · ' + VERSION + ' · Тестовая версия.');
        });
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
            if (event.name === KEY && event.params && event.params.last_index !== undefined) {
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
    }
    function start() { install(root.Lampa, root.jQuery || root.$); }
    if (root.Lampa) {
        if (root.appready) start();
        else root.Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
    }
})(typeof window !== 'undefined' ? window : globalThis);
