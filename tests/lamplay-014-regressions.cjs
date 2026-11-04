const {chromium}=require('../node_modules/playwright'),assert=require('assert/strict'),fs=require('fs');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}),errors=[];
 async function page(width=1920,height=1080,font=20,film=false,metadata=null){
  const p=await b.newPage({viewport:{width,height}});p.on('pageerror',e=>errors.push(e.message));await p.setContent('<div class="wrap"><div class="wrap__content"><div class="activitys"><div class="activitys__slides"><div class="activity activity--active"><div class="activity__body" id="activity"></div></div></div></div></div></div><header class="head"></header>');await p.addStyleTag({path:__dirname+'/research/host.css'});
  await p.addStyleTag({content:`html,body{font:${font}px Arial;margin:0;height:100vh;width:100vw;background:#25313b;color:white}*{box-sizing:border-box}.wrap,.wrap__content,.activitys{width:100%}.activitys__slides,.activity__body{height:100vh}.activity{opacity:1}.head{height:4em}.lp-cover{opacity:1}`});
  for(let f of ['../node_modules/jquery/dist/jquery.min.js','fixtures/lampa-mock.js'])await p.addScriptTag({path:__dirname+'/'+f});
  await p.evaluate(meta=>{if(!meta)return;const Original=Lampa.Reguest;Lampa.Reguest=function(){let r=new Original(),request=r.native;r.native=r.silent=(url,done,...rest)=>request.call(r,url,value=>{if(url.includes('/ajax/get_cdn_series')&&value.url)Object.assign(value,meta);done(value)},...rest);return r;};},metadata);
  await p.evaluate(()=>{const push=Lampa.Activity.push;Lampa.Activity.push=function(o){const screen=push(o);jQuery('#activity').append(screen.render());screen.start();return screen};});await p.addScriptTag({path:__dirname+'/../lamplay.js'});await p.evaluate(f=>mock.open(f),film);await p.waitForTimeout(300);return p;
 }
 // No-op choices preserve the exact nodes, focus and request count in each layout.
 for(const view of ['horizontal','vertical','card']){
  const p=await page();await p.evaluate(v=>{while(document.querySelector('.lamplay').dataset.view!==v)mock.click('Вид:')},view);await p.waitForTimeout(320);
  const result=await p.evaluate(()=>{const row=jQuery('.lp-episode')[2],s=jQuery('.lp-strip').eq(0).find('.lp-selected'),v=jQuery('.lp-strip').eq(1).find('.lp-selected');const count=mock.calls.length;s.trigger('hover:enter');v.trigger('hover:enter');return{same:jQuery('.lp-episode')[2]===row,calls:mock.calls.length-count,loading:jQuery('.lamplay').hasClass('lp-loading')};});assert.deepEqual(result,{same:true,calls:0,loading:false});
  if(view==='vertical'){const g=await p.evaluate(()=>{let r=document.querySelector('.lp-strip').getBoundingClientRect(),pane=document.querySelector('.lp-body-pane'),s=getComputedStyle(pane);return{right:r.right,edge:pane.getBoundingClientRect().right-parseFloat(s.paddingRight)}});assert.ok(Math.abs(g.right-g.edge)<1,JSON.stringify(g));}
  await p.evaluate(()=>{Lampa.Controller.collectionFocus(jQuery('.lp-episode').eq(4),jQuery('.lamplay'));});await p.waitForTimeout(90);let mid=await p.locator('.lp-body-pane').evaluate(n=>({p:n.scrollLeft+n.scrollTop,active:!!n._lpScrollFrame}));assert.ok(mid.active&&mid.p>0);
  await p.evaluate(()=>Lampa.Controller.collectionFocus(jQuery('.lp-episode').eq(5),jQuery('.lamplay')));await p.waitForTimeout(340);assert.equal(await p.locator('.lp-body-pane').evaluate(n=>!!n._lpScrollFrame),false);
  // Delay a real translation change: cover, filter nodes and row geometry remain stable.
  const before=await p.locator('.lp-episode').first().boundingBox();const stable=await p.evaluate(()=>{window.savedFilter=document.querySelector('.lp-strip');mock.hold();jQuery('.lp-strip').eq(1).children('.selector').eq(1).trigger('hover:enter');return document.querySelector('.lp-strip')===savedFilter;});assert.equal(stable,true);assert.equal(await p.locator('.lamplay').getAttribute('aria-busy'),'true');assert.equal(await p.locator('.lp-skeleton').count(),6);assert.equal(await p.locator('.lp-loader').evaluate(n=>getComputedStyle(n).opacity),'1');const loading=await p.locator('.lp-skeleton').first().boundingBox();assert.ok(Math.abs(before.width-loading.width)<1,JSON.stringify({view,before,loading}));await p.close();
 }
 console.log('PASS selected filters do not reload; real changes keep filters and cover; skeleton widths and loader; 260ms scroll retarget and List filter edge');
 for(const [w,h] of [[1920,1080],[1280,720],[390,844]]){
  const p=await page(w,h,w<600?16:20,true);
  for(const view of ['vertical','card']){
   await p.evaluate(v=>{while(document.querySelector('.lamplay').dataset.view!==v)mock.click('Вид:')},view);await p.waitForTimeout(350);
   const g=await p.evaluate(()=>{const row=document.querySelector('.lp-episode'),s=getComputedStyle(row),pic=row.querySelector('.lp-picture'),info=row.querySelector('.lp-episode-info'),bar=info.querySelector('.lp-progress'),b=bar.getBoundingClientRect(),i=info.getBoundingClientRect(),hero=document.querySelector('.lp-hero'),logo=hero.querySelector('.lp-title-logo'),r=logo.getBoundingClientRect(),hr=hero.getBoundingClientRect();return{picture:getComputedStyle(pic).display,duration:row.querySelector('.lp-row-duration').textContent,caption:row.querySelector('.lp-film-caption').textContent,bar:b.width,info:i.width,logoError:Math.abs(r.left+r.width/2-hr.left-hr.width/2),side:document.querySelector('.lp-side').getBoundingClientRect().right,main:document.querySelector('.lp-main').getBoundingClientRect().left,white:s.backgroundColor};});
   assert.equal(g.picture,'none');assert.equal(g.duration,'1 ч 53 мин.');assert.ok(g.caption.includes('2026')&&g.caption.includes('Иногда')&&!g.caption.includes('113'));assert.ok(Math.abs(g.bar-g.info)<2,JSON.stringify(g));assert.ok(g.logoError<2,JSON.stringify(g));if(w>600)assert.ok(g.side<g.main);
   await p.evaluate(()=>Lampa.Controller.collectionFocus(jQuery('.lp-episode').first(),jQuery('.lamplay')));const focused=await p.locator('.lp-episode').first().evaluate(n=>({bg:getComputedStyle(n).backgroundColor,track:getComputedStyle(n.querySelector('.lp-episode-info>.lp-progress')).backgroundColor}));assert.equal(focused.bg,'rgba(255, 255, 255, 0.15)');assert.notEqual(focused.track,'rgba(0, 0, 0, 0)');
   await p.evaluate(()=>{const n=document.querySelector('.lp-search .lp-control-value');n.textContent='Человек-паук: Новый день и очень длинное название '.repeat(10);window.dispatchEvent(new Event('resize'));});await p.waitForTimeout(200);const search=await p.locator('.lp-search .lp-control-value').evaluate(n=>({white:getComputedStyle(n).whiteSpace,width:n.clientWidth,full:n.scrollWidth,fade:getComputedStyle(n).webkitMaskImage}));assert.equal(search.white,'nowrap');assert.ok(search.width<search.full&&search.fade.includes('gradient'));
   if(w===1920)await p.screenshot({path:__dirname+'/renders/014-film-'+view+'.png'});
  }
  await p.close();
 }
 const metaPage=await page(1920,1080,20,true,{languages:['RU','ENG','RU'],dynamic_range:'HDR10'});await metaPage.waitForTimeout(450);assert.equal(await metaPage.locator('.lp-stream-info').first().textContent(),'RU, ENG · HDR10 · 4K');await metaPage.close();
 console.log('PASS movies in List/Showcase at TV and mobile sizes: columns, quiet focus, full track, no play gutter, hours/minutes, single metadata row, centered logo and one-line search');
 await b.close();assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);process.exit(1)});
