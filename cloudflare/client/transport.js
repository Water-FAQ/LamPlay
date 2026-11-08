/* Optional ES5 client for a future LamPlay build. Not loaded by lamplay.js. */
(function (root) {
    'use strict';
    var routes = /^(?:animelib\/(?:search|episodes|episode|constants)|cdnvideohub\/(?:playlist|video)|animego\/(?:search|player|episode)|aniboom\/embed)$/;
    root.LamPlayMetadataClient = function (base, xhrFactory) {
        var parsed = new root.URL(base);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('Worker URL must be an HTTPS origin');
        base = parsed.origin;
        return {
            request: function (route, params, done, fail) {
                if (!routes.test(route)) throw new Error('Unknown metadata route');
                var query = [], xhr = xhrFactory ? xhrFactory() : new root.XMLHttpRequest(), finished = false;
                Object.keys(params || {}).forEach(function (key) { query.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key]))); });
                function error(code, status) { if (finished) return; finished = true; var e = new Error(code); e.code = code; e.status = status || 0; fail(e); }
                xhr.open('GET', base + '/v1/' + route + (query.length ? '?' + query.join('&') : ''), true);
                xhr.withCredentials = false;
                xhr.timeout = 15000;
                xhr.onload = function () {
                    if (finished) return;
                    if (xhr.status !== 200) {
                        var code = 'worker_http_error';
                        try { code = JSON.parse(xhr.responseText).error.code || code; } catch (_) {}
                        error(code, xhr.status); return;
                    }
                    var data = xhr.responseText;
                    if (route.indexOf('animego/') !== 0) { try { data = JSON.parse(data); } catch (_) { error('worker_invalid_json', xhr.status); return; } }
                    finished = true; done(data);
                };
                xhr.onerror = function () { error('worker_network_error'); };
                xhr.ontimeout = function () { error('worker_timeout'); };
                xhr.send();
                return { abort: function () { finished = true; xhr.abort(); } };
            }
        };
    };
})(typeof window !== 'undefined' ? window : this);
