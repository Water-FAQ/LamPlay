import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createWorker } from '../src/core.mjs';
import { resolveRoute } from '../src/routes.mjs';
const permit = { limit: async () => ({ success: true }) };
const env = { ENABLED_SOURCES: 'rezka,kodik,filmix,kinotochka', ALLOWED_ORIGINS: 'http://lampa.mx', REQUEST_LIMITER: permit, SOURCE_LIMITER: permit };
const request = (path, data, headers = {}) => new Request('https://worker.example' + path, {
  method: data === undefined ? 'GET' : 'POST', headers: { Origin: 'http://lampa.mx', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(data === undefined ? {} : { body: typeof data === 'string' ? data : JSON.stringify(data) })
});
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const html = value => new Response(value, { headers: { 'Content-Type': 'text/html' } });
const route = (path, body, vars = {}) => resolveRoute(new URL('https://worker.example' + path), vars, body === undefined ? 'GET' : 'POST', body);

test('HDRezka search, exact page paths and native POST actions', async () => {
  const seen = [];
  const worker = createWorker({ fetcher: async (url, options) => { seen.push({ url, options }); return options.method === 'POST' ? json({ success: true, episodes: '<li></li>' }) : html('<div>Example</div>'); } });
  assert.equal((await worker.fetch(request('/v1/rezka/search?q=Example'), env)).status, 200);
  assert.equal(new URL(seen[0].url).pathname, '/search/');
  assert.equal((await worker.fetch(request('/v1/rezka/page?path=' + encodeURIComponent('/series/fiction/123-example.html')), env)).status, 200);
  assert.equal((await worker.fetch(request('/v1/rezka/episodes', { id: '123', translator_id: '0' }), env)).status, 200);
  const body = new URLSearchParams(seen.at(-1).options.body);
  assert.equal(body.get('action'), 'get_episodes'); assert.equal(body.get('translator_id'), '0');
  assert.equal(seen.at(-1).options.headers.get('Content-Type'), 'application/x-www-form-urlencoded');
  const serial = route('/v1/rezka/stream', { id: '123', translator_id: '1', season: '0', episode: '0' });
  assert.equal(new URLSearchParams(serial.body).get('action'), 'get_stream');
  const movie = route('/v1/rezka/stream', { id: '123', translator_id: '1', movie: true, is_ads: '1' });
  assert.equal(new URLSearchParams(movie.body).get('action'), 'get_movie');
  assert.throws(() => route('/v1/rezka/stream', { id:'123',translator_id:'1',movie:true,season:'1' }));
});

test('HDRezka explicit cookie stays in its own request and is never cached or returned', async () => {
  let headers; let cacheCalls = 0;
  const worker = createWorker({ fetcher: async (_, opt) => { headers = opt.headers; return html('example'); }, cache: { match() { cacheCalls++; }, put() { cacheCalls++; } } });
  const a = await worker.fetch(request('/v1/rezka/page', { path:'/films/123-example.html',sessionCookie:'PHPSESSID=synthetic' }, { Cookie:'other=browser' }), env);
  assert.equal(a.status,200); assert.equal(headers.get('Cookie'),'PHPSESSID=synthetic'); assert.equal(a.headers.get('Set-Cookie'),null);
  await worker.fetch(request('/v1/rezka/page?path=/films/123-example.html'),env);
  assert.equal(headers.get('Cookie'),null); assert.equal(cacheCalls,0);
});

test('operator mirror changes target; client host and login routes are rejected', async () => {
  assert.equal(new URL(route('/v1/rezka/search?q=Example',undefined,{ REZKA_ORIGIN:'https://mirror.example.org' }).target).origin,'https://mirror.example.org');
  for (const value of ['http://mirror.example.org','https://127.0.0.1','https://example.org/private','https://user:pass@example.org','https://example.org:8080']) assert.throws(() => route('/v1/rezka/search?q=Example',undefined,{ REZKA_ORIGIN:value }));
  const worker=createWorker({fetcher:()=>{throw new Error('unexpected network');}});
  for (const path of ['/v1/rezka/search?q=Example&host=https://evil.example','/v1/rezka/page?path=//evil.example/123-x.html','/v1/rezka/login','/v1/rezka/page?path=/ajax/login/','/v1/rezka/page?path=/123-example.html&sessionCookie=x%3Dy']) assert.ok([400,404].includes((await worker.fetch(request(path),env)).status));
});

test('Kodik API token uses POST body and secret query params are rejected', async () => {
  let options, target;
  const worker=createWorker({fetcher:async(url,opt)=>{target=url;options=opt;return json({results:[]});}});
  const r=await worker.fetch(request('/v1/kodik/search',{token:'synthetic-token',title:'Example',with_episodes:true}),env);
  assert.equal(r.status,200);assert.equal(target,'https://kodik-api.com/search');
  assert.equal(new URLSearchParams(options.body).get('token'),'synthetic-token');assert.equal(new URLSearchParams(options.body).get('with_seasons'),'true');
  assert.equal((await worker.fetch(request('/v1/kodik/search?token=synthetic-token&title=Example'),env)).status,405);
  assert.equal((await worker.fetch(request('/v1/kodik/search?token=synthetic-token',{token:'synthetic-token',title:'Example'}),env)).status,400);
  assert.equal(new URL(route('/v1/kodik/list',{token:'synthetic-token',limit:1,next:'YWJj=='}).target).pathname,'/list');
});

test('Kodik invalid token is distinguished from network denial and empty result', async () => {
  const data={token:'synthetic-token',title:'Example'};
  for (const upstream of [json({error:'Отсутствует или неверный токен'}),json({},401)]) {
    const r=await createWorker({fetcher:async()=>upstream}).fetch(request('/v1/kodik/search',data),env);
    assert.equal(r.status,401);assert.equal((await r.json()).error.code,'source_token_rejected');
  }
  const blocked=await createWorker({fetcher:async()=>json({},403)}).fetch(request('/v1/kodik/search',data),env);
  assert.equal(blocked.status,502);assert.equal((await blocked.json()).error.code,'upstream_denied');
  const empty=await createWorker({fetcher:async()=>json({results:[]})}).fetch(request('/v1/kodik/search',data),env);
  assert.equal(empty.status,200);
});

test('Kodik get-player and integration script use fixed endpoints', async () => {
  const p=route('/v1/kodik/get-player',{token:'synthetic-token',shikimoriID:'20'});
  assert.equal(new URLSearchParams(p.body).get('url'),'http://lampa.mx/');
  assert.equal(route('/v1/kodik/integration-script').target,'https://kodik-add.com/add-players.min.js');
  const r=await createWorker({fetcher:async()=>json({found:false})}).fetch(request('/v1/kodik/get-player',{token:'synthetic-token',title:'Example'}),env);
  assert.equal(r.status,200); assert.equal((await r.json()).found,false);
});

const payload={d:'example',d_sign:'a%2Fb%2Bc%3D',pd:'example',pd_sign:'b',ref:'example',ref_sign:'c'};
const playerHtml=(asset='/assets/js/app.player_single.min.js')=>`urlParams = '${JSON.stringify(payload)}'; videoInfo.type='serial'; videoInfo.hash='hash123'; videoInfo.id='10'; <script src="${asset}"></script>`;
const playerScript=(path='/gvi')=>`$.ajax({type:"POST",url:atob("${btoa(path)}")});`;
test('Kodik resolve follows bounded page → script → POST chain without executing JS', async () => {
  const calls=[];let limits=0,cache=0;
  const worker=createWorker({fetcher:async(url,opt)=>{
    calls.push({url,opt});
    if(calls.length===1)return html(playerHtml());
    if(calls.length===2)return new Response(playerScript()+'throw new Error("must not execute");',{headers:{'Content-Type':'application/javascript'}});
    return json({links:{'720':[{src:'https://media.example/stream.m3u8'}]},ads:'not copied'});
  },cache:{match(){cache++;},put(){cache++;}}});
  const result=await worker.fetch(request('/v1/kodik/resolve',{path:'/seria/10/hash123/720p'}),{...env,SOURCE_LIMITER:{limit:async()=>{limits++;return{success:true};}}});
  assert.equal(result.status,200);assert.equal((await result.json()).quality['720p'],'https://media.example/stream.m3u8');
  assert.equal(calls.length,3);assert.equal(calls[2].opt.method,'POST');assert.equal(new URLSearchParams(calls[2].opt.body).get('d_sign'),'a/b+c=');assert.equal(limits,3);assert.equal(cache,0);
});

test('Kodik resolver rejects foreign assets/endpoints and stops after source throttling', async () => {
  let calls=0;
  const foreign=createWorker({fetcher:async()=>{calls++;return html(playerHtml('https://evil.example/assets/js/app.player_single.min.js'));}});
  assert.equal((await foreign.fetch(request('/v1/kodik/resolve',{path:'/video/10/hash123/720p'}),env)).status,502);assert.equal(calls,1);
  calls=0;
  const endpoint=createWorker({fetcher:async()=>{calls++;return calls===1?html(playerHtml()):new Response(playerScript('//127.0.0.1/admin'),{headers:{'Content-Type':'text/javascript'}});}});
  assert.equal((await endpoint.fetch(request('/v1/kodik/resolve',{path:'/video/10/hash123/720p'}),env)).status,502);assert.equal(calls,2);
  calls=0;let checks=0;
  const throttled=createWorker({fetcher:async()=>{calls++;return html(playerHtml());}});
  const r=await throttled.fetch(request('/v1/kodik/resolve',{path:'/video/10/hash123/720p'}),{...env,SOURCE_LIMITER:{limit:async()=>({success:++checks<2})}});
  assert.equal(r.status,429);assert.equal(calls,1);
});

test('Filmix TV catalogue/video-links and website suggestions', async () => {
  const calls=[]; const responses=[{status:'ok',items:[]},[{voiceover:'Example',files:[]}],{posts:[]}];
  const worker=createWorker({fetcher:async(url,opt)=>{calls.push({url,opt});return json(responses.shift());}});
  for(const path of ['/v1/filmix/search?q=Example','/v1/filmix/video-links?id=123','/v1/filmix/suggestions?q=Example']) assert.equal((await worker.fetch(request(path),env)).status,200);
  assert.equal(new URL(calls[0].url).hostname,'api.filmix.tv');assert.equal(new URL(calls[1].url).pathname,'/api-fx/post/123/video-links');assert.equal(calls[2].opt.headers.get('X-Requested-With'),'XMLHttpRequest');
});

test('Filmix mobile uses exact device metadata, HTTPS only, no shared cache or cross-user token', async () => {
  const calls=[];let cacheCalls=0;
  const worker=createWorker({fetcher:async(url,opt)=>{calls.push({url,opt});return json([]);},cache:{match(){cacheCalls++;},put(){cacheCalls++;}}});
  for(const value of ['synthetic-token-one','synthetic-token-two']) {
    const r=await worker.fetch(request('/v1/filmix/mobile/search',{token:value,deviceId:'example-device',q:'Example'}),env);
    assert.equal(r.status,200);assert.equal(new URL(calls.at(-1).url).searchParams.get('user_dev_token'),value);
  }
  assert.equal(calls[0].opt.headers.get('User-Agent'),'okhttp/3.10.0');assert.equal(calls[0].opt.method,'GET');assert.equal(cacheCalls,0);
  const insecure=await worker.fetch(request('/v1/filmix/mobile/search',{token:'synthetic-token',deviceId:'example-device',q:'Example'}),{...env,FILMIX_MOBILE_ORIGIN:'http://filmixapp.cyou'});
  assert.equal(insecure.status,503);assert.equal(calls.length,2);
  assert.equal(new URL(route('/v1/filmix/mobile/post',{token:'synthetic-token',deviceId:'example-device',id:'12'}).target).pathname,'/api/v2/post/12');
  assert.equal(new URL(route('/v1/filmix/mobile/profile',{token:'synthetic-token',deviceId:'example-device'}).target).pathname,'/api/v2/user_profile');
  assert.equal(new URL(route('/v1/filmix/mobile/token-request',{deviceId:'example-device'}).target).searchParams.get('user_dev_token'),'');
});

test('KinoTochka search POST, lookup, page and operator-pinned playlist server', async () => {
  const search=route('/v1/kinotochka/search?q=Example');assert.equal(search.method,'POST');assert.equal(new URLSearchParams(search.body).get('story'),'Example');
  assert.equal(new URL(route('/v1/kinotochka/find?kp=301').target).searchParams.get('kinopoisk'),'301');
  assert.equal(new URL(route('/v1/kinotochka/page?path=/123-example.html').target).pathname,'/123-example.html');
  assert.equal(route('/v1/kinotochka/playlist?path=/playlists/123.txt',undefined,{KINOTOCHKA_PLAYLIST_ORIGIN:'https://playlist.example.org'}).target,'https://playlist.example.org/playlists/123.txt');
  const worker=createWorker({fetcher:async()=>json({playlist:[]})});assert.equal((await worker.fetch(request('/v1/kinotochka/playlist?path=/123.txt'),env)).status,200);
  for(const path of ['/v1/kinotochka/playlist?path=//evil.example/123.txt','/v1/kinotochka/playlist?path=/video.mp4','/v1/kinotochka/playlist?path=/../secret.txt']) assert.equal((await worker.fetch(request(path),env)).status,400);
});

test('private JSON requests have size/type/shape limits and cannot inject headers or login data', async () => {
  let calls=0;const worker=createWorker({fetcher:async()=>{calls++;return json({results:[]});}});
  const path='/v1/kodik/search';
  assert.equal((await worker.fetch(request(path,'{'),env)).status,400);
  assert.equal((await worker.fetch(request(path,[]),env)).status,400);
  assert.equal((await worker.fetch(request(path,{token:'synthetic-token',title:'Example',headers:{Cookie:'secret'}}),env)).status,400);
  assert.equal((await worker.fetch(request(path,'x'.repeat(16385)),env)).status,413);
  assert.equal((await worker.fetch(request(path,{token:'synthetic-token',title:'Example'},{'Content-Type':'text/plain'}),env)).status,415);
  assert.equal((await worker.fetch(request('/v1/rezka/page',{path:'/123-example.html',sessionCookie:'x=y\r\nHost: evil.example'}),env)).status,400);
  assert.equal(calls,0);
});

test('incomplete incoming POST body times out without reaching a source', async () => {
  let calls=0;
  const body=new ReadableStream({start(){}});
  const r=new Request('https://worker.example/v1/kodik/search',{method:'POST',headers:{Origin:'http://lampa.mx','Content-Type':'application/json'},body,duplex:'half'});
  const result=await createWorker({fetcher:async()=>{calls++;return json({results:[]});}}).fetch(r,env);
  assert.equal(result.status,408);assert.equal((await result.json()).error.code,'request_timeout');assert.equal(calls,0);
});

test('CORS authorizes POST JSON only on supported routes; no Authorization header', async () => {
  const worker=createWorker();
  const preflight=(path,headers)=>new Request('https://worker.example'+path,{method:'OPTIONS',headers:{Origin:'http://lampa.mx','Access-Control-Request-Method':'POST',...headers}});
  assert.equal((await worker.fetch(preflight('/v1/kodik/search',{'Access-Control-Request-Headers':'content-type'}),env)).status,204);
  assert.equal((await worker.fetch(preflight('/v1/kodik/search',{'Access-Control-Request-Headers':'authorization'}),env)).status,400);
  assert.equal((await worker.fetch(preflight('/v1/filmix/search?q=Example',{}),env)).status,405);
});

test('optional client sends secrets only in POST JSON; source text and abort behavior preserved', () => {
  const fake={open(...a){this.args=a;},setRequestHeader(k,v){this.header=[k,v];},send(body){this.body=body;},abort(){}};
  const context={window:{URL}};vm.runInNewContext(fs.readFileSync(new URL('../client/transport.js',import.meta.url),'utf8'),context);
  const client=context.window.LamPlayMetadataClient('https://worker.example',()=>fake);
  client.request('kodik/search',{token:'synthetic-token',title:'Example'},()=>{},()=>{});
  assert.throws(()=>client.request('kodik/search',{token:'synthetic-token'},()=>{},()=>{},'GET'));
  assert.equal(fake.args[0],'POST');assert.ok(!fake.args[1].includes('synthetic-token'));assert.equal(JSON.parse(fake.body).token,'synthetic-token');assert.equal(fake.header[1],'application/json');
  client.request('kodik/resolve',{path:'/video/10/hash/720p'},()=>{},()=>{});assert.equal(fake.timeout,30000);
  let result;client.request('rezka/page',{path:'/123-example.html'},d=>{result=d;},()=>{});fake.status=200;fake.responseText='<div>Example</div>';fake.onload();assert.equal(result,'<div>Example</div>');
});
