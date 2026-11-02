/* LamPlay by WaterFAQ — 0.2.0 (experimental)
 * Independent Lampa plugin. Direct connections only; no proxy or remote code execution.
 * Providers: Kodik, HDrezka, AniLibria / AniLiberty.
 */
(function (root) {
    'use strict';
    var VERSION = '0.2.0';
    var KEY = 'lamplay';
    var NAME = 'LamPlay';

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
            } else if (Lampa.Platform.is('android')) {
                // Keep login and subsequent reads in the same browser cookie jar.
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
                if (!(response && (response.success || /уже авторизован/i.test(response.message || '')))) {
                    return fail(new Error('HDrezka не подтвердила вход. Проверьте логин и пароль.'));
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
                catch (e) { return end(new Error('Источник вернул данные в неожиданном формате.')); }
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
        nodes(dom, '.b-content__inline_item').forEach(function (card) {
            var link = card.querySelector('.b-content__inline_item-link a');
            var url = absolute(link && link.getAttribute('href'), base);
            if (!url || origin(url) !== origin(base) || seen[url]) return;
            seen[url] = true;
            var info = text(card.querySelector('.b-content__inline_item-link div'));
            var year = info.match(/\b(?:19|20)\d{2}\b/);
            items.push({ id: url, url: url, title: text(link), year: year ? year[0] : '', description: info });
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
            if (/loginForm|check-form/.test(html)) throw new Error('HDrezka требует входа. Откройте Настройки → LamPlay → HDrezka.');
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
            if (session) return session.options(page);
            if (root.Lampa && root.Lampa.Platform.is('android')) {
                return { withCredentials: true, headers: { Referer: page, Origin: origin(page) } };
            }
            return { withCredentials: true };
        }
        this.search = function (query, movie, done, fail) {
            var url = base() + '/?do=search&subaction=search&q=' + encodeURIComponent(query);
            io.request(url, null, 'text', function (html) {
                try { done(rank(parseRezkaSearch(html, base()), movie)); } catch (e) { fail(e); }
            }, fail, options(base() + '/'));
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
                        done({ id: result.id, title: result.title, voices: catalog.voices, widget: true, pages: {} });
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
                done({ id: result.id, title: result.title, voices: voices });
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

    var Core = { VERSION: VERSION, form: form, absolute: absolute, hostSetting: hostSetting, rank: rank,
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
        function historySource(movie) {
            var entry = object(setting('source_history', {}))[movieKey(movie)];
            return flag(setting('remember_source', true), true) && entry && entry.source || setting('source', 'kodik');
        }
        function saveSource(movie, id) {
            if (flag(setting('remember_source', true), true)) save('source_history', rememberSource(setting('source_history', {}), movie, id));
        }

        function Screen(object) {
            var self = this, movie = object.movie || {};
            var io = new Transport(Lampa, setting), providers = buildProviders(io);
            var source = providers.filter(function (p) { return p.id === historySource(movie); })[0] || providers[0];
            var query = movie.title || movie.name || movie.original_title || movie.original_name || '';
            var release = null, voice = null, episodes = [], season = '', results = null;
            var destroyed = false, busy = false, last = null, retry = null;
            var scroll = new Lampa.Scroll({ mask: true, over: true });
            var html = $('<div class="lamplay"></div>');
            var panel = $('<div class="lamplay__panel"></div>');
            html.append(scroll.render());
            scroll.append(panel);
            var title = $('<div class="lamplay__title"></div>').text(NAME);
            var subtitle = $('<div class="lamplay__subtitle"></div>');
            var controls = $('<div class="lamplay__controls"></div>');
            var status = $('<div class="lamplay__status" role="status"></div>');
            var body = $('<div class="lamplay__items"></div>');
            panel.append(title, subtitle, controls, status, body);

            function inActivity() { var a = Lampa.Activity.active(); return !destroyed && a && a.activity === self.activity; }
            function control(label, action) {
                var node = $('<div class="lamplay__control selector"></div>').text(label);
                node.on('hover:enter', action);
                node.on('hover:focus', function () { last = node[0]; scroll.update(node, true); });
                controls.append(node); return node;
            }
            function row(label, detail, action) {
                var node = $('<div class="lamplay__item selector"></div>');
                node.append($('<div class="lamplay__item-title"></div>').text(label));
                if (detail) node.append($('<div class="lamplay__item-detail"></div>').text(detail));
                node.on('hover:enter', action);
                node.on('hover:focus', function () { last = node[0]; scroll.update(node, true); });
                body.append(node); return node;
            }
            function refreshControls() {
                controls.empty();
                control('Источник: ' + source.title, chooseSource);
                control('Поиск', searchInput);
                control('Повторить', function () { if (retry) retry(); else search(); });
                if (release) {
                    control('К результатам', backToResults);
                    if (release.voices.length > 1) control('Озвучка: ' + (voice && voice.title || 'Выбрать'), chooseVoice);
                    var seasons = seasonList();
                    if (seasons.length > 1) control('Сезон: ' + season, chooseSeason);
                }
                control('Качество: ' + (setting('quality', '1080') === 'auto' ? 'Лучшее' : setting('quality', '1080') + 'p'), chooseQualityMenu);
                if (busy) control('Отменить', cancel);
                subtitle.text(source.title + ' · ' + (release ? release.title : query));
                last = null;
            }
            function begin(message, again) {
                io.clear(); busy = true; retry = again;
                status.text(message); refreshControls(); self.start();
            }
            function finish() { busy = false; status.text(''); refreshControls(); }
            function failed(error) {
                if (destroyed) return;
                busy = false;
                status.text(safeError(error));
                refreshControls(); self.start();
            }
            function cancel() {
                io.clear(); busy = false;
                status.text('Загрузка отменена. Можно повторить запрос или выбрать другой источник.');
                refreshControls(); self.start();
            }
            function select(title, items, selected, callback) {
                Lampa.Select.show({ title: title, items: items.map(function (item) {
                    return { title: item.title, value: item.value, selected: String(item.value) === String(selected) };
                }), onSelect: function (item) { callback(item.value); }, onBack: function () { self.start(); } });
            }
            function chooseSource() {
                select('Источник', providers.map(function (p) { return { title: p.title, value: p.id }; }), source.id, function (value) {
                    source = providers.filter(function (p) { return p.id === value; })[0];
                    saveSource(movie, source.id); search();
                });
            }
            function searchInput() {
                Lampa.Input.edit({ title: 'Название для поиска', value: query, free: true, nosave: true }, function (value) {
                    value = String(value || '').trim();
                    if (value && value !== query) { query = value; search(); } else self.start();
                });
            }
            function chooseVoice() {
                select('Озвучка', release.voices.map(function (v) { return { title: v.title, value: v.id }; }), voice && voice.id, function (value) {
                    voice = release.voices.filter(function (v) { return String(v.id) === String(value); })[0];
                    season = ''; loadEpisodes();
                });
            }
            function seasonList() {
                var values = [];
                episodes.forEach(function (ep) { if (ep.season !== '' && values.indexOf(String(ep.season)) < 0) values.push(String(ep.season)); });
                return values.sort(numSort);
            }
            function chooseSeason() {
                select('Сезон', seasonList().map(function (s) { return { title: 'Сезон ' + s, value: s }; }), season, function (value) {
                    season = String(value);
                    if (visibleEpisodes().some(function (ep) { return ep.loadSeason; })) loadEpisodes();
                    else renderEpisodes();
                });
            }
            function chooseQualityMenu() {
                select('Предпочитаемое качество', ['auto', '2160', '1080', '720', '480', '360'].map(function (q) {
                    return { title: q === 'auto' ? 'Лучшее доступное' : q + 'p', value: q };
                }), setting('quality', '1080'), function (value) { save('quality', value); refreshControls(); self.start(); });
            }
            function search() {
                release = null; voice = null; episodes = []; results = null; body.empty();
                if (!query) { refreshControls(); return failed(new Error('У карточки нет названия. Нажмите «Поиск».')); }
                begin('Ищем «' + query + '»…', search);
                function found(items) {
                    if (destroyed) return;
                    results = items; finish(); showResults();
                }
                source.search(query, movie, function (items) {
                    var original = movie.original_title || movie.original_name || '';
                    if (!items.length && original && normal(original) !== normal(query)) {
                        status.text('Ищем по оригинальному названию «' + original + '»…');
                        source.search(original, movie, found, failed);
                    } else found(items);
                }, failed);
            }
            function showResults() {
                retry = search;
                body.empty(); refreshControls();
                if (!results || !results.length) status.text('Ничего не найдено. Уточните название через «Поиск» или смените источник.');
                else {
                    status.text('Выберите подходящий результат: ' + results.length);
                    results.forEach(function (result) { row(result.title, [result.year, result.original, result.description].filter(Boolean).join(' · '), function () { openRelease(result); }); });
                }
                self.start();
            }
            function backToResults() {
                io.clear(); busy = false; release = null; voice = null; episodes = [];
                showResults();
            }
            function openRelease(result) {
                body.empty();
                begin('Загружаем переводы и серии…', function () { openRelease(result); });
                source.open(result, function (data) {
                    release = data; voice = release.voices[0]; season = '';
                    if (!voice) return failed(new Error('Для релиза нет доступных переводов.'));
                    loadEpisodes();
                }, failed);
            }
            function loadEpisodes() {
                body.empty();
                begin('Получаем список серий…', loadEpisodes);
                source.episodes(release, voice, function (items) {
                    episodes = items;
                    var seasons = seasonList();
                    if (seasons.indexOf(season) < 0) season = seasons[0] || '';
                    finish(); renderEpisodes();
                }, failed, season);
            }
            function visibleEpisodes() { return episodes.filter(function (ep) { return !season || String(ep.season) === season; }); }
            function timeline(ep) {
                if (!Lampa.Timeline) return false;
                var movieId = (movie.source || 'tmdb') + ':' + (movie.id || movie.original_title || movie.title || release.title);
                // Keep Timeline keys from 0.1.0 so renaming does not reset progress.
                return Lampa.Timeline.view(Lampa.Utils.hash('wf_online|' + movieId + '|' + source.id + '|' + release.id + '|' + ep.season + '|' + ep.number));
            }
            function renderEpisodes() {
                retry = loadEpisodes;
                body.empty(); refreshControls();
                var items = visibleEpisodes();
                status.text(items.length ? 'Выберите ' + (season ? 'серию' : 'видео') : 'Доступных серий для этой озвучки нет.');
                items.forEach(function (ep, index) {
                    var full = flag(setting('full_episode_title', true), true);
                    var label = ep.loadSeason ? ep.title : episodeTitle(release.title, ep, voice.title, full);
                    var node = row(label, full ? '' : [season ? 'Сезон ' + season : '', voice && voice.title].filter(Boolean).join(' · '), function () {
                        if (ep.loadSeason) loadEpisodes(); else play(ep, index, items);
                    });
                    var view = timeline(ep);
                    if (view && Lampa.Timeline.render) node.append(Lampa.Timeline.render(view));
                });
                self.start();
            }
            function playerCell(ep, streams) {
                streams = prepareStreams(streams, setting);
                var view = timeline(ep);
                return { url: chooseQuality(streams.quality, setting('quality', '1080')), quality: streams.quality,
                    subtitles: streams.subtitles && streams.subtitles.length ? streams.subtitles : false,
                    title: episodeTitle(release.title, ep, voice.title, flag(setting('full_episode_title', true), true)),
                    timeline: view, tv: movie, season: ep.season ? +ep.season : undefined, episode: ep.number !== '' ? +ep.number : undefined };
            }
            function play(ep, index, items) {
                if (busy) return;
                begin('Получаем ссылку на видео…', function () { play(ep, index, items); });
                source.resolve(release, ep, function (streams) {
                    var first;
                    try { first = playerCell(ep, streams); } catch (e) { return failed(e); }
                    if (!first.url) return failed(new Error('Источник не вернул подходящее качество.'));
                    saveSource(movie, source.id);
                    finish();
                    var playlist = items.map(function (item, i) {
                        if (i === index) return first;
                        var cell = { title: episodeTitle(release.title, item, voice.title, flag(setting('full_episode_title', true), true)), timeline: timeline(item), tv: movie,
                            season: item.season ? +item.season : undefined, episode: item.number !== '' ? +item.number : undefined };
                        cell.url = function (callback) {
                            source.resolve(release, item, function (next) {
                                var resolved;
                                try { resolved = playerCell(item, next); }
                                catch (e) { cell.url = ''; Lampa.Noty.show(safeError(e)); callback(); return; }
                                Object.keys(resolved).forEach(function (key) { cell[key] = resolved[key]; });
                                callback();
                            }, function (err) { cell.url = ''; Lampa.Noty.show(safeError(err)); callback(); });
                        };
                        return cell;
                    });
                    if (movie.id && Lampa.Favorite) Lampa.Favorite.add('history', movie, 100);
                    Lampa.Player.play(first);
                    Lampa.Player.playlist(playlist);
                }, failed);
            }
            this.create = function () { refreshControls(); search(); return html; };
            this.render = function () { return html; };
            this.start = function () {
                if (!inActivity()) return;
                Lampa.Controller.add('content', {
                    toggle: function () {
                        Lampa.Controller.collectionSet(html);
                        Lampa.Controller.collectionFocus(last && html[0].contains(last) ? last : false, html);
                    },
                    up: function () { if (root.Navigator.canmove('up')) root.Navigator.move('up'); else Lampa.Controller.toggle('head'); },
                    down: function () { root.Navigator.move('down'); },
                    left: function () { if (root.Navigator.canmove('left')) root.Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
                    right: function () { root.Navigator.move('right'); },
                    back: self.back
                });
                Lampa.Controller.toggle('content');
            };
            this.back = function () {
                if (busy) { cancel(); return; }
                if (release) backToResults();
                else Lampa.Activity.backward();
            };
            this.pause = function () {};
            this.stop = function () {};
            this.destroy = function () { destroyed = true; io.clear(); scroll.destroy(); html.remove(); };
        }

        $('<style id="lamplay-style"></style>').text(
            '.lamplay{height:100%}.lamplay__panel{padding:1.4em 1.5em 3em}' +
            '.lamplay__title{font-size:1.5em;font-weight:600}.lamplay__subtitle{opacity:.65;margin:.5em 0 1em;overflow-wrap:break-word}' +
            '.lamplay__controls{display:flex;flex-wrap:wrap;margin-bottom:1em}' +
            '.lamplay__control{padding:.65em .9em;margin:0 .5em .5em 0;background:rgba(255,255,255,.1);border-radius:.4em}' +
            '.lamplay__status{opacity:.8;line-height:1.5;margin:.5em 0 1em;white-space:pre-wrap}' +
            '.lamplay__item{padding:1em;margin-bottom:.55em;background:rgba(255,255,255,.07);border-radius:.45em}' +
            '.lamplay__item-title{font-size:1.1em;overflow-wrap:break-word}.lamplay__item-detail{opacity:.65;font-size:.85em;margin-top:.4em}' +
            '.lamplay .selector.focus{background:#fff;color:#111}.lamplay__item .time-line{margin-top:.6em}' +
            '@media(max-width:600px){.lamplay__panel{padding:1em .7em 3em}.lamplay__title{font-size:1.2em}}'
        ).appendTo('head');
        Lampa.Component.add(KEY, Screen);
        var buttonBindings = [];
        function updateButton(binding) {
            var parent = binding.button.parent();
            if (!parent.length) return;
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
        function bindButton(button, marker) {
            var binding = { button: button, marker: marker };
            if (root.MutationObserver && button.parent().length) {
                binding.observer = new root.MutationObserver(function () { updateButton(binding); });
                binding.observer.observe(button.parent()[0], { childList: true });
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
                    bindButton(existing, savedMarker);
                }
                updateButtons(); return;
            }
            var button = $('<div class="full-start__button selector view--lamplay"><span>LamPlay</span></div>');
            button.on('hover:enter', function () {
                Lampa.Activity.push({ component: KEY, title: NAME, movie: event.data.movie, page: 1, url: '' });
            });
            var anchor = render.find('.view--torrent').first();
            var marker = $(root.document.createComment('lamplay-original-button-position'));
            if (anchor.length) anchor.after(marker);
            else render.find('.full-start__buttons').first().append(marker);
            marker.after(button);
            bindButton(button, marker);
        });
        Lampa.SettingsApi.addComponent({ component: KEY, name: NAME,
            icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>' });
        var childMenus = [];
        function param(name, type, label, value, values, description, component, onChange) {
            Lampa.SettingsApi.addParam({ component: component || KEY, param: { name: KEY + '_' + name, type: type, 'default': value, values: values },
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
            buttonParam(KEY, id + '_open', title + ' ›', function () {
                Lampa.Settings.create(id, { onBack: function () { Lampa.Settings.create(KEY); } });
            });
        }
        param('source', 'select', 'Источник по умолчанию', 'kodik', { kodik: 'Kodik', rezka: 'HDrezka', libria: 'AniLibria' });
        param('quality', 'select', 'Предпочитаемое качество', '1080', { auto: 'Лучшее доступное', '2160': '2160p', '1080': '1080p', '720': '720p', '480': '480p', '360': '360p' });
        param('button_first', 'trigger', 'Кнопка LamPlay всегда первая', true, undefined,
            'Размещать LamPlay перед остальными кнопками просмотра в карточке.', KEY, updateButtons);
        param('prefer_http', 'trigger', 'Предпочитать видеопоток по HTTP', false, undefined,
            'Меняет протокол видеоссылок. Используйте при открытии самой Lampa по HTTP.');
        param('full_episode_title', 'trigger', 'Полный формат названия серии', true, undefined,
            'Название произведения, сезон, серия, название эпизода и озвучка.');
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
        var passwordDraft = '', passwordOrigin = '', authBusy = false, authStatusNode = null, passwordStatusNode = null;
        function rezkaHost() { return hostSetting(setting('rezka_host', ''), 'https://rezka.ag'); }
        function updateAuthStatus(message) {
            if (authStatusNode) authStatusNode.text(message || authSession.status(rezkaHost()));
            if (passwordStatusNode) passwordStatusNode.text(passwordDraft && passwordOrigin === rezkaHost() ? 'Пароль введён до попытки входа' : 'Пароль не задан');
        }
        function passwordInput(callback) {
            var host = rezkaHost();
            Lampa.Input.edit({ title: 'Пароль HDrezka', value: passwordOrigin === host ? passwordDraft : '', free: true,
                nosave: true, password: true }, function (value) {
                passwordDraft = String(value || ''); passwordOrigin = host; updateAuthStatus();
                Lampa.Controller.toggle('settings_component');
                if (callback && passwordDraft) callback();
            });
        }
        param('rezka_host', 'input', 'Зеркало', 'https://rezka.ag', '', 'Вход и запросы выполняются непосредственно на этом сайте.', rezkaMenu, function () {
            authIo.clear(); authBusy = false; passwordDraft = ''; passwordOrigin = ''; updateAuthStatus();
        });
        param('rezka_login', 'input', 'Логин или почта', '', '', '', rezkaMenu);
        buttonParam(rezkaMenu, 'rezka_password', 'Пароль', function () { passwordInput(); }, '', function (item) {
            passwordStatusNode = $('<div class="settings-param__descr"></div>'); item.append(passwordStatusNode); updateAuthStatus();
        });
        buttonParam(rezkaMenu, 'rezka_signin', 'Войти', function attemptLogin() {
            if (authBusy) return;
            var host = rezkaHost(), login = String(setting('rezka_login', '') || '').trim();
            if (!login) { Lampa.Noty.show('Сначала укажите логин или почту HDrezka.'); return; }
            if (!passwordDraft || passwordOrigin !== host) { passwordInput(attemptLogin); return; }
            var password = passwordDraft; passwordDraft = ''; passwordOrigin = '';
            authBusy = true; updateAuthStatus('Выполняется вход…');
            authSession.login(host, login, password, function () {
                authBusy = false; updateAuthStatus(); Lampa.Noty.show('HDrezka: вход подтверждён.');
            }, function (error) {
                authBusy = false; updateAuthStatus(); Lampa.Noty.show(safeError(error));
            });
        });
        buttonParam(rezkaMenu, 'rezka_signout', 'Выйти', function () {
            if (authBusy) return;
            authBusy = true; passwordDraft = ''; passwordOrigin = ''; updateAuthStatus('Выполняется выход…');
            authSession.logout(rezkaHost(), function () {
                authBusy = false; updateAuthStatus(); Lampa.Noty.show('HDrezka: выход подтверждён.');
            }, function (error) { authBusy = false; updateAuthStatus(); Lampa.Noty.show(safeError(error)); });
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
