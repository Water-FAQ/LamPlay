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

 const {execFileSync}=require('child_process');
 const old14=execFileSync('git',['show','b96ae0d78f6775472cd5b6611212cf32dc400e51:lamplay.js'],{encoding:'utf8',maxBuffer:2e6});
 const old15=execFileSync('git',['show','cfd752ccb1d695d156aa824a343254ada9c422de:lamplay.js'],{encoding:'utf8',maxBuffer:2e6});
 // 0.17 offsets filter groups visually; retain the 0.16 flow-layout invariant here.
 // The 0.17 suite checks actual visual positions and the new movie bottom padding.
 async function geometry(p){return p.evaluate(()=>{const sels=['.lp-hero-content','.lp-title-slot','.lp-title-logo','.lp-resume-row','.lp-filters','.lp-caption','.lp-strip .lamplay__control','.lp-tools','.lp-body-pane','.lp-picture','.lp-description'];let o={};for(let sel of sels){let n=document.querySelector(sel);if(!n)continue;let s=getComputedStyle(n);let box=n.getBoundingClientRect().toJSON(),group=n.closest('.lp-filters')&&n.closest('.lp-strip-group,.lp-tools');if(group){let shift=parseFloat(getComputedStyle(group).top)||0;box.y-=shift;box.top-=shift;box.bottom-=shift;}o[sel]={box,font:s.fontSize,gap:s.gap,padding:sel==='.lp-body-pane'?'':s.padding,margin:s.margin,height:s.height}}return o;});}
 async function view(p,v){await p.evaluate(v=>{while(document.querySelector('.lamplay').dataset.view!==v)mock.click('Вид:')},v);await p.waitForTimeout(350);}
 for(const [w,h,font] of [[1920,1080,20],[1920,1080,24],[1280,720,16],[1280,720,20],[960,540,14]]){
  const before=await page(w,h,font,false,null,old14),after=await page(w,h,font);
  await view(before,'card');await view(after,'card');const a=await geometry(before),c=await geometry(after);
  const delta=c['.lp-caption'].box.y-a['.lp-caption'].box.y;
  assert.ok(delta>=0&&delta<font*2,JSON.stringify({w,h,font,delta}));
  for(const sel of Object.keys(a)){
   assert.equal(c[sel].font,a[sel].font,sel+' font');assert.equal(c[sel].gap,a[sel].gap,sel+' gap');assert.equal(c[sel].padding,a[sel].padding,sel+' padding');
   if(sel!=='.lp-title-slot')assert.ok(Math.abs(c[sel].box.width-a[sel].box.width)<1,sel+' width');
   if(sel!=='.lp-body-pane')assert.ok(Math.abs(c[sel].box.height-a[sel].box.height)<1,sel+' height');
  }
  for(const sel of ['.lp-filters','.lp-tools','.lp-body-pane','.lp-picture','.lp-description'])assert.ok(Math.abs(c[sel].box.y-a[sel].box.y-delta)<1,sel+' only shifts by season clearance');
  assert.ok(c['.lp-title-logo'].box.x<font*3);assert.ok(Math.abs(c['.lp-title-logo'].box.y-a['.lp-title-logo'].box.y)<1);assert.ok(c['.lp-caption'].box.y-c['.lp-resume-row'].box.bottom>=font*.35);
  // Repeated layout passes must not accumulate margins or switch compact mode.
  await after.evaluate(()=>{for(let i=0;i<5;i++)mock.screen.start()});const stable=await geometry(after);assert.ok(Math.abs(stable['.lp-caption'].box.y-c['.lp-caption'].box.y)<1);
  if(w===1920&&font===20)await after.screenshot({path:__dirname+'/renders/016-series-card.png'});
  await before.close();await after.close();
 }
 console.log('PASS Series Showcase matches 0.14 fonts, button sizes, row spacing, logo size/height and strip geometry; only left logo and season clearance differ at five TV/font sizes');
 // Other layouts stay at their published 0.15 geometry.
 for(const film of [false,true]){
  const before=await page(1920,1080,20,film,null,old15),after=await page(1920,1080,20,film);
  for(const v of film?['vertical','card']:['horizontal','vertical']){await view(before,v);await view(after,v);assert.deepEqual(await geometry(after),await geometry(before));}
  await before.close();await after.close();
 }
 console.log('PASS film layouts and Series List/Ribbon unchanged from 0.15');
 // Run the actual native background scheduler: compare the delayed 0.15 path with 0.16.
 for(const film of [false,true])for(const legacy of [true,false]){
  const p=await page(960,540,14,film,null,legacy?old15:null);
  await p.addScriptTag({path:__dirname+'/research/background-native.js'});
  await p.evaluate(()=>{jQuery('.background').remove();Lampa.Storage.set('background',true);Lampa.Storage.set('background_type','simple');Lampa.Storage.set('light_version',false);installNativeBackground(Lampa);window.nativeCalls=[];for(const k of ['change','immediately']){const fn=Lampa.Background[k];Lampa.Background[k]=function(url){nativeCalls.push({k,time:performance.now()});return fn(url)}}});
  await p.waitForTimeout(1050);await view(p,'card');
  // Fresh start forces one synchronization while keeping the loaded native image/mask.
  await p.evaluate(()=>{mock.screen.pause();mock.screen.start();window.startedAt=performance.now()});
  await p.waitForTimeout(220);
  let state=await p.evaluate(()=>({immediate:nativeCalls.filter(x=>x.k==='immediately').length,alpha:document.querySelector('.background__fade').getContext('2d').getImageData(15,15,1,1).data[3],mask:getComputedStyle(document.querySelector('.lp-native-background')).webkitMaskImage,host:hostMask}));
  assert.equal(state.mask,state.host);if(legacy){assert.equal(state.immediate,0);assert.equal(state.alpha,0)}else{assert.ok(state.immediate>0);assert.ok(state.alpha>0,JSON.stringify({film,state}));}
  await p.close();
 }
 console.log('PASS native background scheduler: both Showcases draw in first 220ms instead of waiting for 1000ms queue; host image mask retained');
 // A host without immediately still receives change, and leaving Showcase does not call it.
 const p=await page();await p.evaluate(()=>{mock.fastCalls=[];Lampa.Background.immediately=src=>mock.fastCalls.push(src)});await view(p,'card');assert.ok(await p.evaluate(()=>mock.fastCalls.length>0));await p.evaluate(()=>{mock.fastCalls=[]});await view(p,'vertical');assert.equal(await p.evaluate(()=>mock.fastCalls.length),0);await p.evaluate(()=>{delete Lampa.Background.immediately});await view(p,'card');assert.ok(await p.evaluate(()=>mock.backgroundCalls.length>0));await p.close();
 console.log('PASS native fallback and Showcase-only immediate synchronization');
 await b.close();assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);process.exit(1)});
