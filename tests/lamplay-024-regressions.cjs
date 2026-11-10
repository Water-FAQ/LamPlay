const assert=require('assert/strict'),fs=require('fs'),{JSDOM}=require('jsdom');
(async()=>{
 const d=new JSDOM('<body><div class="full-start__status">Онгоинг</div><div class="full-start__pg">18+</div></body>',{url:'http://lampa.test',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;
 w.eval(fs.readFileSync(require.resolve('jquery'),'utf8'));w.eval(fs.readFileSync(__dirname+'/fixtures/lampa-mock.js','utf8'));
 w.Lampa.Lang={translate:k=>({tv_status_returning_series:'Онгоинг'}[k]||k)};
 w.eval(fs.readFileSync(__dirname+'/../lamplay.js','utf8'));
 const params=w.Lampa.SettingsApi.getParam('lamplay_ratings_settings');
 assert.equal(params[1].param.name,'lamplay_colored_statuses');assert.equal(params[1].param.default,false);
 w.mock.set('colored_statuses',true);params[1].onChange();
 assert.equal(w.document.querySelector('.full-start__status').style.backgroundColor,'rgb(76, 175, 80)');
 assert.equal(w.document.querySelector('.full-start__pg').style.backgroundColor,'rgb(244, 67, 54)');
 w.mock.set('colored_statuses',false);params[1].onChange();assert.equal(w.document.querySelector('.full-start__status').style.backgroundColor,'');
 const main=w.Lampa.SettingsApi.getParam('lamplay').map(p=>p.param.name);
 assert.ok(main.indexOf('lamplay_full_episode_title')<main.indexOf('lamplay_dim_watched'));assert.ok(main.indexOf('lamplay_dim_watched')<main.indexOf('lamplay_filter_priority'));assert.ok(!main.includes('lamplay_prefer_http'));
 const film=w.Lampa.SettingsApi.getParam('lamplay_filmix_settings').find(p=>p.param.name==='lamplay_proxy_filmix');assert.equal(film.param.default,'no');
 d.window.close();console.log('PASS optional status palette, disable restoration, settings order, Filmix direct default');
})().catch(e=>{console.error(e);process.exitCode=1});
