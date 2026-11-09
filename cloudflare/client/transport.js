/* Optional ES5 client for a future LamPlay build. Not loaded by lamplay.js. */
(function (root) {
    'use strict';
    var routes = /^(?:animelib\/(?:search|episodes|episode|constants)|cdnvideohub\/(?:playlist|video)|animego\/(?:search|player|episode)|aniboom\/embed|rezka\/(?:login|search|page|episodes|stream)|kodik\/(?:search|list|get-player|integration-script|page|resolve)|filmix\/(?:search|video-links|suggestions|mobile\/(?:search|post|profile|token-request))|kinotochka\/(?:search|find|page|playlist))$/;
    root.LamPlayMetadataClient = function (base, xhrFactory, options) {
        var parsed = new root.URL(base);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('Worker URL must be an HTTPS origin');
        base = parsed.origin;
        options = options || {};
        var sessions = {}, sessionEpoch = 0, accountContext = null, getSetting = options.getSetting || function (_, fallback) { return fallback; };
        var direct = options.directRequest || (root.LamPlayDirectMetadata ? root.LamPlayDirectMetadata(xhrFactory).request : null);
        var api = {
            rawRequest: function (route, params, done, fail, method) {
                if (!routes.test(route)) throw new Error('Unknown metadata route');
                var query = [], xhr = xhrFactory ? xhrFactory() : new root.XMLHttpRequest(), finished = false;
                method = method || (params && params.sessionCookie !== undefined ? 'POST' : /^(?:kodik\/(?:search|list|get-player|resolve)|rezka\/(?:login|episodes|stream)|filmix\/mobile\/)/.test(route) ? 'POST' : 'GET');
                if (method !== 'GET' && method !== 'POST') throw new Error('Unsupported method');
                if (method === 'GET' && params && (params.token !== undefined || params.sessionCookie !== undefined || params.password !== undefined || params.login !== undefined)) throw new Error('Credentials require POST');
                Object.keys(params || {}).forEach(function (key) { query.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key]))); });
                function error(code, status) { if (finished) return; finished = true; var e = new Error(code); e.code = code; e.status = status || 0; fail(e); }
                xhr.open(method, base + '/v1/' + route + (method === 'GET' && query.length ? '?' + query.join('&') : ''), true);
                if (method === 'POST') xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.withCredentials = false;
                xhr.timeout = route === 'kodik/resolve' || route === 'rezka/login' ? 30000 : 15000;
                xhr.onload = function () {
                    if (finished) return;
                    if (xhr.status !== 200) {
                        var code = 'worker_http_error';
                        try { code = JSON.parse(xhr.responseText).error.code || code; } catch (_) {}
                        error(code, xhr.status); return;
                    }
                    var data = xhr.responseText;
                    if (route.indexOf('animego/') !== 0 && !/^(?:rezka\/(?:search|page)|kodik\/(?:page|integration-script)|kinotochka\/(?:search|page))$/.test(route)) { try { data = JSON.parse(data); } catch (_) { error('worker_invalid_json', xhr.status); return; } }
                    finished = true; done(data);
                };
                xhr.onerror = function () { error('worker_network_error'); };
                xhr.ontimeout = function () { error('worker_timeout'); };
                xhr.send(method === 'POST' ? JSON.stringify(params || {}) : null);
                return { abort: function () { finished = true; xhr.abort(); } };
            }
        };
        function mirrorFor(source) {
            var fallback = source === 'rezka' ? 'https://standby-rezka.tv' : 'https://kinovibe.cc';
            var value = String(getSetting(source === 'rezka' ? 'rezka_host' : 'kinotochka_host', fallback) || fallback).trim();
            if (value.indexOf('://') < 0) value = 'https://' + value;
            var u = new root.URL(value);
            if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/' || u.port) throw new Error('Mirror must be an HTTPS origin');
            return u.origin;
        }
        function refreshAccount() { var context = String(getSetting('rezka_login','') || '') + '\u0000' + String(getSetting('rezka_password','') || ''); if (context !== accountContext) { sessions = {}; sessionEpoch++; accountContext = context; } }
        api.getMirror = mirrorFor;
        api.loginRezka = function (done, fail, mirror) {
            refreshAccount();
            mirror = mirror || mirrorFor('rezka');
            var epoch = sessionEpoch;
            return api.rawRequest('rezka/login', {mirror:mirror,login:String(getSetting('rezka_login','') || '').trim(),password:String(getSetting('rezka_password','') || '')}, function (data) {
                refreshAccount();
                if (epoch !== sessionEpoch) { var changed = new Error('settings_changed'); changed.code = changed.message; return fail(changed); }
                if (!data || data.success !== true || data.mirror !== mirror || typeof data.sessionCookie !== 'string') { var e = new Error('source_session_unconfirmed'); e.code = e.message; return fail(e); }
                sessions[mirror] = data.sessionCookie;
                done({success:true,mirror:mirror});
            }, fail);
        };
        api.clearSessions = function () { sessions = {}; sessionEpoch++; };
        api.request = function (route, params, done, fail, method) {
            var values = {}, source = route.split('/')[0], stopped = false, active, authenticated = false, directUsed = false;
            if (source === 'rezka') refreshAccount();
            Object.keys(params || {}).forEach(function (k) { values[k] = params[k]; });
            if ((source === 'rezka' || source === 'kinotochka') && values.mirror === undefined) values.mirror = mirrorFor(source);
            if (source === 'rezka' && route !== 'rezka/login' && values.sessionCookie === undefined && sessions[values.mirror]) values.sessionCookie = sessions[values.mirror];
            function success(data) { if (!stopped) { stopped = true; done(data); } }
            function failure(e) {
                if (stopped) return;
                if (source === 'rezka' && route !== 'rezka/login' && e.code === 'source_auth_required' && !authenticated && getSetting('rezka_login','') && getSetting('rezka_password','')) {
                    authenticated = true; delete sessions[values.mirror];
                    active = api.loginRezka(function () { if (!stopped) { values.sessionCookie = sessions[values.mirror]; send(); } }, finishError, values.mirror);
                    return;
                }
                if (/^(?:cdnvideohub\/(?:playlist|video)|filmix\/(?:search|video-links|suggestions))$/.test(route) && !directUsed && typeof direct === 'function' && /^(?:source_video_blocked|upstream_denied|upstream_http_error|upstream_redirect|upstream_unavailable|upstream_timeout|worker_network_error|worker_timeout|worker_http_error)$/.test(e.code || '')) {
                    directUsed = true; active = direct(route, values, success, finishError); return;
                }
                finishError(e);
            }
            function finishError(e) { if (!stopped) { stopped = true; fail(e); } }
            function send() { active = api.rawRequest(route, values, success, failure, method); }
            send();
            return {abort:function () { stopped = true; if (active && active.abort) active.abort(); }};
        };
        return api;
    };
})(typeof window !== 'undefined' ? window : this);
