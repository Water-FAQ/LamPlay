const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { JSDOM } = require('../node_modules/jsdom');
const sourcePath = path.resolve(__dirname, '../lamplay.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const dom = new JSDOM('', { url: 'http://lampa.test', runScripts: 'outside-only' });
global.DOMParser = dom.window.DOMParser;
const C = require(sourcePath);
const tick = () => new Promise(r => setTimeout(r, 10));
let passed = 0;
function test(name, action) { action(); passed++; console.log('PASS', name); }
const result = { title: 'The Matrix', url: 'https://rezka.test/films/1-matrix.html' };
const rezkaSearch = `<div class="b-content__inline_item"><div class="b-content__inline_item-link"><a href="/films/1-matrix.html">The Matrix</a><div>1999, США, Фантастика</div></div></div>`;
const rezkaPage = `<script>sof.initCDNSeriesEvents(123,1,1,1,{});window.UNSAFE=true;</script>
<ul id="translators-list"><li class="b-translator__item" data-translator_id="1">Dub A</li><li class="b-translator__item" data-translator_id="2">Dub B</li></ul>
<input id="ctrl_favs" value="fav"><div id="simple-episodes-tabs"><li class="b-simple_episode__item" data-season_id="1" data-episode_id="1">Серия 1</li></div>`;
const rezkaEpisodes = `<li class="b-simple_episode__item" data-season_id="1" data-episode_id="1">Серия 1</li><li class="b-simple_episode__item" data-season_id="1" data-episode_id="2">Серия 2</li><li class="b-simple_episode__item" data-season_id="2" data-episode_id="1">Серия 1</li>`;
const streamText = '[1080p]https://cdn.test/1080.mp4 or https://cdn.test/1080.m3u8,[720p]https://cdn.test/720.mp4';
const playerPage = `<script>var urlParams = '{"d":"d","d_sign":"ds","pd":"pd","pd_sign":"ps","ref":"ref","ref_sign":"rs"}';var videoInfo={};videoInfo.type='seria';videoInfo.hash='hash';videoInfo.id='23';</script><script src="/assets/js/app.player_single.test.js"></script>`;
const playerScript = '$.ajax({type:"POST",url:atob("' + btoa('/get-video') + '")});';
const kodikRows = [1,2].map(id => ({ id: 'serial-' + id, shikimori_id: 123, title:'The Matrix',title_orig:'The Matrix',year:1999,
    translation: {id, title:'Dub '+id}, link:'//player.test/serial/1/hash',seasons:{'1':{episodes:{'1':'//player.test/seria/1/hash','2':'//player.test/seria/2/hash'}},'2':{episodes:{'1':'//player.test/seria/3/hash'}}} }));

test('URLs reject executable schemes and keep CDN signed query strings', () => {
    assert.equal(C.absolute('javascript:alert(1)'), '');
    assert.equal(C.absolute('//cdn.test/a.m3u8?token=a%2Fb', 'https://player.test'), 'https://cdn.test/a.m3u8?token=a%2Fb');
});
test('Form values encode special characters', () => assert.equal(C.form({q:'A&B + Я'}), 'q=A%26B%20%2B%20%D0%AF'));
test('Search ranks exact name and year first, without dropping alternatives', () => {
    assert.equal(C.rank([{title:'The Matrix 2',year:2003},{title:'The Matrix',year:1999}], {title:'The Matrix',release_date:'1999-01-01'})[0].year,1999);
});
test('HDrezka search parses title, year and same-origin link', () => {
    const rows=C.parseRezkaSearch(rezkaSearch, 'https://rezka.test');assert.equal(rows[0].year,'1999');assert.equal(rows[0].url,result.url);
});
test('HDrezka mirror canonical links and anonymous quick-search results are recognized', () => {
    const canonical=rezkaSearch.replace('/films/1-matrix.html','https://canonical.test/films/1-matrix.html');
    assert.equal(C.parseRezkaSearch(canonical,'https://mirror.test')[0].url,'https://mirror.test/films/1-matrix.html');
    const quick='<li><a href="/films/2.html"><span class="enty">Matrix</span> The Matrix (1999)</a></li>';
    assert.equal(C.parseRezkaSearch(quick,'https://mirror.test')[0].title,'Matrix');
});
test('HDrezka anonymous search uses /search/ and falls back to public quick search', () => {
    const requests=[];let result;
    const io={request:(url,data,type,done)=>{requests.push({url,data});done(data?'<li><a href="/films/2.html"><span class="enty">Matrix</span> (1999)</a></li>':'<div>No cards</div>');}};
    new C.Rezka(io,(k,f)=>f).search('Matrix',{},v=>result=v,assert.fail);
    assert.ok(requests[0].url.startsWith('https://rezka.ag/search/?'));
    assert.equal(requests[1].url,'https://rezka.ag/engine/ajax/search.php');assert.equal(result.length,1);
});
test('HDrezka search ignores category navigation links',()=>assert.equal(C.parseRezkaSearch('<li><a href="/films/comedy/">Комедии</a></li>'+rezkaSearch,'https://rezka.test').length,1));
test('HDrezka parser never executes source JavaScript', () => {
    const data=C.parseRezkaPage(rezkaPage,result);assert.equal(data.id,'123');assert.equal(data.voices.length,2);assert.equal(data.series,true);assert.equal(global.UNSAFE,undefined);
});
test('HDrezka single movie falls back to initial translator and flags', () => {
    const data=C.parseRezkaPage('<script>x.initCDNMoviesEvents(42,7,0,1,0,{});</script>',result);
    assert.equal(data.series,false);assert.equal(data.voices[0].id,'7');assert.equal(data.voices[0].ads,'1');
});
test('HDrezka season and episode identities are preserved', () => assert.equal(C.rezkaEpisodes(rezkaEpisodes)[2].season,'2'));
test('HDrezka encoded links decode repeated protocol noise', () => {
    const noise='//_//'+btoa('$$!!@$$@^!@#$$@');
    assert.equal(C.rezkaDecode('#h'+noise+noise+btoa(streamText)),streamText);
});
test('MP4 preference, HLS preference and subtitle languages are parsed', () => {
    assert.match(C.labelledLinks(streamText,true)[0].url,/1080.mp4$/);
    assert.match(C.labelledLinks(streamText,false)[0].url,/1080.m3u8$/);
    assert.equal(C.labelledLinks('[Русский]https://cdn.test/ru.vtt,[English]https://cdn.test/en.vtt').length,2);
});
test('Quality selection never exceeds configured limit if lower available', () => {
    const q={'1080p':'hi','720p':'mid','480p':'lo'};assert.equal(C.chooseQuality(q,'900'),'mid');assert.equal(C.chooseQuality(q,'auto'),'hi');assert.equal(C.chooseQuality(q,'240'),'lo');
});
test('Kodik groups translations but keeps different titles without external IDs separate', () => {
    assert.equal(C.kodikResults(kodikRows).length,1);assert.equal(C.kodikResults(kodikRows)[0].rows.length,2);
});
test('Kodik player parameters and same-origin endpoint parsed without eval', () => {
    const p=C.parseKodikPlayer(playerPage,'https://player.test/seria/1/hash');assert.equal(p.payload.id,'23');
    assert.equal(C.kodikEndpoint(playerScript,'https://player.test/seria/1/hash'),'https://player.test/get-video');
    assert.throws(()=>C.kodikEndpoint('$.ajax({type:"POST",url:atob("'+btoa('https://evil.test/')+'")})','https://player.test/'));
});
test('Kodik rotated base64 stream decode preserves direct HTTPS', () => {
    const original='https://cdn.test/stream.m3u8?token=abc';
    const encoded=btoa(original).replace(/[a-z]/gi,c=>{let start=c<='Z'?65:97;return String.fromCharCode(start+(c.charCodeAt(0)-start+8)%26);});
    assert.equal(C.kodikDecode(encoded),original);assert.equal(C.kodikDecode(original),original);
});
test('Source challenge pages produce explicit error', () => assert.throws(()=>C.parseRezkaSearch('Just a moment cf-chl-test','https://rezka.test'),/защиты/));
test('Independent implementation contains no proxy endpoints, eval or remote code loading', () => {
    assert.ok(!/\beval\s*\(|\bnew Function\s*\(|putScript\s*\(|createElement\(['"]script|workers\.dev|deno\.net|proxy\.html|online_mod\./.test(source));
});
test('Boolean settings accept Lampa string values', () => {
    assert.equal(C.flag('false',true),false);assert.equal(C.flag('true'),true);assert.equal(C.flag(null,true),true);
});
test('HTTP preference changes video protocol only, preserving signed query and subtitles', () => {
    const streams=C.prepareStreams({quality:{'720p':'https://cdn.test/v.m3u8?token=a%2Fb'},subtitles:[{label:'RU',url:'https://cdn.test/sub.vtt'}]},(k,f)=>k==='prefer_http'?true:f);
    assert.equal(streams.quality['720p'],'http://cdn.test/v.m3u8?token=a%2Fb');assert.equal(streams.subtitles[0].url,'https://cdn.test/sub.vtt');
});
test('HDrezka fixation replaces only known CDN hosts and preserves path/query', () => {
    const settings=(k,f)=>({rezka_fix_stream:true,rezka_stream_host:'https://fixed.test'}[k]??f);
    assert.equal(C.fixRezkaStream('https://stream.voidboost.cc/video/a.m3u8?key=abc',settings),'https://femeretes.org/video/a.m3u8?key=abc');
    assert.equal(C.fixRezkaStream('https://cdn.other.test/a',settings),'https://cdn.other.test/a');
    assert.equal(C.fixRezkaStream('https://a.ukrtelcdn.net/a',()=>false),'https://a.ukrtelcdn.net/a');
});
test('Episode title switch keeps names without repeating episode number', () => {
    const ep={season:'2',number:3,title:'Серия 3 · Начало'};
    assert.equal(C.episodeTitle('Тест',ep,'Dub',true),'Тест · Сезон 2, серия 3 · Начало · Dub');
    assert.equal(C.episodeTitle('Тест',ep,'Dub',false),'Серия 3 · Начало');
});
test('Source history separates film and TV with same catalog ID', () => {
    let a={id:1,media_type:'movie'},b={id:1,media_type:'tv'};
    const h=C.rememberSource(C.rememberSource({},a,'rezka',1),b,'kodik',2);
    assert.equal(h[C.movieKey(a)].source,'rezka');assert.equal(h[C.movieKey(b)].source,'kodik');
});
test('Source history caps at 500 entries and evicts oldest', () => {
    let h={};for(let i=0;i<501;i++)h=C.rememberSource(h,{id:i+1},'kodik',i+1);
    assert.equal(Object.keys(h).length,500);assert.equal(h[C.movieKey({id:1})],undefined);
});
test('Native cookie parsing preserves equals, rejects foreign domains, expires and scopes cookies', () => {
    const now=Date.now();let jar=C.mergeCookies([],{'set-cookie':['sid=a=b; Path=/; Secure','scoped=ok; Path=/ajax','bad=no; Domain=evil.test']},'https://rezka.test/ajax/login/',now);
    assert.equal(C.cookieHeader(jar,'https://rezka.test/'),'sid=a=b');
    assert.ok(C.cookieHeader(jar,'https://rezka.test/ajax/login/').includes('scoped=ok'));
    assert.equal(C.cookieHeader(jar,'http://rezka.test/'),'');assert.equal(C.cookieHeader(jar,'https://other.test/'),'');
    jar=C.mergeCookies(jar,{'set-cookie':['sid=deleted; Path=/; Max-Age=0']},'https://rezka.test/',now);
    assert.equal(C.cookieHeader(jar,'https://rezka.test/'),'');
});
test('Native HDrezka session captures cookies and sends them only to the matching mirror', () => {
    global.AndroidJS={appVersion:()=> '1.8.0-339'};const data={},requests=[];
    const io={request:(url,body,type,done,fail,extra)=>{
        requests.push({url,body,extra});
        if(url.endsWith('/ajax/login/')){extra.onHeaders({'set-cookie':['sid=synthetic; Path=/; Secure']});done({success:true});}
        else{assert.equal(extra.headers.Cookie,'sid=synthetic');done('<a href="/logout/">Logout</a>');}
    }};
    const session=new C.RezkaSession(io,(k,f)=>data[k]??f,(k,v)=>data[k]=v,{Platform:{is:()=>true}});
    let confirmed=false;session.login('https://rezka.test','tester','synthetic-password',()=>confirmed=true,assert.fail);
    assert.equal(confirmed,true);assert.equal(session.confirmed('https://rezka.test'),true);
    assert.equal(session.options('https://another.test/').headers.Cookie,undefined);
    assert.equal(requests[0].extra.returnHeaders,true);assert.ok(!JSON.stringify(data).includes('synthetic-password'));
    delete global.AndroidJS;
});

async function transportTests() {
    let callback, calls=0;
    const fake={Reguest:function(){this.timeout=()=>{};this.clear=()=>{};this.native=(url,done)=>{callback=done;};}};
    const io=new C.Transport(fake,()=>5);
    io.request('https://api.test',null,'json',()=>calls++,()=>calls++);io.clear();callback({ok:true});assert.equal(calls,0);
    passed++;console.log('PASS stale network callbacks ignored after cancellation');
    let failed;
    io.request('https://api.test',null,'json',()=>{},e=>failed=e);callback('not json');assert.match(failed.message,/формате/);
    passed++;console.log('PASS malformed JSON gives controlled error');
    let receivedHeaders=0;
    io.request('https://api.test',null,'json',value=>assert.equal(value.success,true),assert.fail,{returnHeaders:true,onHeaders:()=>receivedHeaders++});
    callback({body:'{"success":true}',headers:{'set-cookie':['sid=1']}});assert.equal(receivedHeaders,1);
    io.request('https://api.test',null,'json',assert.fail,assert.fail,{returnHeaders:true,onHeaders:()=>receivedHeaders++});
    io.clear();callback({body:'{"success":true}',headers:{'set-cookie':['sid=2']}});assert.equal(receivedHeaders,1);
    passed++;console.log('PASS native response envelope decoded; cancellation prevents cookie side effects');
}

function harness(seed={}) {
    const d=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'http://lampa.test',runScripts:'outside-only'});
    d.window.eval(fs.readFileSync(__dirname+'/../node_modules/jquery/dist/jquery.min.js','utf8'));
    d.window.eval(fs.readFileSync(path.join(__dirname,'fixtures/lampa-mock.js'),'utf8'));
    Object.assign(d.window.mock.values,seed);d.window.eval(source);
    return {w:d.window,$:d.window.jQuery,m:d.window.mock,L:d.window.Lampa,close:()=>d.window.close()};
}
async function settle(){for(let i=0;i<8;i++)await tick();}
async function interfaceTests(){
    let h=harness();h.m.open();await settle();
    test('Exact source match opens the serial directly with season and translation strips',()=>{
        assert.equal(h.$('.lp-episode').length,7);assert.equal(h.$('.lp-result').length,0);
        assert.equal(h.$('.lamplay').attr('data-view'),'horizontal');assert.equal(h.$('.lp-strip-group').length,2);
        assert.ok(!h.$('.lamplay__controls').text().includes('Качество:'));assert.ok(!h.$('.lamplay__controls').text().includes('Повторить'));
        assert.equal(h.$('.lp-episode').first().find('.lamplay__item-title').text(),'В дороге');
    });
    h.$('.lp-episode').first().trigger('hover:focus');await settle();
    test('Provider maximum quality is independent of preferred launch quality',()=>{assert.equal(h.$('.lp-quality').first().text(),'4K');});
    h.m.click('В дороге');await settle();
    test('Player receives TMDB episode name, thumbnail, card and all qualities without IPTV flag',()=>{
        const p=h.m.played.at(-1);assert.equal(p.title,'[S1:E1] В дороге');assert.ok(p.thumbnail);assert.equal(p.card.id,99);assert.equal(p.tv,undefined);assert.equal(Object.keys(p.quality).length,3);assert.equal(h.m.playlist[1].title,'[S1:E2] Охота');assert.equal(typeof h.m.playlist[1].url,'function');
    });
    h.m.played.at(-1).timeline.handler(83.33,1500,1800);
    test('Continue stores exact episode, voice, source and timing',()=>{
        const r=Object.values(h.m.values.lamplay_resume)[0];assert.equal(r.time,1500);assert.equal(r.duration,1800);assert.equal(r.number,'1');assert.equal(r.voice.id,'1');assert.equal(r.source,'rezka');
    });
    h.L.Player.listener.send('close',{});
    test('Closing playback refreshes both episode progress and Continue block',()=>{assert.match(h.$('.lp-remaining').text(),/Осталось 5 мин/);assert.equal(h.$('.lp-runtime').first().text(),'25:00 / 30:00');assert.equal(h.$('.lp-percent').first().text(),'83%');assert.equal(h.$('.lp-watched').length,0);});
    h.m.screen.start();assert.match(h.$('.lp-remaining').text(),/Осталось 5 мин/);
    h.m.click('Продолжить');await settle();
    test('Explicit Continue restores source/voice/season and seeks the stored time',()=>{
        assert.equal(h.m.played.length,2);assert.equal(h.m.played.at(-1)._lpResumeAt,1500);h.m.progress(0,1800);assert.equal(h.m.seek,1500);
    });
    h.m.progress(1500,1800);
    h.m.click('Вид:');await settle();
    test('View preference persists independently for series and films',()=>{assert.equal(h.m.values.lamplay_view_series,'vertical');assert.equal(h.$('.lamplay').attr('data-view'),'vertical');});
    h.m.click('Порядок:');await settle();
    test('Reverse changes visible episode order',()=>{assert.equal(h.$('.lp-episode-number').first().text(),'S1:E7');});
    h.m.click('Сезон 2');await settle();h.m.click('Студия 2');await settle();
    test('Changing translation preserves selected season',()=>{assert.equal(h.$('.lp-episode-number').first().text(),'S2:E7');});
    h.$('[data-lp-control=search]').trigger('hover:enter');assert.equal(h.m.selection.items[0].title,'Указать название');h.m.select('__input');
    test('Search exposes title combinations and editable current query, without global search',()=>{assert.equal(h.m.inputOptions.value,'Братья');assert.equal(h.m.selection.items.some(x=>/Глобальн/.test(x.title)),false);});
    h.close();
    h=harness();h.m.open(true);await settle();
    test('Movies show all voices as playable rows with only vertical and card views',()=>{
        assert.equal(h.$('.lp-episode').length,9);assert.equal(h.$('.lp-strip-group').length,0);assert.equal(h.$('.lamplay').attr('data-view'),'vertical');
        h.m.click('Вид:');assert.equal(h.$('.lamplay').attr('data-view'),'card');h.m.click('Вид:');assert.equal(h.$('.lamplay').attr('data-view'),'vertical');h.m.click('Вид:');
    });
    h.m.click('Студия 2');await settle();
    test('Movie playlist contains voices instead of episodes; no fake episode thumbnail',()=>{const p=h.m.played.at(-1);assert.equal(p.title,'Студия 2');assert.equal(p.thumbnail,undefined);assert.equal(h.m.playlist.length,9);});
    test('Each voice keeps its own timeline key',()=>assert.equal(new Set(h.m.playlist.map(p=>p.timeline.hash)).size,9));
    h.m.parameter('rezka_password').onChange();h.m.input('synthetic-visible-password');h.m.set('rezka_login','tester');h.m.parameter('rezka_signin').onChange();await settle();
    test('Password survives sign-in and mirror changes and is sent verbatim',()=>{
        assert.equal(h.m.values.lamplay_rezka_password,'synthetic-visible-password');assert.equal(h.m.inputOptions.password,false);
        assert.ok(h.m.calls.some(x=>String(x.data).includes('login_password=synthetic-visible-password')));
        h.m.set('rezka_host','https://rezka.fi');h.m.parameter('rezka_host').onChange();h.m.parameter('rezka_password').onChange();assert.equal(h.m.inputOptions.value,'synthetic-visible-password');
    });
    h.m.failLogin();h.m.parameter('rezka_signin').onChange();await settle();
    test('Rejected login exposes server reason and retains password',()=>{assert.ok(h.m.notices.some(x=>/Неверный логин/.test(x)));assert.equal(h.m.values.lamplay_rezka_password,'synthetic-visible-password');});
    for(const kind of ['rezka','kodik','libria','extra']){
        const p=h.m.parameter('lamplay_'+kind+'_settings_open'),wrap=h.$('<div class="scroll"><div><div class="selector"></div><div class="selector"></div></div></div>').appendTo('body');
        wrap[0].Scroll={position:()=>-340};const item=h.$('<div class="selector"></div>').appendTo(wrap.children());p.onRender(item);item.trigger('hover:enter');p.onChange();h.m.settingsCalls.at(-1).options.onBack();
        assert.equal(h.m.settingsCalls.at(-1).options.last_index,2);assert.equal(h.m.settingsCalls.at(-1).options.lamplay_scroll,-340);wrap.remove();
    }
    test('Every submenu remembers scroll position along with focus index',()=>{});
    let shifted=null;const settings=h.$('<div class="scroll"><div class="selector"></div><div class="selector"></div></div>').appendTo('body');settings[0].Scroll={position:()=>0,shift:n=>shifted=n};
    h.m.settingsEvent('lamplay',settings,{last_index:1,lamplay_scroll:-340});await settle();test('Settings restore physically scrolls after layout',()=>assert.equal(shifted,340));
    const full=h.$('<div><div class="full-start-new__buttons"><div class="full-start__button selector button--play">Sources</div></div><div class="buttons--container"><div class="view--torrent">Torrent</div></div></div>').appendTo('body');
    const start={};const e={type:'complite',object:{activity:{render:()=>full}},link:{items:[start]},data:{movie:{id:99}}};h.m.listeners.full.forEach(f=>f(e));
    test('Direct card shortcut gets initial host focus and remains first after late buttons',()=>{assert.equal(start.last,full.find('.view--lamplay-direct')[0]);assert.equal(full.find('.view--lamplay-direct svg').length,1);});
    full.find('.full-start-new__buttons').prepend('<div class="full-start__button selector">Late</div>');await settle();assert.equal(full.find('.view--lamplay-direct').css('order'),'-2147483647');
    h.close();
    h=harness();h.m.ambiguous();h.m.open();await settle();test('Ambiguous exact matches ask for a result rather than silently choosing a title',()=>assert.equal(h.$('.lp-result').length,2));h.close();
    h=harness();h.m.hold();const screen=h.m.open();screen.destroy();await settle();test('Destroy cancels pending screen work',()=>assert.equal(h.$('.lamplay').length,0));h.close();
}
test('Search combinations include original, local name and year without duplicates',()=>{const a=C.searchNames({title:'Братья',original_name:'Brothers',first_air_date:'2026-01-01'});assert.equal(a.length,8);assert.ok(a.includes('Brothers Братья 2026'));});
test('Matching rejects wrong years and ambiguous same-year titles',()=>{assert.equal(C.exactResult([{title:'Братья',year:2009}],{name:'Братья',first_air_date:'2026-01-01'},'Братья'),null);assert.equal(C.exactResult([{title:'Братья',year:2026},{title:'Братья',year:2026}],{name:'Братья',first_air_date:'2026-01-01'},'Братья'),null);});
async function feature040Tests(){
    let h=harness();
    function fullFixture(h,id=99){const full=h.$('<div class="full"><div class="full-start-new__title">Братья</div><div class="full-start-new__buttons"><div class="full-start__button selector button--play">Sources</div></div><div class="buttons--container"><div class="view--torrent">Torrent</div></div><div class="full-start-new__rate-line"><div class="full-start__rate rate--imdb"><div>8.2</div><span>IMDb</span></div></div></div>').appendTo('body');h.m.activateFull(full);h.m.listeners.full.forEach(f=>f({type:'complite',object:{activity:{render:()=>full}},link:{items:[{}]},data:{movie:{id,name:'Братья',source:'tmdb',media_type:'tv',imdb_rating:8.2}}}));return full;}
    test('New optional features are off by default; rating options are all nested in LamPlay',()=>{
        assert.equal(h.m.values.lamplay_card_logo,false);assert.equal(h.m.values.lamplay_ratings_enabled,false);
        for(const n of ['ratings_priority','ratings_list_color','ratings_full_color','ratings_scale','ratings_clear'])assert.equal(h.m.parameter(n).component,'lamplay_ratings_settings');
    });
    let full=fullFixture(h);await settle();assert.equal(full.find('.lamplay-card-logo').length,0);
    h.m.set('card_logo',true);h.m.parameter('card_logo').onChange();await settle();
    test('Logo option replaces the main Lampa title, with image-load error fallback',()=>{assert.equal(full.find('.lamplay-card-logo').length,1);full.find('.lamplay-card-logo').trigger('error');assert.equal(full.find('.full-start-new__title').text(),'Братья');});
    h.m.set('card_logo',false);h.m.parameter('card_logo').onChange();h.m.noLogo();full=fullFixture(h,101);h.m.set('card_logo',true);h.m.parameter('card_logo').onChange();await settle();
    test('Missing logo leaves ordinary text in the main card',()=>assert.equal(full.find('.full-start-new__title').text(),'Братья'));
    h.m.set('card_logo',false);h.m.parameter('card_logo').onChange();
    const mods=h.$('<div class="full-start__button selector mods">MODS</div>').prependTo(full.find('.full-start-new__buttons'));
    h.L.Controller.collectionFocus(mods,full);await settle();
    test('LamPlay wins late competing initial focus',()=>{assert.equal(full.find('.view--lamplay-direct').hasClass('focus'),true);assert.equal(full.find('.view--lamplay-direct').css('order'),'-2147483647');});
    h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));h.L.Controller.collectionFocus(mods,full);await settle();
    test('Initial focus priority stops after user navigation',()=>assert.equal(mods.hasClass('focus'),true));h.close();
    h=harness();h.m.aliasMovie();h.m.open(true);await settle();
    test('Compound provider film titles retain TMDB poster, runtime and tagline',()=>{assert.ok(h.$('.lp-cover').attr('src'));assert.match(h.$('.lp-description').first().text(),/Иногда/);assert.match(h.$('.lamplay__item-detail').first().text(),/113 мин/);assert.ok(!h.m.calls.some(r=>r.url.includes('search/movie')));});h.close();
    h=harness();h.m.open();await settle();const previous=h.m.selection;
    test('Series view cycles without opening a side menu',()=>{for(const v of ['vertical','card','horizontal']){h.m.click('Вид:');assert.equal(h.$('.lamplay').attr('data-view'),v);assert.equal(h.m.selection,previous);}});
    h.$('body').append('<div class="player-panel"><div class="player-next__title"></div><div class="player-next__episode-title"></div></div>');h.m.click('В дороге');await settle();
    test('Next episode preview omits season/episode prefix while player title retains it',()=>{assert.equal(h.$('.player-next__episode-title').text(),'Охота');assert.equal(h.m.played.at(-1).title,'[S1:E1] В дороге');});h.close();
    h=harness();const card=h.$('<div class="card"><div class="card__view"><div class="card__vote">6.0</div></div></div>').appendTo('body');card[0].card_data={id:11,title:'Test',source:'tmdb',vote_average:6,imdb_rating:8.2,kp_rating:7.5};
    test('Disabled global rating module leaves catalog untouched',()=>assert.equal(card.find('.lp-ratings-vote').length,0));
    h.m.set('ratings_enabled',true);h.m.parameter('ratings_enabled').onChange();await settle();
    test('Enabled rating module applies IMDb priority and detailed colors in global catalogs',()=>{assert.equal(card.find('.lp-ratings-vote').text(),'8.2');assert.equal(card.find('.lp-ratings-vote')[0].style.color,'rgb(129, 199, 132)');});
    h.m.set('ratings_priority','kp');h.m.parameter('ratings_priority').onChange();
    test('Global rating priority and scale settings match the standalone plugin',()=>{assert.equal(card.find('.lp-ratings-vote').text(),'7.5');assert.equal(card.find('.lp-ratings-vote')[0].style.color,'rgb(100, 181, 246)');h.m.set('ratings_scale','simple');h.m.parameter('ratings_scale').onChange();assert.equal(card.find('.lp-ratings-vote')[0].style.color,'rgb(129, 199, 132)');});
    full=fullFixture(h);await settle();assert.equal(full.find('.rate--imdb > div')[0].style.color,'rgb(129, 199, 132)');
    h.m.set('ratings_full_color',false);h.m.parameter('ratings_full_color').onChange();assert.equal(full.find('.rate--imdb > div')[0].style.color,'');
    h.m.set('ratings_enabled',false);h.m.parameter('ratings_enabled').onChange();await settle();
    test('Disabling ratings restores native badges and original full-card colors',()=>{assert.equal(card.find('.lp-ratings-vote').length,0);assert.equal(card.hasClass('lp-ratings-owned'),false);assert.equal(card.find('.card__vote').text(),'6.0');});h.close();
    h=harness();h.w.waterfaq_ratings={version:'1.0.0'};const ext=h.$('<div class="card"><div class="card__view"><div class="wf-ratings-vote">8.2</div></div></div>').appendTo('body');ext[0].card_data={id:11,title:'Test',imdb_rating:8.2};h.m.set('ratings_enabled',true);h.m.parameter('ratings_enabled').onChange();await settle();
    test('An installed standalone ratings plugin does not get duplicate badges',()=>{assert.equal(ext.find('.wf-ratings-vote').length,1);assert.equal(ext.find('.lp-ratings-vote').length,0);});h.close();
}
(async()=>{await transportTests();await interfaceTests();await feature040Tests();console.log('\nTOTAL '+passed+' checks passed');})().catch(e=>{console.error(e);process.exitCode=1});
