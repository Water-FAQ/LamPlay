const assert=require('assert/strict'),fs=require('fs'),{JSDOM}=require('jsdom');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f){for(let i=0;i<400;i++){if(f())return;await wait(20);}throw Error('readiness timeout');}
async function ui(view='horizontal',setup=''){
 const d=new JSDOM('<body></body>',{url:'http://lampa.test',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;
 w.eval(fs.readFileSync(require.resolve('jquery'),'utf8'));w.eval(fs.readFileSync(__dirname+'/fixtures/lampa-mock.js','utf8'));
 w.eval(`mock.set('view_series',${JSON.stringify(view)});['rezka','kodik','filmix','kinotochka','cdnvideohub'].forEach(id=>mock.set('proxy_'+id,'no'));`+setup);
 w.eval(fs.readFileSync(__dirname+'/../lamplay.js','utf8'));return d;
}
(async()=>{
 for(const view of ['horizontal','vertical','card']){
  let d=await ui(view),w=d.window,$=w.jQuery;w.mock.open();
  const initial=$('.lp-tools [data-lp-control]').toArray().map(n=>n.dataset.lpControl);
  assert.ok(!$('.lp-tools').text().includes('Отменить'));assert.ok(initial.some(s=>s.startsWith('Порядок:')));assert.ok(initial.includes('К результатам'));
  await until(()=>!$('.lamplay').hasClass('lp-loading'));
  assert.deepEqual($('.lp-tools [data-lp-control]').toArray().map(n=>n.dataset.lpControl),initial);
  const hash=Object.keys(Object.values(w.mock.values.lamplay_episode_registry)[0])[0];
  w.mock.timeline[hash]={time:1380,duration:1500,percent:92};w.mock.screen.playerClosed();
  assert.ok($('.lp-episode').first().hasClass('lp-completed'));assert.ok(!$('.lp-episode').first().hasClass('lp-started'));
  w.mock.timeline[hash]={time:1379,duration:1500,percent:92};w.mock.screen.playerClosed();assert.ok(!$('.lp-episode').first().hasClass('lp-completed'));
  const cards=$('.lp-episode').toArray(),titles=$('.lp-episode-info').text();
  w.mock.hold();w.mock.click('Студия 2');assert.equal($('.lp-skeleton').length,0);assert.deepEqual($('.lp-episode').toArray(),cards);assert.equal($('.lp-episode-info').text(),titles);assert.equal($('[data-count-season]').length,2);w.mock.release();
  d.window.close();
  d=await ui(view,`const push=Lampa.Activity.push;Lampa.Activity.push=o=>{o.movie.kinopoisk_id=123;return push(o);};const R=Lampa.Reguest;Lampa.Reguest=function(){const r=new R(),native=r.native;r.native=r.silent=(url,ok,fail,...args)=>url.includes('plapi.cdnvideohub.com')?setTimeout(()=>ok({items:[],isSerial:true}),1):native(url,ok,fail,...args);return r;};`);w=d.window;$=w.jQuery;w.mock.open();await until(()=>!$('.lamplay').hasClass('lp-loading'));
  function source(id){w.mock.click('Источник:');w.mock.select(id);}
  source('cdnvideohub');await until(()=>!$('.lamplay').hasClass('lp-loading'));assert.ok($('.lp-empty').length);assert.equal($('.lp-caption').length,2);assert.ok($('.focus').length);
  source('rezka');await until(()=>$('.lp-episode:not(.lp-skeleton)').length>0);source('cdnvideohub');await until(()=>!$('.lamplay').hasClass('lp-loading'));
  assert.equal($('.lp-episode').length,0);assert.ok($('.lp-empty').text().includes('Ничего не найдено'));assert.ok($('.lp-tools').text().includes('CDN VideoHub'));assert.ok($('.focus').length);
  w.eval(`const OldRequest=Lampa.Reguest;Lampa.Reguest=function(){const r=new OldRequest(),native=r.native;r.native=r.silent=(url,ok,fail,...args)=>url.includes('kinovibe.cc')?setTimeout(()=>fail({status:403},'error'),1):native(url,ok,fail,...args);return r;};`);
  source('kinotochka');await until(()=>$('.lp-retry').length>0);w.Lampa.Controller.collectionFocus($('.lp-retry'),$('.lamplay'));w.mock.controllers.content.left();assert.equal($('.focus').attr('data-lp-control'),'source');assert.equal($('.lp-caption').length,2);
  w.Lampa.Controller.collectionFocus($('.lp-retry'),$('.lamplay'));w.mock.controllers.content.up();assert.equal(w.mock.controller,'head');
  d.window.close();console.log('PASS',view,'stable controls, retained cards, empty source restore and focus');
 }
 for(const priority of ['season','voice']){
  const d=await ui('horizontal',`mock.set('filter_priority','${priority}');const R=Lampa.Reguest;Lampa.Reguest=function(){const r=new R(),req=r.native;r.native=r.silent=(u,ok,fail,data,extra)=>req(u,value=>{if(u.includes('get_cdn_series')&&String(data).includes('translator_id=2')&&value.episodes)value.episodes=value.episodes.split('</li>').filter(row=>!row.includes('data-season_id="1"')).join('</li>');ok(value);},fail,data,extra);return r;};`),w=d.window,$=w.jQuery;
  w.mock.open();await until(()=>!$('.lamplay').hasClass('lp-loading'));w.mock.click('Сезон 2');await until(()=>!$('.lamplay').hasClass('lp-loading'));w.mock.click('Студия 2');await until(()=>!$('.lamplay').hasClass('lp-loading'));
  if(priority==='voice'){assert.equal($('[data-count-season="1"]').css('display'),'none');assert.notEqual($('[data-count-voice="1"]').css('display'),'none');}
  else {w.mock.click('Сезон 1');await until(()=>!$('.lamplay').hasClass('lp-loading'));assert.ok($('[data-count-voice="1"]').hasClass('lp-selected'));assert.notEqual($('[data-count-season="2"]').css('display'),'none');}
  d.window.close();console.log('PASS priority',priority);
 }
})().catch(e=>{console.error(e);process.exitCode=1});
