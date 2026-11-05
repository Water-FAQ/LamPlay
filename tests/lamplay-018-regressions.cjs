const {chromium}=require('../node_modules/playwright'),assert=require('assert/strict'),fs=require('fs');
(async()=>{fs.mkdirSync(__dirname+'/renders',{recursive:true});const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}),errors=[];
 async function page(width=1920,height=1080,font=20,film=false,metadata=null,code=null,results=false){
  const p=await b.newPage({viewport:{width,height}});p.on('pageerror',e=>errors.push(e.message));await p.setContent('<div class="wrap"><div class="wrap__content"><div class="activitys"><div class="activitys__slides"><div class="activity activity--active"><div class="activity__body" id="activity"></div></div></div></div></div></div><header class="head"><div class="head__title">LamPlay</div></header>');await p.addStyleTag({path:__dirname+'/research/host.css'});
  await p.addStyleTag({content:`html,body{font:${font}px Arial;margin:0;height:100vh;width:100vw;background:#25313b;color:white}*{box-sizing:border-box}.wrap,.wrap__content,.activitys{width:100%}.activitys__slides,.activity__body{height:100vh}.activity{opacity:1}.head{height:4em}.lp-cover{opacity:1}`});
  for(let f of ['../node_modules/jquery/dist/jquery.min.js','fixtures/lampa-mock.js'])await p.addScriptTag({path:__dirname+'/'+f});
  await p.evaluate(()=>{jQuery('body').prepend('<div class="background" style="background:linear-gradient(120deg,rgb(105,35,55),rgb(40,110,140));z-index:0"></div>');jQuery('body').append(jQuery('<img class="full-start__background loaded">').attr('src',mock.svg('Native')));window.hostMask=getComputedStyle(document.querySelector('.full-start__background')).webkitMaskImage;mock.backgroundCalls=[];Lampa.Utils.cardImgBackground=c=>{mock.backgroundCard=c;return mock.svg('Colors')};Lampa.Background={change:src=>mock.backgroundCalls.push(src)};});
  await p.evaluate(meta=>{if(!meta)return;const Original=Lampa.Reguest;Lampa.Reguest=function(){let r=new Original(),request=r.native;r.native=r.silent=(url,done,...rest)=>request.call(r,url,value=>{if(url.includes('/ajax/get_cdn_series')&&value.url)Object.assign(value,meta);done(value)},...rest);return r;};},metadata);
  await p.evaluate(()=>{const push=Lampa.Activity.push;Lampa.Activity.push=function(o){const screen=push(o);jQuery('#activity').append(screen.render());screen.start();return screen};});await p.evaluate(r=>window.testResults=r,results);await p.addScriptTag(code?{content:code}:{path:__dirname+'/../lamplay.js'});await p.evaluate(f=>{const Original=Lampa.Reguest;Lampa.Reguest=function(){let r=new Original(),request=r.native;r.native=r.silent=(u,done,...a)=>request.call(r,u,d=>{if(u.includes('/season/')&&d.episodes){d.episodes[0].runtime=80;d.episodes[1].runtime=60;d.episodes[2].runtime=45;}done(d)},...a);return r;};if(window.testResults){mock.ambiguous();mock.set('view_series',window.testResults);mock.set('view_movie',window.testResults);const Req=Lampa.Reguest;Lampa.Reguest=function(){const r=new Req(),native=r.native;r.native=r.silent=(url,done,...args)=>native.call(r,url,data=>{if(url.includes('do=search')||url.includes('/engine/ajax/search.php'))data=Array.from({length:24},(_,i)=>String(data).replaceAll('/1.html','/'+(100+i)+'.html').replaceAll('/2.html','/'+(200+i)+'.html')).join('');done(data)},...args);return r;};}mock.open(f)},film);await p.waitForTimeout(300);return p;
 }


 async function view(p,v){await p.evaluate(v=>{while(document.querySelector('.lamplay').dataset.view!==v)mock.click('Вид:')},v);await p.waitForTimeout(350)}
 for(const v of ['vertical','horizontal','card']){
  const p=await page();await view(p,v);
  const report=await p.evaluate(async()=>{
   const rows=jQuery('.lp-episode'),pane=document.querySelector('.lp-body-pane');
   const snapshot=()=>[...rows.slice(0,2)].map(n=>[n,...n.querySelectorAll('.lp-picture,.lp-episode-info,.lp-episode-number,.lp-quality,.lp-runtime,.lp-percent,.lp-progress,.lamplay__item-title,.lp-picture img')].map(x=>({class:x.className,box:x.getBoundingClientRect().toJSON(),transform:getComputedStyle(x).transform})));
   Lampa.Controller.collectionFocus(rows.eq(0),jQuery('.lamplay'));await new Promise(r=>setTimeout(r,350));
   // Keep both rows visible and inspect focus decoration independently of scrolling.
   if(pane._lpScrollFrame)cancelAnimationFrame(pane._lpScrollFrame);pane.scrollTop=0;pane.scrollLeft=0;
   const before=snapshot();rows.removeClass('focus');rows.eq(1).addClass('focus');
   const samples=[snapshot()];for(let i=0;i<18;i++){await new Promise(requestAnimationFrame);samples.push(snapshot())}
   const colors=[...document.querySelectorAll('.lp-episode .lp-progress i')].slice(0,2).map(n=>getComputedStyle(n).backgroundColor);
   const picture=rows.eq(1).find('.lp-picture')[0],style=getComputedStyle(picture);
   return {before,samples,colors,offset:style.outlineOffset,width:style.outlineWidth};
  });
  for(const sample of report.samples)for(let i=0;i<sample.length;i++)for(let j=0;j<sample[i].length;j++){
   const a=report.before[i][j],c=sample[i][j];assert.equal(c.transform,'none',c.class);
   for(const k of ['x','y','width','height'])assert.ok(Math.abs(a.box[k]-c.box[k])<.05,JSON.stringify({v,k,a,c}));
  }
  assert.deepEqual(report.colors,['rgb(255, 255, 255)','rgb(255, 255, 255)']);
  if(v!=='vertical'){assert.equal(report.offset,'0px');assert.ok(parseFloat(report.width)>0)}
  await p.screenshot({path:__dirname+'/renders/018-series-'+v+'.png'});await p.close();
 }
 console.log('PASS all series views: focus preserves content geometry for 19 animation frames; progress stays white and active image outline has zero gap');
 for(const film of [false,true])for(const setting of ['horizontal','vertical','card']){
  const p=await page(1280,720,16,film,null,null,setting);
  const report=await p.evaluate(()=>{
   const first=document.querySelector('.lp-result'),pane=document.querySelector('.lp-body-pane'),hero=document.querySelector('.lp-hero');

   mock.screen.start();return {status:jQuery('.lamplay__status').text(),visible:jQuery('.lamplay__status').is(':visible'),top:first.getBoundingClientRect().top,heroTop:hero.getBoundingClientRect().top};
  });await p.waitForTimeout(80);
  assert.equal(report.visible,false);assert.ok(!report.status.includes('Выберите'));assert.ok(Math.abs(report.top-report.heroTop)<1,JSON.stringify(report));
  const first=p.locator('.lp-result').first();await p.evaluate(()=>Lampa.Controller.collectionFocus(jQuery('.lp-result').first(),jQuery('.lamplay')));await p.waitForTimeout(300);
  let focus=await first.evaluate(n=>{const s=getComputedStyle(n);return {bg:s.backgroundColor,color:s.color,shadow:s.boxShadow,border:s.borderTopColor}});
  assert.equal(focus.bg,'rgba(255, 255, 255, 0.15)');assert.equal(focus.color,'rgb(255, 255, 255)');assert.ok(focus.shadow.includes('inset'));
  const motion=await p.evaluate(async()=>{
   const pane=document.querySelector('.lp-body-pane'),target=jQuery('.lp-result').eq(8);
   Lampa.Controller.collectionFocus(target,jQuery('.lamplay'));const start=pane.scrollTop,positions=[];
   for(let i=0;i<22;i++){await new Promise(requestAnimationFrame);positions.push(pane.scrollTop)}
   return {start,positions,before:pane.dataset.lpFadeBefore,after:pane.dataset.lpFadeAfter,mask:getComputedStyle(pane).webkitMaskImage};
  });
  assert.ok(motion.positions.at(-1)>motion.start,JSON.stringify(motion));assert.ok(new Set(motion.positions).size>4);assert.equal(motion.before,'true');assert.equal(motion.after,'true');assert.ok(motion.mask.includes('rgba(0, 0, 0, 0)'));
  await p.evaluate(()=>Lampa.Controller.collectionFocus(jQuery('.lp-result').last(),jQuery('.lamplay')));await p.waitForTimeout(350);
  assert.equal(await p.locator('.lp-body-pane').getAttribute('data-lp-fade-after'),'false');
  await p.screenshot({path:__dirname+'/renders/018-results-'+film+'-'+setting+'.png'});await p.close();
 }
 console.log('PASS results for films/series: no prompt, top alignment, translucent outlined focus, animated scroll, conditional top/bottom fades');

 // Metadata may return a different backdrop. Continue must use the Showcase choice.
 for(const film of [false,true]){
  const p=await page(1920,1080,20,film);
  await p.evaluate(f=>{mock.screen.destroy();jQuery('.lamplay').remove();Lampa.TMDB.image=path=>mock.svg(path);Lampa.Activity.push({component:'lamplay',movie:{id:777,source:'tmdb',media_type:f?'movie':'tv',title:f?'Тестовый фильм':undefined,name:f?undefined:'Братья',original_name:'Brothers',backdrop_path:'/chosen-original.jpg'}})},film);await p.waitForTimeout(300);
  for(const v of film?['vertical']:['vertical','horizontal']){
   await view(p,v);const cover=await p.locator('.lp-cover').getAttribute('src');
   await view(p,'card');const background=await p.locator('.lp-native-background').getAttribute('src');assert.equal(cover,background);
  }
  await p.close();
 }
 console.log('PASS Continue image matches Showcase backdrop even when fetched metadata supplies another image');
 await b.close();assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);process.exit(1)});
