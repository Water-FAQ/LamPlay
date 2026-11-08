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

 for(const size of [[1920,1080,20],[1280,720,16]]){
  let anchor=null;
  for(const v of ['horizontal','vertical','card']){
   const p=await page(...size);await view(p,v);await p.waitForTimeout(1000);
   let g=await p.evaluate(()=>{
    const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}},h=document.querySelector('.lamplay');
    return {w:innerWidth,inset:parseFloat(getComputedStyle(document.querySelector('.lp-panel')).paddingLeft),hero:rect(document.querySelector('.lp-hero')),caption:[...document.querySelectorAll('.lp-caption')].map(rect),controls:[...document.querySelectorAll('.lp-strip')].map(n=>rect(n.firstElementChild)),tools:rect(document.querySelector('.lp-tools')),first:rect(document.querySelector('.lp-episode .lp-picture')),last:rect([...document.querySelectorAll('.lp-episode')].at(-1)),pane:rect(document.querySelector('.lp-body-pane')),loader:rect(document.querySelector('.lp-loader')),sideButtons:[...document.querySelectorAll('.lp-side .lamplay__control')].map(rect),tight:h.classList.contains('lp-tight')};
   });
   console.log('GEOMETRY',size[0],v,JSON.stringify(g));await p.screenshot({path:__dirname+'/renders/019-'+size[0]+'-'+v+'.png'});
   const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1.5,label+' '+JSON.stringify(g));
   assert.equal(g.tight,false);near(g.hero.x,g.inset,'hero inset');
   if(v==='horizontal')anchor=g.hero;
   if(v==='vertical'){
    near(g.hero.width,anchor.width,'shared cover width');near(g.hero.height,anchor.height,'shared cover height');
    for(const r of g.sideButtons){near(r.x,g.hero.x,'side left');near(r.width,g.hero.width,'side width')}
    for(const r of g.controls)near(r.x,g.first.x,'right column start');
   }else near(g.first.x,g.hero.x,'first episode left');
   for(let i=0;i<g.caption.length;i++)near(g.caption[i].x,g.controls[i].x,'caption start');
   if(v==='horizontal'){near(g.caption[0].y,g.hero.y,'top');assert.ok(g.tools.bottom<=g.hero.bottom+1.5)}
   if(v==='card' || v==='horizontal'){assert.ok(g.loader.y>=g.tools.bottom-1,'loader intersects filters '+JSON.stringify(g));assert.ok(g.last.bottom<=size[1]+1,'episode text outside viewport '+JSON.stringify(g));}
   if(v!=='vertical'){
    const stable=await p.evaluate(()=>{const pick=()=>[...document.querySelectorAll('.lp-caption,.lp-tools,.lp-loader,.lp-episode .lp-picture')].map(n=>{const r=n.getBoundingClientRect();return [r.y,r.height]});const before=pick(),nodes=[...document.querySelectorAll('.lp-description')],texts=nodes.map(n=>n.textContent);nodes.forEach(n=>n.textContent='');document.querySelector('.lamplay').classList.add('lp-loading');const after=pick();nodes.forEach((n,i)=>n.textContent=texts[i]);document.querySelector('.lamplay').classList.remove('lp-loading');return {before,after}});assert.deepEqual(stable.after,stable.before,'metadata/loading changes geometry');
   }
   await p.evaluate(()=>Lampa.Controller.collectionFocus(jQuery('.lp-episode').last(),jQuery('.lamplay')));await p.waitForTimeout(400);
   const end=await p.evaluate(()=>({right:document.querySelector('.lp-episode:last-child').getBoundingClientRect().right,bound:innerWidth-parseFloat(getComputedStyle(document.querySelector('.lp-panel')).paddingRight),mask:getComputedStyle(document.querySelector('.lp-body-pane')).webkitMaskImage}));near(end.right,end.bound,'last episode end');
   await p.screenshot({path:__dirname+'/renders/019-'+size[0]+'-'+v+'.png'});await p.close();
  }
 }
 assert.deepEqual(errors,[]);await b.close();console.log('PASS 019 shared covers, insets, headers, loader and terminal scroll at 720p/1080p');
})().catch(e=>{console.error(e);process.exit(1);});
