const {chromium}=require('../node_modules/playwright'),assert=require('assert/strict'),fs=require('fs');
(async()=>{fs.mkdirSync(__dirname+'/renders',{recursive:true});const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}),errors=[];
 async function page(width=1920,height=1080,font=20,film=false,metadata=null,code=null){
  const p=await b.newPage({viewport:{width,height}});p.on('pageerror',e=>errors.push(e.message));await p.setContent('<div class="wrap"><div class="wrap__content"><div class="activitys"><div class="activitys__slides"><div class="activity activity--active"><div class="activity__body" id="activity"></div></div></div></div></div></div><header class="head"><div class="head__title">LamPlay</div></header>');await p.addStyleTag({path:__dirname+'/research/host.css'});
  await p.addStyleTag({content:`html,body{font:${font}px Arial;margin:0;height:100vh;width:100vw;background:#25313b;color:white}*{box-sizing:border-box}.wrap,.wrap__content,.activitys{width:100%}.activitys__slides,.activity__body{height:100vh}.activity{opacity:1}.head{height:4em}.lp-cover{opacity:1}`});
  for(let f of ['../node_modules/jquery/dist/jquery.min.js','fixtures/lampa-mock.js'])await p.addScriptTag({path:__dirname+'/'+f});
  await p.evaluate(()=>{jQuery('body').prepend('<div class="background" style="background:linear-gradient(120deg,rgb(105,35,55),rgb(40,110,140));z-index:0"></div>');jQuery('body').append(jQuery('<img class="full-start__background loaded">').attr('src',mock.svg('Native')));window.hostMask=getComputedStyle(document.querySelector('.full-start__background')).webkitMaskImage;mock.backgroundCalls=[];Lampa.Utils.cardImgBackground=c=>{mock.backgroundCard=c;return mock.svg('Colors')};Lampa.Background={change:src=>mock.backgroundCalls.push(src)};});
  await p.evaluate(meta=>{if(!meta)return;const Original=Lampa.Reguest;Lampa.Reguest=function(){let r=new Original(),request=r.native;r.native=r.silent=(url,done,...rest)=>request.call(r,url,value=>{if(url.includes('/ajax/get_cdn_series')&&value.url)Object.assign(value,meta);done(value)},...rest);return r;};},metadata);
  await p.evaluate(()=>{const push=Lampa.Activity.push;Lampa.Activity.push=function(o){const screen=push(o);jQuery('#activity').append(screen.render());screen.start();return screen};});await p.addScriptTag(code?{content:code}:{path:__dirname+'/../lamplay.js'});await p.evaluate(f=>{const Original=Lampa.Reguest;Lampa.Reguest=function(){let r=new Original(),request=r.native;r.native=r.silent=(u,done,...a)=>request.call(r,u,d=>{if(u.includes('/season/')&&d.episodes){d.episodes[0].runtime=80;d.episodes[1].runtime=60;d.episodes[2].runtime=45;}done(d)},...a);return r;};mock.open(f)},film);await p.waitForTimeout(300);return p;
 }

 const {execFileSync}=require('child_process'),baseline=execFileSync('git',['show','0770401b28a9d54f747cb9c25a712620e9a4eba5:lamplay.js'],{encoding:'utf8',maxBuffer:2e6});
 async function view(p,v){await p.evaluate(v=>{while(document.querySelector('.lamplay').dataset.view!==v)mock.click('Вид:')},v);await p.waitForTimeout(350);}
 async function geometry(p){return p.evaluate(()=>{let o={};for(let sel of ['.lp-title-logo','.lp-resume-row','.lp-strip-group','.lp-tools','.lp-episode','.lp-picture','.lp-description']){let n=document.querySelector(sel);if(!n)continue;let s=getComputedStyle(n);o[sel]={rect:n.getBoundingClientRect().toJSON(),font:s.fontSize,padding:s.padding}}let nodes=[...document.querySelectorAll('.lp-filters>.lp-strip-group,.lp-filters>.lp-tools')];o.groups=nodes.map(n=>n.getBoundingClientRect().toJSON());return o});}
 for(const [w,h,font] of [[1920,1080,20],[1920,1080,24],[1280,720,16],[1280,720,20],[960,540,14]]){
  const before=await page(w,h,font,false,null,baseline),after=await page(w,h,font);
  await view(before,'card');await view(after,'card');const a=await geometry(before),c=await geometry(after),oldGap=a['.lp-picture'].rect.y-a.groups.at(-1).bottom,newGap=c['.lp-picture'].rect.y-c.groups.at(-1).bottom;
  assert.ok(Math.abs(newGap-oldGap/2)<1,JSON.stringify({w,h,font,oldGap,newGap}));
  for(let sel of ['.lp-title-logo','.lp-resume-row','.lp-episode','.lp-picture','.lp-description'])assert.deepEqual(c[sel],a[sel],sel+' must stay fixed');
  for(let sel of ['.lp-strip-group','.lp-tools']){assert.equal(c[sel].font,a[sel].font);assert.equal(c[sel].rect.height,a[sel].rect.height);}
  for(let i=1;i<c.groups.length;i++)assert.ok(c.groups[i].top-c.groups[i-1].bottom>a.groups[i].top-a.groups[i-1].bottom);
  assert.ok(await after.evaluate(()=>[...document.querySelectorAll('.lp-filters>.lp-tools .selector')].every(n=>{const r=n.getBoundingClientRect();if(r.left<0||r.right>innerWidth)return true;return n.contains(document.elementFromPoint(r.left+r.width/2,r.bottom-2))})));
  const stable=c.groups;await after.evaluate(()=>{for(let i=0;i<5;i++)mock.screen.start()});assert.deepEqual((await geometry(after)).groups,stable);
  // Remote focus reaches displaced rows; focusing episodes does not move their resting geometry.
  await after.evaluate(()=>{Lampa.Controller.collectionFocus(jQuery('.lp-tools .selector').first(),jQuery('.lamplay'));mock.controllers.content.up()});assert.ok(await after.locator('.lp-strip .focus').count());await after.evaluate(()=>{Lampa.Controller.collectionFocus(jQuery('.lp-tools .selector').first(),jQuery('.lamplay'));mock.controllers.content.down()});assert.ok(await after.locator('.lp-episode.focus').count());
  if(w===1920&&font===20)await after.screenshot({path:__dirname+'/renders/017-series-card.png'});
  await view(before,'horizontal');await view(after,'horizontal');assert.deepEqual(await geometry(after),await geometry(before));await view(before,'vertical');await view(after,'vertical');assert.deepEqual(await geometry(after),await geometry(before));
  await before.close();await after.close();
 }
 console.log('PASS Series Showcase filter gap halved at five viewport/font combinations; card positions, text, logo and control sizes unchanged; row focus and repeated layout stable; List/Ribbon unchanged');
 for(const [w,h,font] of [[1920,1080,20],[1280,720,20],[960,540,14]]){
  const p=await page(w,h,font,true);
  for(const v of ['vertical','card']){
   await view(p,v);await p.evaluate(()=>Lampa.Controller.collectionFocus(jQuery('.lp-episode').last(),jQuery('.lamplay')));await p.waitForTimeout(400);
   const g=await p.evaluate(()=>{let pane=document.querySelector('.lp-body-pane'),rows=[...document.querySelectorAll('.lp-episode')],a=rows.at(-1).getBoundingClientRect(),prev=rows.at(-2).getBoundingClientRect(),b=pane.getBoundingClientRect();return{gap:a.top-prev.bottom,bottom:innerHeight-a.bottom,pad:parseFloat(getComputedStyle(pane).paddingBottom),remaining:pane.scrollHeight-pane.clientHeight-pane.scrollTop,fade:pane.dataset.lpFadeAfter,mask:getComputedStyle(pane).webkitMaskImage}});
   assert.ok(g.bottom>=g.gap-1&&g.pad>=g.gap-1,JSON.stringify({v,w,g}));assert.ok(g.remaining<2,JSON.stringify({v,w,g}));assert.equal(g.fade,'false');
   await p.evaluate(()=>Lampa.Controller.collectionFocus(jQuery('.lp-episode').eq(4),jQuery('.lamplay')));await p.waitForTimeout(400);assert.equal(await p.locator('.lp-body-pane').getAttribute('data-lp-fade-before'),'true');assert.equal(await p.locator('.lp-body-pane').getAttribute('data-lp-fade-after'),'true');
   if(w===1920)await p.screenshot({path:__dirname+'/renders/017-film-'+v+'.png'});
  }await p.close();
 }
 console.log('PASS both movie views have terminal bottom spacing equal to row gap; final row reachable with full contour, conditional fades retained');
 await b.close();assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);process.exit(1)});
