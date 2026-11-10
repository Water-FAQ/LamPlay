const assert=require('assert/strict'),fs=require('fs'),{JSDOM}=require('jsdom'),C=require('../lamplay.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(f){for(let i=0;i<450;i++){if(f())return;await wait(20)}throw Error('timeout')}
async function ui(view){const d=new JSDOM('<body><div class="full-start__status" style="padding: 3px">Онгоинг</div><div class="full-start__pg">18+</div></body>',{url:'http://lampa.test',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;w.eval(fs.readFileSync(require.resolve('jquery'),'utf8'));w.eval(fs.readFileSync(__dirname+'/fixtures/lampa-mock.js','utf8'));w.mock.set('view_series',view);
w.eval(`const push=Lampa.Activity.push;Lampa.Activity.push=o=>{o.movie.kinopoisk_id=123;return push(o);};const R=Lampa.Reguest;Lampa.Reguest=function(){const r=new R(),native=r.native;r.native=r.silent=(url,ok,fail,...args)=>url.includes('plapi.cdnvideohub.com')?setTimeout(()=>ok({items:[],isSerial:true}),1):native(url,ok,fail,...args);return r;};`);
w.Lampa.Lang={translate:k=>({tv_status_returning_series:'Онгоинг'}[k]||k)};w.eval(fs.readFileSync(__dirname+'/../lamplay.js','utf8'));return d;}
(async()=>{
 for(const view of ['horizontal','vertical','card']){
  const d=await ui(view),w=d.window,$=w.jQuery;w.mock.open();await until(()=>!$('.lamplay').hasClass('lp-loading'));
  // Warm switching must remain visibly dimmed, too. Last selection wins.
  for(const voice of ['Студия 2','Студия 1','Студия 2']){w.mock.click(voice);assert.ok($('.lamplay').hasClass('lp-switching'));await wait(100);assert.ok($('.lamplay').hasClass('lp-switching'));await until(()=>!$('.lamplay').hasClass('lp-loading'));assert.ok(!$('.lamplay').hasClass('lp-switching'));}
  w.mock.click('К результатам');
  const key=code=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{keyCode:code,bubbles:true,cancelable:true}));
  for(const code of [37,39]){w.Lampa.Controller.collectionFocus($('.lp-result').last(),$('.lamplay'));key(code);assert.ok($('.lp-tools .focus').length,view+': actual keyboard event must leave results');key(39);assert.ok($('.lp-result.focus').length);}
  function source(id){w.mock.click('Источник:');w.mock.select(id);}
  source('cdnvideohub');await until(()=>!$('.lamplay').hasClass('lp-loading'));assert.ok($('.lp-empty').length);assert.equal($('.focus').attr('data-lp-control'),'source');key(40);assert.ok($('.focus').length);
  source('rezka');await until(()=>!$('.lamplay').hasClass('lp-loading'));source('cdnvideohub');await until(()=>!$('.lamplay').hasClass('lp-loading'));assert.equal($('.focus').attr('data-lp-control'),'source');
  const p=w.mock.parameter('status_mode'),node=w.document.querySelector('.full-start__status');w.mock.set('status_mode','outline');p.onChange();assert.equal(node.style.borderColor,'rgb(76, 175, 80)');assert.equal(node.style.backgroundColor,'transparent');assert.equal(node.style.alignItems,'center');w.mock.set('status_mode','off');p.onChange();assert.equal(node.style.padding,'3px');assert.equal(node.style.display,'');
  w.mock.controller='player';let next=0,prev=0;w.Lampa.Player.playdata=()=>({_lamplay:{},episode:1});w.Lampa.PlayerPlaylist={canNext:()=>true,next:()=>next++,prev:()=>prev++,position:()=>1};for(const code of [33,427])key(code);for(const code of [34,428])key(code);assert.equal(next,2);assert.equal(prev,2);w.mock.controller='content';key(34);assert.equal(prev,2);
  d.window.close();console.log('PASS',view,'actual keyboard navigation, empty/cache focus, warm fade, status restore, channel keys');
 }
 const calls=[],settings={filmix_host:'http://filmixapp.vip',proxy_filmix:'no'};const f=new C.Filmix({request:(u,data,type,ok,fail,extra)=>{calls.push({u,extra});if(u.includes('filmixapp.vip'))fail(new Error('offline'));else if(u.includes('/api/v2/search'))ok([{id:1,title:'Example'}]);else throw Error('unexpected '+u);}},(k,v)=>k in settings?settings[k]:v);
 await new Promise((ok,no)=>f.search('Example',{title:'Example'},ok,no));assert.ok(calls[0].u.startsWith('http://filmixapp.vip/'));assert.ok(calls[1].u.startsWith('http://filmixapp.cyou/'));assert.ok(calls[0].extra.directOnly);console.log('PASS Filmix configured mirror first and direct mirror fallback');
 const routes=[];const auto=new C.Filmix({request:(u,d,t,ok,fail,x)=>{routes.push(x);if(x.workerOnly)ok([{id:1,title:'Example'}]);else fail(new Error('offline'));}},(k,v)=>k==='proxy_filmix'?'auto':v);await new Promise((ok,no)=>auto.search('Example',{title:'Example'},ok,no));assert.equal(routes.length,4);assert.ok(routes.slice(0,3).every(x=>x.directOnly&&!x.workerOnly));assert.ok(routes[3].workerOnly);console.log('PASS Filmix auto exhausts direct mirrors before Worker');
})().catch(e=>{console.error(e);process.exitCode=1});
