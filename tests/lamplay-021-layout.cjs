const {chromium}=require('../node_modules/playwright'),assert=require('assert/strict'),fs=require('fs');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']}),errors=[];
 async function page(width=1920,height=1080,font=20,film=false,metadata=null,code=null,results=false){
  const p=await b.newPage({viewport:{width,height}});p.on('pageerror',e=>errors.push(e.message));await p.setContent('<div class="wrap"><div class="wrap__content"><div class="activitys"><div class="activitys__slides"><div class="activity activity--active"><div class="activity__body" id="activity"></div></div></div></div></div></div><header class="head"><div class="head__title">LamPlay</div></header>');await p.addStyleTag({path:__dirname+'/research/host.css'});
  await p.addStyleTag({content:`html,body{font:${font}px Arial;margin:0;height:100vh;width:100vw;background:#25313b;color:white}*{box-sizing:border-box}.wrap,.wrap__content,.activitys{width:100%}.activitys__slides,.activity__body{height:100vh}.activity{opacity:1}.head{height:4em}.lp-cover{opacity:1}`});
  for(let f of ['../node_modules/jquery/dist/jquery.min.js','fixtures/lampa-mock.js'])await p.addScriptTag({path:__dirname+'/'+f});
  await p.evaluate(()=>{jQuery('body').prepend('<div class="background" style="background:linear-gradient(120deg,rgb(105,35,55),rgb(40,110,140));z-index:0"></div>');jQuery('body').append(jQuery('<img class="full-start__background loaded">').attr('src',mock.svg('Native')));window.hostMask=getComputedStyle(document.querySelector('.full-start__background')).webkitMaskImage;mock.backgroundCalls=[];Lampa.Utils.cardImgBackground=c=>{mock.backgroundCard=c;return mock.svg('Colors')};Lampa.Background={change:src=>mock.backgroundCalls.push(src)};});
  await p.evaluate(meta=>{if(!meta)return;const Original=Lampa.Reguest;Lampa.Reguest=function(){let r=new Original(),request=r.native;r.native=r.silent=(url,done,...rest)=>request.call(r,url,value=>{if(url.includes('/ajax/get_cdn_series')&&value.url)Object.assign(value,meta);done(value)},...rest);return r;};},metadata);
  await p.evaluate(()=>{const push=Lampa.Activity.push;Lampa.Activity.push=function(o){const screen=push(o);jQuery('#activity').append(screen.render());screen.start();return screen};});await p.evaluate(r=>window.testResults=r,results);await p.addScriptTag(code?{content:code}:{path:__dirname+'/../lamplay.js'});await p.evaluate(f=>{const Original=Lampa.Reguest;Lampa.Reguest=function(){let r=new Original(),request=r.native;r.native=r.silent=(u,done,...a)=>request.call(r,u,d=>{if(u.includes('/season/')&&d.episodes){d.episodes[0].runtime=80;d.episodes[1].runtime=60;d.episodes[2].runtime=45;}done(d)},...a);return r;};if(window.testResults){mock.ambiguous();mock.set('view_series',window.testResults);mock.set('view_movie',window.testResults);const Req=Lampa.Reguest;Lampa.Reguest=function(){const r=new Req(),native=r.native;r.native=r.silent=(url,done,...args)=>native.call(r,url,data=>{if(url.includes('do=search')||url.includes('/engine/ajax/search.php'))data=Array.from({length:24},(_,i)=>String(data).replaceAll('/1.html','/'+(100+i)+'.html').replaceAll('/2.html','/'+(200+i)+'.html')).join('');done(data)},...args);return r;};}mock.open(f)},film);await p.waitForTimeout(300);return p;
 }


 async function view(p,v){await p.evaluate(v=>{while(document.querySelector('.lamplay').dataset.view!==v)mock.click('Вид:')},v);await p.waitForTimeout(350)}




 const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1.6,label+' '+a+' / '+b);
 async function geometry(p){return p.evaluate(()=>{
 const r=n=>{let b=n.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}},find=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)].map(r);
 return {hero:r(find('.lp-hero')),panel:r(find('.lp-panel')),pane:r(find('.lp-body-pane')),side:find('.lp-side')?r(find('.lp-side')):null,items:find('.lp-episode')?all('.lp-episode'):[],pictures:all('.lp-episode .lp-picture'),tools:r(find('.lp-tools')),buttons:all('.lp-side .lamplay__control'),captions:all('.lp-caption'),filters:all('.lp-strip'),filterGap:parseFloat(getComputedStyle(find('.lp-filters')).rowGap),inset:parseFloat(getComputedStyle(find('.lp-panel')).paddingLeft),font:parseFloat(getComputedStyle(find('.lamplay')).fontSize)};});}
 for(const size of [[1920,1080,20],[1280,720,16]]){
  let ref;
  for(const v of ['vertical','horizontal','card']){
   const p=await page(...size);await view(p,v);await p.waitForTimeout(300);
   await p.evaluate(()=>{document.querySelectorAll('.focus').forEach(n=>n.classList.remove('focus'));document.querySelector('.lp-body-pane').scrollLeft=0});await p.waitForTimeout(300);
   const g=await geometry(p);if(v==='vertical')ref=g;
   near(g.hero.x,g.inset,v+' hero left');
   g.captions.forEach((r,i)=>{near(r.x,g.filters[i].x,v+' caption/filter left');near(g.filters[i].right,size[0]-g.inset,v+' filter right')});
   if(v==='vertical')g.buttons.forEach(r=>{near(r.x,g.hero.x,'list button left');near(r.w,g.hero.w,'list button width')});
   else{
    near(g.items[0].x,g.inset,v+' first episode left');near(g.pictures[0].x,g.inset,v+' first image left');near(g.pane.x,0,v+' mask left');near(g.pane.right,size[0],v+' mask right');
    assert.ok(g.pictures[0].y-g.tools.bottom>=g.filterGap,v+' gap must cover filter gap');
    assert.ok(g.items[0].bottom<=size[1]-g.font*.55,v+' bottom breathing room '+JSON.stringify(g.items[0]));
    await p.evaluate(()=>Lampa.Controller.collectionFocus(jQuery('.lp-episode').first(),jQuery('.lamplay')));await p.waitForTimeout(350);let first=await geometry(p);near(first.pictures[0].x,g.inset,v+' focused first picture');
    await p.evaluate(()=>Lampa.Controller.collectionFocus(jQuery('.lp-episode').last(),jQuery('.lamplay')));await p.waitForTimeout(450);let last=await geometry(p);near(last.pictures.at(-1).right,size[0]-g.inset,v+' focused last picture');near(last.items.at(-1).right,size[0]-g.inset,v+' last episode right');
    const fade=await p.evaluate(()=>{let n=document.querySelector('.lp-body-pane');return {before:n.dataset.lpFadeBefore,after:n.dataset.lpFadeAfter,mask:getComputedStyle(n).webkitMaskImage}});assert.equal(fade.before,'true');assert.equal(fade.after,'false');assert.match(fade.mask,/(?:transparent|rgba\(0, 0, 0, 0\)) 0px/);
   }
   await p.screenshot({path:__dirname+'/renders/021-'+size[0]+'-series-'+v+'.png'});await p.close();
  }
  for(const v of ['vertical','card']){
   const p=await page(...size,true);await view(p,v);const g=await geometry(p);
   near(g.hero.x,ref.hero.x,'movie '+v+' left');near(g.side.w,ref.side.w,'movie '+v+' column');near(g.pane.right,size[0]-ref.inset,'movie '+v+' right');
   if(v==='vertical'){near(g.hero.w,ref.hero.w,'movie cover width');near(g.hero.h,ref.hero.h,'movie cover height')}
   else assert.ok(g.hero.h<ref.hero.h,'showcase has logo instead of an empty cover');
   g.buttons.forEach(r=>{near(r.x,ref.hero.x,'movie button left');near(r.w,ref.hero.w,'movie button width');near(r.h,ref.buttons[0].h,'movie button height')});
   for(let i=1;i<g.buttons.length;i++)near(g.buttons[i].y-g.buttons[i-1].bottom,ref.buttons[1].y-ref.buttons[0].bottom,'movie button gap');
   await p.screenshot({path:__dirname+'/renders/021-'+size[0]+'-movie-'+v+'.png'});await p.close();
  }
  for(const film of [false,true]){
   const p=await page(...size,film,null,null,'vertical');const g=await geometry(p);
   near(g.hero.x,ref.hero.x,'results left');near(g.hero.w,ref.hero.w,'results width');near(g.hero.h,ref.hero.h,'results height');near(g.pane.right,size[0]-ref.inset,'results right');
   await p.screenshot({path:__dirname+'/renders/021-'+size[0]+'-results-'+film+'.png'});await p.close();
  }
  console.log('PASS '+size[0]+' shared guides, terminal cards, screen fades, movie columns/covers/buttons and results');
 }
 assert.deepEqual(errors,[]);await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
