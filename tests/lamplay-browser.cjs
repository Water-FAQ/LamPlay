require('fs').mkdirSync(__dirname+'/renders',{recursive:true});
const {chromium}=require('../node_modules/playwright');
const fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<html><head><style>html{height:100%;font:20px Arial}body{margin:0;height:calc(100vh - 64px);padding-top:64px;background:#121821;color:white}*{box-sizing:border-box}</style></head><body></body></html>');
 await page.addStyleTag({path:__dirname+'/research/host.css'});
 await page.addScriptTag({path:__dirname+'/../node_modules/jquery/dist/jquery.min.js'});await page.addScriptTag({path:__dirname+'/fixtures/lampa-mock.js'});await page.addScriptTag({path:__dirname+'/../lamplay.js'});
 await page.evaluate(()=>mock.open());await page.waitForTimeout(500);
 await page.screenshot({path:__dirname+'/renders/new-series-horizontal.png'});
 assert.equal(await page.locator('.lp-episode').count(),7);
 await page.evaluate(()=>jQuery('.lp-episode:last-child').trigger('hover:focus'));await page.waitForTimeout(650);
 let r=await page.evaluate(()=>{const pane=document.querySelector('.lp-body-pane'),last=document.querySelector('.lp-episode:last-child');const a=last.getBoundingClientRect(),b=pane.getBoundingClientRect();return {left:pane.scrollLeft,visible:a.right<=b.right+2,bottom:a.bottom<=b.bottom+2};});
 assert.ok(r.left>0&&r.visible&&r.bottom,JSON.stringify(r));console.log('PASS horizontal episode strip scrolls focused last card fully into viewport');
 await page.evaluate(()=>{while(document.querySelector('.lamplay').dataset.view!=='vertical')mock.click('Вид:');});await page.waitForTimeout(100);
 await page.screenshot({path:__dirname+'/renders/new-series-vertical.png'});
 await page.evaluate(()=>jQuery('.lp-episode:last-child').trigger('hover:focus'));await page.waitForTimeout(230);r=await page.evaluate(()=>{const pane=document.querySelector('.lp-body-pane'),last=document.querySelector('.lp-episode:last-child');let a=last.getBoundingClientRect(),b=pane.getBoundingClientRect();return {top:pane.scrollTop,visible:a.bottom<=b.bottom+2};});
 assert.ok(r.top>0&&r.visible,JSON.stringify(r));console.log('PASS vertical list scrolls down with selected row');
 await page.evaluate(()=>{mock.click('Вид:');});await page.waitForTimeout(100);await page.screenshot({path:__dirname+'/renders/new-series-card.png'});
 await page.evaluate(()=>mock.open(true));await page.waitForTimeout(400);await page.screenshot({path:__dirname+'/renders/new-film-vertical.png'});
 await page.evaluate(()=>{mock.click('Вид:');});await page.waitForTimeout(100);await page.screenshot({path:__dirname+'/renders/new-film-card.png'});
 r=await page.evaluate(()=>{let a=document.querySelector('.lp-panel').getBoundingClientRect(),b=document.querySelector('.lamplay').getBoundingClientRect();return a.bottom<=b.bottom+1;});assert.ok(r);assert.deepEqual(errors,[]);console.log('PASS both movie views fit screen; no browser JavaScript errors');
 await page.evaluate(()=>{mock.many();mock.open(false);});await page.waitForTimeout(400);
 await page.evaluate(()=>{while(document.querySelector('.lamplay').dataset.view!=='vertical')mock.click('Вид:');jQuery('.lp-episode:last-child').trigger('hover:focus')});await page.waitForTimeout(230);r=await page.evaluate(()=>{const pane=document.querySelector('.lp-body-pane'),last=document.querySelector('.lp-episode:last-child');let a=last.getBoundingClientRect(),b=pane.getBoundingClientRect();return {count:document.querySelectorAll('.lp-episode').length,top:pane.scrollTop,visible:a.bottom<=b.bottom+2};});assert.equal(r.count,176);assert.ok(r.top>0&&r.visible);console.log('PASS all 176 rows remain reachable and visible when focused');
 for(const size of [{width:1920,height:1080},{width:960,height:540},{width:390,height:844}]) {
   await page.setViewportSize(size);await page.waitForTimeout(330);await page.evaluate(()=>jQuery('.lp-episode:last-child').trigger('hover:focus'));await page.waitForTimeout(230);
   const fit=await page.evaluate(()=>{const pane=document.querySelector('.lp-body-pane'),node=document.querySelector('.lp-episode:last-child');const p=pane.getBoundingClientRect(),n=node.getBoundingClientRect();return innerWidth<=900 ? n.bottom<=innerHeight+2 : p.bottom<=innerHeight+1 && n.bottom<=p.bottom+2;});
   assert.ok(fit,JSON.stringify(size));
 }
 console.log('PASS focused rows fit 1080p, 540p and mobile viewports');
 await page.setViewportSize({width:1280,height:720});
 await page.evaluate(()=>{
   const full=jQuery('<div><div class="full-start-new__buttons"><div class="full-start__button selector button--play">Sources</div></div><div class="buttons--container"><div class="view--torrent">Torrent</div></div></div>').appendTo('body');
   const e={type:'complite',link:{items:[{}]},object:{activity:{render:()=>full}},data:{movie:{id:99}}};mock.listeners.full.forEach(f=>f(e));
 });
 const expanded=await page.evaluate(()=>{const b=document.querySelector('.view--lamplay-direct'),s=b.querySelector('span');return getComputedStyle(s).display!=='none' && getComputedStyle(s).opacity==='1' && s.getBoundingClientRect().width>30;});assert.ok(expanded);console.log('PASS card button label remains expanded under actual Lampa styles');
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
