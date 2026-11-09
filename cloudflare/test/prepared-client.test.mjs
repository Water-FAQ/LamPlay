import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createWorker} from '../src/core.mjs';
const permit={limit:async()=>({success:true})};
const env={ENABLED_SOURCES:'rezka,kinotochka,filmix',ALLOWED_ORIGINS:'http://lampa.mx',REQUEST_LIMITER:permit,SOURCE_LIMITER:permit};
const req=(path,body)=>new Request('https://worker.example/v1/'+path,{method:'POST',headers:{Origin:'http://lampa.mx','Content-Type':'application/json'},body:JSON.stringify(body)});
const html=(body,cookie)=>new Response(body,{headers:{'Content-Type':'text/html',...(cookie?{'Set-Cookie':cookie}:{})}});
test('login verifies the same mirror and returns only a scoped session; never caches',async()=>{
 const seen=[];let cache=0;
 const w=createWorker({fetcher:async(url,opt)=>{seen.push({url,opt});if(seen.length===1)return html('<form id="loginForm"></form>','PHPSESSID=anon; Path=/; Secure');if(seen.length===2)return new Response('{"success":true}',{headers:{'Content-Type':'application/json','Set-Cookie':'dle_user_id=synthetic; Path=/; Secure'}});return html('<a href="/logout/">Exit</a>');},cache:{match(){cache++;},put(){cache++;}}});
 const r=await w.fetch(req('rezka/login',{mirror:'https://standby-rezka.tv',login:'test@example.invalid',password:'synthetic password +%'}),env);
 assert.equal(r.status,200);const d=await r.json();assert.equal(d.mirror,'https://standby-rezka.tv');assert.match(d.sessionCookie,/dle_user_id=synthetic/);assert.equal(seen.length,3);assert.equal(cache,0);assert.equal(r.headers.get('Set-Cookie'),null);assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.ok(seen.every(x=>new URL(x.url).origin===d.mirror));assert.equal(new URLSearchParams(seen[1].opt.body).get('login_password'),'synthetic password +%');assert.equal(seen[0].opt.body,undefined);assert.equal(seen[2].opt.body,undefined);assert.equal(d.password,undefined);
});
test('mirror allowlist blocks unknown and private hosts before credentials leave',async()=>{
 let calls=0;const w=createWorker({fetcher:async()=>{calls++;throw Error('network');}});
 for(const mirror of ['http://standby-rezka.tv','https://127.0.0.1','https://unknown.example','https://standby-rezka.tv.evil.example','https://standby-rezka.tv/path']){const r=await w.fetch(req('rezka/login',{mirror,login:'synthetic',password:'synthetic'}),env);assert.ok([400,403].includes(r.status));}
 assert.equal(calls,0);
 const allowed=await createWorker({fetcher:async url=>{assert.equal(new URL(url).origin,'https://custom.example.org');return html('example');}}).fetch(req('kinotochka/page',{mirror:'https://custom.example.org',path:'/123-title.html'}),{...env,KINOTOCHKA_ALLOWED_MIRRORS:'https://custom.example.org'});assert.equal(allowed.status,200);
});
test('login denial is distinct and cookie from one request never reaches another',async()=>{
 let count=0;const w=createWorker({fetcher:async(_,o)=>{count++;if(count===1)return html('<form id="loginForm"></form>');if(count===2)return new Response('{"success":false}',{headers:{'Content-Type':'application/json'}});assert.equal(o.headers.get('Cookie'),null);return html('public');}});
 const r=await w.fetch(req('rezka/login',{mirror:'https://standby-rezka.tv',login:'synthetic',password:'synthetic'}),env);assert.equal(r.status,401);assert.equal((await r.json()).error.code,'source_login_rejected');await w.fetch(req('rezka/page',{mirror:'https://kvk.zone',path:'/123-title.html'}),env);
});
function client(settings={}){const queue=[];function factory(){const x={open(method,url){this.method=method;this.url=url;},setRequestHeader(){},send(body){this.body=body;queue.push(this);},abort(){this.aborted=true;}};return x;}const root={URL};vm.runInNewContext(fs.readFileSync(new URL('../client/direct.js',import.meta.url),'utf8'),root);vm.runInNewContext(fs.readFileSync(new URL('../client/transport.js',import.meta.url),'utf8'),root);return {api:root.LamPlayMetadataClient('https://worker.example',factory,{getSetting:(key,fallback)=>settings[key]??fallback}),queue};}
function answer(x,status,data){x.status=status;x.responseText=JSON.stringify(data);x.onload();}
test('settings supply mirror and login, sessions stay in memory per mirror',()=>{
 const settings={rezka_host:'standby-rezka.tv',rezka_login:'synthetic',rezka_password:'synthetic secret'},c=client(settings);let completed=0;
 c.api.request('rezka/search',{q:'Example'},()=>completed++,e=>assert.fail(e.code));assert.equal(new URL(c.queue[0].url).searchParams.get('mirror'),'https://standby-rezka.tv');answer(c.queue[0],401,{error:{code:'source_auth_required'}});
 assert.equal(c.queue[1].method,'POST');assert.equal(JSON.parse(c.queue[1].body).password,'synthetic secret');assert.ok(!c.queue[1].url.includes('secret'));answer(c.queue[1],200,{success:true,mirror:'https://standby-rezka.tv',sessionCookie:'dle_user_id=synthetic'});
 assert.equal(JSON.parse(c.queue[2].body).sessionCookie,'dle_user_id=synthetic');c.queue[2].status=200;c.queue[2].responseText='html';c.queue[2].onload();assert.equal(completed,1);
 settings.rezka_host='https://kvk.zone';c.api.request('rezka/search',{q:'Other'},()=>{},()=>{});assert.equal(c.queue[3].method,'GET');assert.ok(!c.queue[3].url.includes('sessionCookie'));c.api.clearSessions();
});
test('one direct fallback, safe normalization, terminal block and abort suppress callbacks',()=>{
 const c=client();let done=0,failed;
 c.api.request('cdnvideohub/video',{id:12},()=>done++,e=>failed=e.code);answer(c.queue[0],502,{error:{code:'upstream_http_error'}});assert.match(c.queue[1].url,/^https:\/\/plapi\.cdnvideohub\.com\//);assert.equal(c.queue[1].withCredentials,false);answer(c.queue[1],200,{sources:{mpegLowUrl:'https://media.example/file.mp4'},vast:'unsafe'});assert.equal(done,1);
 c.api.request('filmix/video-links',{id:1113},()=>assert.fail(),e=>failed=e.code);answer(c.queue[2],403,{error:{code:'source_video_blocked'}});answer(c.queue[3],403,{message:'Видео заблокировано!'});assert.equal(failed,'source_video_blocked');assert.equal(c.queue.length,4);
 const pending=c.api.request('filmix/search',{q:'Example'},()=>assert.fail(),()=>assert.fail());answer(c.queue[4],502,{error:{code:'upstream_timeout'}});pending.abort();assert.equal(c.queue[5].aborted,true);answer(c.queue[5],200,{status:'ok',items:[]});
});
test('KinoTochka verifies actual player markup; news disappear, cache follows mirror',()=>{
 const root={URL};vm.runInNewContext(fs.readFileSync(new URL('../client/catalog.js',import.meta.url),'utf8'),root);
 let mirror='https://kinovibe.cc',done;
 const pending=[];const client={getMirror:()=>mirror,request:(route,params,ok,fail)=>{assert.equal(route,'kinotochka/page');pending.push({params,ok,fail});return {abort(){}};}};
 const catalog=root.LamPlayKinoCatalog(client);catalog.verify([{id:1,url:mirror+'/12-news.html'},{id:2,url:mirror+'/34-season.html'}],r=>done=r,e=>assert.fail(e.code));
 pending[0].ok('<article>News</article>');pending[1].ok('new Playerjs({file:"https://media.example/file.mp4"})');assert.equal(done.length,1);assert.equal(done[0].id,2);assert.ok(catalog.page('/34-season.html'));mirror='https://kinovibe.vip';assert.equal(catalog.page('/34-season.html'),undefined);
});
test('late login after account change cannot restore an old session',()=>{
 const settings={rezka_host:'standby-rezka.tv',rezka_login:'account-a',rezka_password:'synthetic-a'},c=client(settings);let error;
 c.api.loginRezka(()=>assert.fail('old account callback'),e=>error=e.code);
 settings.rezka_login='account-b';settings.rezka_password='synthetic-b';
 answer(c.queue[0],200,{success:true,mirror:'https://standby-rezka.tv',sessionCookie:'old=synthetic'});assert.equal(error,'settings_changed');
 c.api.request('rezka/search',{q:'Example'},()=>{},()=>{});assert.equal(c.queue[1].method,'GET');assert.ok(!c.queue[1].url.includes('sessionCookie'));
});
