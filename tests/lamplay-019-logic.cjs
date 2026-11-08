const fs=require('fs'),assert=require('assert/strict'),{JSDOM}=require('../node_modules/jsdom'),C=require('../lamplay.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function ui(transform=''){
 const dom=new JSDOM('<body></body>',{url:'http://lampa.test',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 w.eval(fs.readFileSync(require.resolve('../node_modules/jquery/dist/jquery.js'),'utf8'));
 w.eval(fs.readFileSync(__dirname+'/fixtures/lampa-mock.js','utf8'));
 if(transform)w.eval(transform);
 w.eval(fs.readFileSync(__dirname+'/../lamplay.js','utf8'));w.mock.open();await wait(1500);return dom;
}
(async()=>{
 const movie={name:'Атака титанов',original_name:'Shingeki no Kyojin'};
 for(const name of ['Атака титанов [ТВ-2] / Вторжение гигантов [ТВ-2]','Атака титанов 2','Shingeki no Kyojin 2nd Season','Shingeki no Kyojin Season 3 Part 2','Атака титанов: Финал. Часть 2'])assert.ok(C.relatedSeason(movie,{title:name}),name);
 for(const name of ['Атака титанов OVA-1','Атака титанов: Фильм первый','Атака! Титаны средней школы'])assert.equal(C.relatedSeason(movie,{title:name}),false,name);
 assert.equal(C.seasonIdentity('Атака титанов [ТВ-3, часть 2]').season,3);assert.equal(C.seasonIdentity('Атака титанов [ТВ-3, часть 2]').part,2);
 assert.deepEqual([1,2,5,11,21].map(C.episodeCountLabel),['1 серия','2 серии','5 серий','11 серий','21 серия']);
 console.log('PASS season identities, specials isolation and count endings');
 let calls=[],p=new C.Kodik({request:(u,d,t,ok)=>{calls.push(u);if(u.includes('add-players'))ok('token="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"');else ok(u.includes('Shingeki')?{allowed:1,link:'//kodikplayer.com/serial/1/hash/720p'}:{allowed:1,found:false,link:null});}},(k,f)=>f);
 let result=await new Promise((ok,fail)=>p.search('Атака титанов',Object.assign({first_air_date:'2013-01-01'},movie),ok,fail));assert.equal(result.length,1);assert.ok(calls.some(u=>u.includes('Shingeki')));assert.ok(calls.some(u=>u.includes('title=')&&!u.includes('year=')));
 console.log('PASS public Kodik fallback drops year and tries original title');
 let varied=await ui(`const R=Lampa.Reguest;Lampa.Reguest=function(){const r=new R(),native=r.native;r.native=r.silent=(u,ok,...args)=>native(u,value=>{if(u.includes('/ajax/get_cdn_series')&&value.episodes&&new URLSearchParams(String(args[1])).get('translator_id')==='1'){const d=document.createElement('div');d.innerHTML=value.episodes;d.querySelectorAll('[data-episode_id="7"]').forEach(n=>n.remove());value.episodes=d.innerHTML;}ok(value)},...args);return r;};`);
 let q=varied.window.jQuery;assert.equal(q('[data-count-voice="1"] .lp-count').text(),'6 серий');assert.equal(q('[data-count-voice="2"] .lp-count').text(),'7 серий');assert.equal(q('[data-count-season="1"] .lp-count').text(),'7 серий');varied.window.close();console.log('PASS season uses maximum voice count, selected voice keeps its own count');
 let dom=await ui();let w=dom.window,$=w.jQuery;
 assert.equal($('.lp-count-control').length,11);assert.ok($('.lp-count').toArray().every(n=>n.textContent==='7 серий'),JSON.stringify($('.lp-count').toArray().map(n=>n.textContent)));
 let logo=$('.lp-title-logo').attr('src');w.mock.set('view_series','horizontal');
 // Synthetic alternate title/year reproduces the reset reported for separate anime seasons.
 const R=w.Lampa.Reguest;w.Lampa.Reguest=function(){const r=new R(),native=r.native;r.native=r.silent=(u,ok,...args)=>native(u,value=>{if(u.includes('do=search'))value=String(value).replaceAll('Братья','Братья [ТВ-2]').replaceAll('2026','2027');ok(value)},...args);return r;};
 w.mock.click('Сбросить фильтр');await wait(100);assert.ok($('.lp-result').length);$('.lp-result').first().trigger('hover:enter');await wait(1500);
 assert.equal($('.lp-title-logo').attr('src'),logo);assert.equal($('.lp-picture img').length,7);assert.ok(w.mock.calls.some(r=>r.url.includes('/season/2?')));
 assert.ok(!w.mock.calls.some(r=>r.url.includes('search/tv')&&r.url.includes('%D0%A2%D0%92')));
 assert.ok($('.lp-episode-meta').first().text().includes('8.2'));assert.ok($('.lamplay__item-title').first().text().includes('В дороге'));
 console.log('PASS split TV-2 retains main logo and loads matching episode metadata');dom.window.close();
 dom=await ui(`const R=Lampa.Reguest;Lampa.Reguest=function(){const r=new R(),native=r.native;r.native=r.silent=(u,ok,...args)=>native(u,v=>{if(u.includes('do=search')||u.includes('/engine/ajax/search.php'))v='';ok(v)},...args);return r;};`);
 w=dom.window;$=w.jQuery;assert.equal($('.lp-empty').parent().hasClass('lp-body-pane'),true);assert.equal($('.lp-empty .lp-retry').length,0);assert.ok($('.lp-empty').text().includes('Ничего не найдено'));assert.equal($('.lamplay').attr('data-view'),'horizontal');console.log('PASS no-results stays in current view content area without retry');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});
