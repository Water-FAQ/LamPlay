const {chromium}=require('../node_modules/playwright'),assert=require('assert/strict'),fs=require('fs');
(async()=>{fs.mkdirSync(__dirname+'/renders',{recursive:true});const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}),errors=[];
 async function page(width=1920,height=1080,font=20,film=false,metadata=null){
  const p=await b.newPage({viewport:{width,height}});p.on('pageerror',e=>errors.push(e.message));await p.setContent('<div class="wrap"><div class="wrap__content"><div class="activitys"><div class="activitys__slides"><div class="activity activity--active"><div class="activity__body" id="activity"></div></div></div></div></div></div><header class="head"><div class="head__title">LamPlay</div></header>');await p.addStyleTag({path:__dirname+'/research/host.css'});
  await p.addStyleTag({content:`html,body{font:${font}px Arial;margin:0;height:100vh;width:100vw;background:#25313b;color:white}*{box-sizing:border-box}.wrap,.wrap__content,.activitys{width:100%}.activitys__slides,.activity__body{height:100vh}.activity{opacity:1}.head{height:4em}.lp-cover{opacity:1}`});
  for(let f of ['../node_modules/jquery/dist/jquery.min.js','fixtures/lampa-mock.js'])await p.addScriptTag({path:__dirname+'/'+f});
  await p.evaluate(()=>{jQuery('body').prepend('<div class="background" style="background:linear-gradient(120deg,rgb(105,35,55),rgb(40,110,140));z-index:0"></div>');jQuery('body').append(jQuery('<img class="full-start__background loaded">').attr('src',mock.svg('Native')));window.hostMask=getComputedStyle(document.querySelector('.full-start__background')).webkitMaskImage;mock.backgroundCalls=[];Lampa.Utils.cardImgBackground=c=>{mock.backgroundCard=c;return mock.svg('Colors')};Lampa.Background={change:src=>mock.backgroundCalls.push(src)};});
  await p.evaluate(meta=>{if(!meta)return;const Original=Lampa.Reguest;Lampa.Reguest=function(){let r=new Original(),request=r.native;r.native=r.silent=(url,done,...rest)=>request.call(r,url,value=>{if(url.includes('/ajax/get_cdn_series')&&value.url)Object.assign(value,meta);done(value)},...rest);return r;};},metadata);
  await p.evaluate(()=>{const push=Lampa.Activity.push;Lampa.Activity.push=function(o){const screen=push(o);jQuery('#activity').append(screen.render());screen.start();return screen};});await p.addScriptTag({path:__dirname+'/../lamplay.js'});await p.evaluate(f=>{const Original=Lampa.Reguest;Lampa.Reguest=function(){let r=new Original(),request=r.native;r.native=r.silent=(u,done,...a)=>request.call(r,u,d=>{if(u.includes('/season/')&&d.episodes){d.episodes[0].runtime=80;d.episodes[1].runtime=60;d.episodes[2].runtime=45;}done(d)},...a);return r;};mock.open(f)},film);await p.waitForTimeout(300);return p;
 }

 for(const film of [false,true])for(const [w,h,font] of [[1920,1080,20],[1280,720,20],[960,540,14]]){
  const p=await page(w,h,font,film);
  for(const view of film?['vertical','card']:['horizontal','vertical','card']){
   await p.evaluate(v=>{while(document.querySelector('.lamplay').dataset.view!==v)mock.click('Вид:')},view);await p.waitForTimeout(380);
   assert.equal(await p.locator('.head__title .lp-header-logo').count(),1);
   if(view==='card'){
    const bg=await p.evaluate(()=>{let n=document.querySelector('.lp-native-background'),s=getComputedStyle(n);return{color:getComputedStyle(document.querySelector('.background')).visibility,mask:s.webkitMaskImage,host:hostMask,overlays:document.querySelectorAll('body>.lp-vignette').length,filter:s.filter,opacity:+s.opacity,calls:mock.backgroundCalls.length,poster:mock.backgroundCard.poster_path};});
    assert.equal(bg.color,'visible');assert.equal(bg.mask,bg.host);assert.ok(bg.mask.startsWith('url('));assert.equal(bg.overlays,0);assert.equal(bg.filter,'none');assert.ok(bg.opacity>0);assert.ok(bg.calls>0&&bg.poster); 
   }
   if(film){
    const g=await p.evaluate(()=>{let hero=document.querySelector('.lp-hero').getBoundingClientRect().toJSON(),row=document.querySelector('.lp-episode').getBoundingClientRect().toJSON(),logo=document.querySelector('.lp-title-logo').getBoundingClientRect().toJSON(),action=document.querySelector('.lp-continue'),icon=action.querySelector('.lp-play').getBoundingClientRect().toJSON(),text=action.querySelector('.lp-resume-detail').getBoundingClientRect().toJSON(),tools=document.querySelector('.lp-tools').getBoundingClientRect().toJSON();return{hero,row,logo,icon,text,tools,font:parseFloat(getComputedStyle(action.querySelector('.lp-resume-detail')).fontSize),base:parseFloat(getComputedStyle(document.querySelector('.lamplay')).fontSize),track:document.querySelectorAll('.lp-hero .lp-progress').length,actionBottom:action.getBoundingClientRect().toJSON().bottom};});
    assert.ok(Math.abs(g.row.y-g.hero.y)<2,JSON.stringify({view,w,g}));assert.ok(g.font>=g.base*.85,JSON.stringify(g));assert.equal(g.track,0);assert.ok(Math.abs((g.icon.x+g.text.x+g.text.width)/2-(g.hero.x+g.hero.width/2))<2,JSON.stringify(g));
    if(view==='card')assert.ok(g.hero.height<160&&g.hero.y<font*6,JSON.stringify(g));else assert.ok(g.hero.y+g.hero.height-g.actionBottom<font*1.1,JSON.stringify(g));
    for(let i=0;i<9;i++){
     await p.evaluate(i=>{Lampa.Controller.collectionFocus(jQuery('.lp-episode').eq(i),jQuery('.lamplay'));mock.controllers.content.left()},i);
     assert.equal(await p.evaluate(()=>mock.controller),'content');assert.ok(await p.locator('.lp-tools .focus').count());
    }
    await p.evaluate(()=>Lampa.Controller.collectionFocus(jQuery('.lp-episode').eq(4),jQuery('.lamplay')));await p.waitForTimeout(350);
    assert.equal(await p.locator('.lp-body-pane').getAttribute('data-lp-fade-before'),'true');assert.equal(await p.locator('.lp-body-pane').getAttribute('data-lp-fade-after'),'true');
   }else{
    const duration=await p.locator(view==='vertical'?'.lp-row-duration':'.lp-runtime').allTextContents();assert.ok(duration.includes('1 ч 20 мин.')&&duration.includes('1 ч')&&duration.includes('45 мин.'),JSON.stringify(duration));
    if(view==='card'){
     let g=await p.evaluate(()=>{let title=document.querySelector('.lp-title-slot').getBoundingClientRect().toJSON(),hero=document.querySelector('.lp-hero-content').getBoundingClientRect().toJSON(),resume=document.querySelector('.lp-resume-row').getBoundingClientRect().toJSON(),season=document.querySelector('.lp-caption').getBoundingClientRect().toJSON();return{title,hero,resume,season}});
     assert.ok(g.title.x<font*3&&g.title.width<=w*.31,JSON.stringify(g));assert.ok(g.resume.y+g.resume.height+2<=g.season.y,JSON.stringify(g));
    }
   }
   if(w===1920)await p.screenshot({path:__dirname+'/renders/015-'+(film?'film':'series')+'-'+view+'.png'});
  }
  await p.evaluate(()=>mock.screen.pause());assert.equal(await p.locator('.lp-header-logo').count(),0);await p.evaluate(()=>mock.screen.start());await p.waitForTimeout(40);assert.equal(await p.locator('.lp-header-logo').count(),1);await p.close();
 }
 console.log('PASS native background visible with original Lampa image mask and no black overlay, films and series at 1080p/720p/540p');
 console.log('PASS series Showcase left logo and clear season gap; series hour/minute duration in every view');
 console.log('PASS movies top alignment, compact Showcase, centered readable action without track, all nine Left transitions and both vertical fades');
 console.log('PASS header icon survives view changes, pause/resume and does not duplicate');
 await b.close();assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);process.exit(1)});
