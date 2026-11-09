/* Optional fixed-route direct fallback. Load before transport.js; never loads video bytes. */
(function (root) {
    'use strict';
    root.LamPlayDirectMetadata = function (xhrFactory) {
        function endpoint(route, p) {
            var id = String(p.id || ''), q = String(p.q || '').trim(), aggr = p.aggr || 'kp';
            var allowed = route === 'cdnvideohub/playlist' ? ['id','aggr'] : /(?:search|suggestions)$/.test(route) ? ['q'] : ['id'];
            if (Object.keys(p).some(function (k) { return allowed.indexOf(k) < 0; })) throw new Error('invalid_parameters');
            if (allowed.indexOf('id') >= 0 && !/^[1-9]\d{0,14}$/.test(id)) throw new Error('invalid_parameters');
            if (allowed.indexOf('q') >= 0 && (!q || q.length > 150)) throw new Error('invalid_parameters');
            if (route === 'cdnvideohub/playlist') {
                if (aggr !== 'kp' && aggr !== 'mali') throw new Error('invalid_parameters');
                return 'https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?pub=' + (aggr === 'kp' ? '12' : '747') + '&aggr=' + aggr + '&id=' + id;
            }
            if (route === 'cdnvideohub/video') return 'https://plapi.cdnvideohub.com/api/v1/player/sv/video/' + id;
            if (route === 'filmix/search') return 'https://api.filmix.tv/api-fx/list?search=' + encodeURIComponent(q) + '&limit=48';
            if (route === 'filmix/video-links') return 'https://api.filmix.tv/api-fx/post/' + id + '/video-links';
            if (route === 'filmix/suggestions') return 'https://filmix.gg/api/v2/suggestions?search_word=' + encodeURIComponent(q);
            throw new Error('unsupported_direct_route');
        }
        function normalize(route, data) {
            if (!data || typeof data !== 'object') throw new Error('upstream_shape_changed');
            if (route === 'cdnvideohub/playlist') {
                if (!Array.isArray(data.items)) throw new Error('upstream_shape_changed');
                var fields = ['cvhId','vkId','voiceStudio','voiceType','season','episode','episodeName'];
                return {titleName:data.titleName || '',isSerial:!!data.isSerial,items:data.items.map(function (row) { var item = {}; fields.forEach(function (k) { if (['string','number','boolean'].indexOf(typeof row[k]) >= 0) item[k] = row[k]; }); return item; })};
            }
            if (route === 'cdnvideohub/video') {
                var sources = {}, keys = ['hlsUrl','mpeg4kUrl','mpeg2kUrl','mpegQhdUrl','mpegFullHdUrl','mpegHighUrl','mpegMediumUrl','mpegLowUrl','mpegLowestUrl','mpegTinyUrl'];
                keys.forEach(function (k) { var v = data.sources && data.sources[k]; if (typeof v === 'string') { try { var u = new root.URL(v); if (u.protocol === 'https:' && !u.username && !u.password) sources[k] = u.href; } catch (_) {} } });
                if (!Object.keys(sources).length) throw new Error('upstream_no_streams');
                var result = {sources:sources}; if (/^(?:[a-z0-9-]+\.)*okcdn\.ru$/i.test(data.failoverHost || '')) result.failoverHost = data.failoverHost;
                return result;
            }
            if (route === 'filmix/search' && (data.status !== 'ok' || !Array.isArray(data.items)) || route === 'filmix/suggestions' && !Array.isArray(data.posts) || route === 'filmix/video-links' && !Object.keys(data).every(function (k) { return data[k] && typeof data[k] === 'object'; })) throw new Error('upstream_shape_changed');
            ['ads','vast','vast_url','vast_msg'].forEach(function (k) { delete data[k]; }); return data;
        }
        return {request:function (route, params, done, fail) {
            var xhr = xhrFactory ? xhrFactory() : new root.XMLHttpRequest(), ended = false, url;
            function error(code) { if (!ended) { ended = true; var e = new Error(code); e.code = code; e.status = xhr.status || 0; fail(e); } }
            try { url = endpoint(route, params || {}); } catch (e) { error(e.message); return {abort:function () { ended = true; }}; }
            xhr.open('GET',url,true); xhr.withCredentials = false; xhr.timeout = 15000;
            xhr.onload = function () {
                if (ended) return;
                var data; try { data = JSON.parse(xhr.responseText); } catch (_) { return error('direct_invalid_json'); }
                if (xhr.status !== 200) return error(xhr.status === 403 && typeof data.message === 'string' && /видео заблокировано/i.test(data.message) ? 'source_video_blocked' : 'direct_http_error');
                try { data = normalize(route,data); } catch (e) { return error(e.message); }
                ended = true; done(data);
            };
            xhr.onerror = function () { error('direct_network_error'); }; xhr.ontimeout = function () { error('direct_timeout'); };
            xhr.send(null); return {abort:function () { ended = true; xhr.abort(); }};
        }};
    };
})(typeof window !== 'undefined' ? window : this);
