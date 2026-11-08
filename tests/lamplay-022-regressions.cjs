const assert=require('assert/strict'),fs=require('fs'),{JSDOM}=require('jsdom'),C=require('../lamplay.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=7000){let start=Date.now();while(!fn()){if(Date.now()-start>ms)throw Error('Timeout '+label);await wait(20);}}
async function ui(setup){const d=new JSDOM('<body></body>',{url:'http://lampa.test',runScripts:'outside-only',pretendToBeVisual:true});let w=d.window;w.eval(fs.readFileSync(require.resolve('jquery'),'utf8'));w.eval(fs.readFileSync(__dirname+'/fixtures/lampa-mock.js','utf8'));if(setup)w.eval(setup);w.eval(fs.readFileSync(__dirname+'/../lamplay.js','utf8'));return d;}
(async()=>{
 for(const t of ['Тест [TV2,Part2]','Тест [ТВ2,часть2]','Тест [s2, part II]','Тест Season–2 Cour:2']){let n=C.seasonIdentity(t);assert.equal(n.season,2,t);assert.equal(n.part,2,t);assert.deepEqual(n.aliases,['тест']);}
 assert.equal(C.seasonIdentity('Silo').season,null);assert.equal(C.relatedResults({title:'Тест TV1'},{title:'Тест OVA1'}),false);
 const sorted=C.sortResults([{title:'Тест TV3',year:2026},{title:'Тест TV1 Part2',year:2021},{title:'Тест TV2 Part2',year:2024},{title:'Тест TV1 Part1',year:2021},{title:'Тест TV2 Part1',year:2023}],{name:'Тест'},'Тест');
 assert.deepEqual(sorted.map(r=>r.title),['Тест TV1 Part1','Тест TV1 Part2','Тест TV2 Part1','Тест TV2 Part2','Тест TV3']);
 let family=[{id:'a',title:'Тест TV1 Part1'},{id:'b',title:'Тест TV1 Part2'},{id:'c',title:'Тест TV2'}];
 let nativeCalls=[],base={open(r,ok){ok({id:r.id,series:true,voices:[{id:'v',title:'Dub'}],episodes:[{season:'1',number:'1'},{season:'1',number:'2'}]})},episodes(r,v,ok){ok(r.episodes.map(e=>({...e,voice:v})))},resolve(r,e,ok){nativeCalls.push([r.id,e.season,e.number]);ok({quality:{'720p':'https://video.test/'+r.id}})}};
 let p=C.bundleProvider(base),bundle=await new Promise((ok,no)=>p.open({...family[1],_family:family},ok,no));
 C.configureBundle(bundle,{seasons:[{season_number:1,episode_count:4},{season_number:2,episode_count:2}]});assert.deepEqual(bundle.seasonKeys,['1','2']);assert.equal(bundle.selectedSeason,'1');
 let rows=await new Promise((ok,no)=>p.episodes(bundle,bundle.voices[0],ok,no,'1'));assert.deepEqual(rows.map(e=>e.number),['1','2','3','4']);
 await new Promise((ok,no)=>p.resolve(bundle,rows[2],ok,no));assert.deepEqual(nativeCalls,[['b','1','1']]);
 C.configureBundle(bundle,{seasons:[{season_number:1,episode_count:5}]});assert.deepEqual(bundle.seasonKeys,['1.1','1.2','2']);assert.equal(bundle.seasonLabels['1.2'],'Сезон 1 · Часть 2');
 const specials=C.kodikResults([{id:'one',shikimori_id:1,type:'anime-serial',title:'Тест TV1'},{id:'ova',shikimori_id:1,type:'anime-serial',title:'Тест OVA'}]);assert.equal(specials.length,2);
 console.log('PASS universal markers, natural chronology, confirmed part joining, safe split fallback and native playback identity');
 let d=await ui(`const Req=Lampa.Reguest;Lampa.Reguest=function(){const r=new Req(),old=r.native;r.native=r.silent=(u,ok,...args)=>old(u,v=>{if(u.includes('/season/'))setTimeout(()=>ok(v),450);else ok(v)},...args);return r;};`),w=d.window,$=w.jQuery;w.mock.open();await wait(140);
 assert.ok($('.lp-skeleton').length);assert.equal($('[data-count-voice]').length,0);assert.equal($('.lp-episode:not(.lp-skeleton)').length,0);
 await until(()=>!$('.lamplay').hasClass('lp-loading'),'atomic gate');assert.equal($('.lp-episode').length,7);assert.equal($('.lp-picture img').length,7);assert.ok($('.lp-count').toArray().every(n=>/сер/.test(n.textContent)));assert.ok($('.lp-quality').first().text());assert.equal($('.lp-episode').first().find('.lamplay__item-title').text(),'В дороге');
 let requests=()=>w.mock.calls.filter(c=>/get_cdn_series|do=search|\/series\//.test(c.url)).length;
 w.mock.click('Сезон 2');await until(()=>!$('.lamplay').hasClass('lp-loading'),'second season');w.mock.click('Студия 2');await until(()=>!$('.lamplay').hasClass('lp-loading'),'voice');assert.equal($('[data-count-season]:visible').length || $('[data-count-season]').filter((i,n)=>n.style.display!=='none').length,2);
 let before=requests();w.mock.click('Источник:');w.mock.select('libria');await wait(150);w.mock.click('Источник:');w.mock.select('rezka');await until(()=>!$('.lamplay').hasClass('lp-loading'),'restore');assert.equal(requests(),before);assert.ok($('[data-count-season="2"]').hasClass('lp-selected'));assert.ok($('[data-count-voice="2"]').hasClass('lp-selected'));
 d.window.close();console.log('PASS placeholders until metadata/counts/images/qualities, stable seasons and session restore without provider requests');
 d=await ui();w=d.window;$=w.jQuery;w.mock.ambiguous();w.mock.open();await until(()=>$('.lp-result').length===2,'results');let row=$('.lp-result').eq(1);w.Lampa.Controller.collectionFocus(row,$('.lamplay'));w.mock.controllers.content.left();assert.equal($('.focus').attr('data-lp-control'),'source');w.mock.controllers.content.right();assert.equal($('.focus')[0],row[0]);w.mock.controllers.content.left();w.mock.controllers.content.down();w.mock.controllers.content.right();assert.equal($('.focus')[0],row[0]);d.window.close();console.log('PASS results left/right remote navigation preserves selected row');
})().catch(e=>{console.error(e);process.exitCode=1});
// Candidate parser contract: advertising never reaches the playback result.
{global.DOMParser=new JSDOM('').window.DOMParser;const payload={hls:JSON.stringify({src:'https://cdn.test/master.m3u8'}),vast:'https://ads.test',ads:{preroll:'https://ads.test'}};
 const escaped=JSON.stringify(payload).replaceAll('"','&quot;');const streams=C.aniboomStreams('<video data-parameters="'+escaped+'"></video>');assert.equal(streams.quality.auto,'https://cdn.test/master.m3u8');assert.equal(streams.vast,undefined);assert.equal(streams.ads,undefined);}
