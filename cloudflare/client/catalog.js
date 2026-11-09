/* Optional KinoTochka result verifier. Instance lifetime equals one opened catalogue. */
(function (root) {
    'use strict';
    root.LamPlayKinoCatalog = function (client) {
        var pages = {};
        return {verify:function (rows, done, fail) {
            var list = Array.isArray(rows) ? rows.slice() : [], cursor = 0, running = 0, active = [], playable = [], stopped = false, error, mirror = client.getMirror ? client.getMirror('kinotochka') : '';
            function pump() {
                if (stopped) return;
                while (!stopped && running < 2 && cursor < list.length) {
                    (function (row, index) {
                        var path;
                        try { var u = new root.URL(row.url); path = u.pathname; if (u.protocol !== 'https:' || !/^\/(?:[a-z0-9_-]+\/)*[1-9]\d*[-a-z0-9_]*\.html$/i.test(path)) throw new Error('invalid_result'); }
                        catch (_) { return; }
                        running++;
                        active.push(client.request('kinotochka/page',mirror ? {path:path,mirror:mirror} : {path:path},function (html) {
                            if (stopped) return;
                            if (/\bfile\s*:\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/.test(html)) { var item = {}; Object.keys(row).forEach(function (k) { item[k] = row[k]; }); item.catalogIndex = index; playable.push(item); pages[mirror + '|' + path] = html; }
                            running--; pump();
                        },function (e) { if (stopped) return; error = e; running--; pump(); }));
                    })(list[cursor],cursor++);
                }
                if (stopped) return;
                if (!running && cursor >= list.length) {
                    stopped = true;
                    // Failed verification is not evidence that a title is absent.
                    if (client.getMirror && client.getMirror('kinotochka') !== mirror) { error = new Error('settings_changed'); error.code = error.message; }
                    if (error) return fail(error);
                    playable.sort(function (a,b) { return a.catalogIndex-b.catalogIndex; });
                    playable.forEach(function (p) { delete p.catalogIndex; }); done(playable);
                }
            }
            pump(); return {abort:function () { stopped = true; active.forEach(function (a) { if (a && a.abort) a.abort(); }); }};
        },page:function (path) { var mirror = client.getMirror ? client.getMirror('kinotochka') : ''; return pages[mirror + '|' + path]; },clear:function () { pages = {}; }};
    };
})(typeof window !== 'undefined' ? window : this);
