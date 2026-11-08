/* Optional ES5 client for a future LamPlay build. Not loaded by lamplay.js. */
(function (root) {
    'use strict';
    var routes = /^(?:animelib\/(?:search|episodes|episode|constants)|cdnvideohub\/(?:playlist|video)|animego\/(?:search|player|episode)|aniboom\/embed|rezka\/(?:search|page|episodes|stream)|kodik\/(?:search|list|get-player|integration-script|page|resolve)|filmix\/(?:search|video-links|suggestions|mobile\/(?:search|post|profile|token-request))|kinotochka\/(?:search|find|page|playlist))$/;
    root.LamPlayMetadataClient = function (base, xhrFactory) {
        var parsed = new root.URL(base);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('Worker URL must be an HTTPS origin');
        base = parsed.origin;
        return {
            request: function (route, params, done, fail, method) {
                if (!routes.test(route)) throw new Error('Unknown metadata route');
                var query = [], xhr = xhrFactory ? xhrFactory() : new root.XMLHttpRequest(), finished = false;
                method = method || (params && params.sessionCookie !== undefined ? 'POST' : /^(?:kodik\/(?:search|list|get-player|resolve)|rezka\/(?:episodes|stream)|filmix\/mobile\/)/.test(route) ? 'POST' : 'GET');
                if (method !== 'GET' && method !== 'POST') throw new Error('Unsupported method');
                if (method === 'GET' && params && (params.token !== undefined || params.sessionCookie !== undefined)) throw new Error('Credentials require POST');
                Object.keys(params || {}).forEach(function (key) { query.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key]))); });
                function error(code, status) { if (finished) return; finished = true; var e = new Error(code); e.code = code; e.status = status || 0; fail(e); }
                xhr.open(method, base + '/v1/' + route + (method === 'GET' && query.length ? '?' + query.join('&') : ''), true);
                if (method === 'POST') xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.withCredentials = false;
                xhr.timeout = route === 'kodik/resolve' ? 30000 : 15000;
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
    };
})(typeof window !== 'undefined' ? window : this);
