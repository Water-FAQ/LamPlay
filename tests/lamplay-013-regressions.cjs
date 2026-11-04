const {chromium}=require('../node_modules/playwright'),assert=require('assert/strict'),fs=require('fs');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}),errors=[];
 async function page(width=1920,height=1080,font=20){
  const p=await b.newPage({viewport:{width,height}});p.on('pageerror',e=>errors.push(e.message));await p.setContent('<div class="wrap"><div class="wrap__content"><div class="activitys"><div class="activitys__slides"><div class="activity activity--active"><div class="activity__body" id="activity"></div></div></div></div></div></div><header class="head"></header>');await p.addStyleTag({path:__dirname+'/research/host.css'});
  await p.addStyleTag({content:`html,body{font:${font}px Arial;margin:0;height:100vh;width:100vw;background:#25313b;color:white}*{box-sizing:border-box}.wrap,.wrap__content,.activitys{width:100%}.activitys__slides,.activity__body{height:100vh}.activity{opacity:1}.head{height:4em}.lp-cover{opacity:1}`});
  for(let f of ['../node_modules/jquery/dist/jquery.min.js','fixtures/lampa-mock.js'])await p.addScriptTag({path:__dirname+'/'+f});
  await p.evaluate(()=>{const push=Lampa.Activity.push;Lampa.Activity.push=function(o){const screen=push(o);jQuery('#activity').append(screen.render());screen.start();return screen};});await p.addScriptTag({path:__dirname+'/../lamplay.js'});await p.evaluate(()=>mock.open());await p.waitForTimeout(300);return p;
 }
 for(const [w,h,font] of [[1920,1080,20],[1920,1080,24],[1280,720,16],[1280,720,20],[960,540,14]]){
  const p=await page(w,h,font);
  for(let v of ['horizontal','card']){
   await p.evaluate(v=>{while(document.querySelector('.lamplay').dataset.view!==v)mock.click('Вид:')},v);await p.waitForTimeout(220);
   const g=await p.evaluate(()=>{let pane=document.querySelector('.lp-body-pane'),r=pane.getBoundingClientRect(),row=document.querySelector('.lp-episode'),t=row.querySelector('.lamplay__item-title'),d=row.querySelector('.lp-description'),dr=d.getBoundingClientRect(),s=getComputedStyle(d);return{left:r.left,right:r.right,bottom:r.bottom,height:innerHeight,width:innerWidth,descBottom:dr.bottom,lines:dr.height/parseFloat(s.lineHeight),gap:dr.top-t.getBoundingClientRect().bottom,font:parseFloat(s.fontSize),cardWidth:row.getBoundingClientRect().width,htmlBottom:document.querySelector('.lamplay').getBoundingClientRect().bottom}});
   assert.ok(Math.abs(g.left)<1&&Math.abs(g.right-w)<1&&Math.abs(g.bottom-h)<1,JSON.stringify({v,w,h,font,g}));assert.ok(Math.abs(g.cardWidth/w-.22)<.015);assert.ok(Math.abs(g.lines-3)<.06&&g.descBottom<h-4,JSON.stringify({v,w,h,font,g}));assert.ok(g.gap<g.font*.4,JSON.stringify({v,w,h,font,g}));
   await p.evaluate(()=>Lampa.Controller.collectionFocus(jQuery('.lp-episode').eq(3),jQuery('.lamplay')));await p.waitForTimeout(250);assert.equal(await p.locator('.lp-body-pane').getAttribute('data-lp-fade-before'),'true');assert.equal(await p.locator('.lp-body-pane').getAttribute('data-lp-fade-after'),'true');
   let clip=await p.locator('.lp-episode.focus .lp-picture').evaluate(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n),edge=r.top-parseFloat(s.outlineWidth)-parseFloat(s.outlineOffset),o=[];for(let a=n.parentElement;a;a=a.parentElement){let ar=a.getBoundingClientRect(),cs=getComputedStyle(a);if(/hidden|auto|clip|scroll/.test(cs.overflowY)&&edge<ar.top-1)o.push([a.className,edge,ar.top]);}return o;});assert.deepEqual(clip,[],JSON.stringify({v,w,h,font,clip}));
   // Every horizontal filter row extends to the real viewport edge; fading is conditional.
   const rows=await p.locator('.lp-strip,.lp-tools').evaluateAll(ns=>ns.map(n=>({right:n.getBoundingClientRect().right,mask:getComputedStyle(n).webkitMaskImage,range:n.scrollWidth-n.clientWidth})));
   assert.ok(rows.every(r=>Math.abs(r.right-w)<1));assert.ok(rows.every(r=>r.mask.includes('linear-gradient')));
   await p.evaluate(()=>{let n=document.querySelectorAll('.lp-strip')[1];n.scrollLeft=0});await p.waitForTimeout(150);assert.equal(await p.locator('.lp-strip').nth(1).getAttribute('data-lp-fade-before'),'false');
   await p.evaluate(()=>{let n=document.querySelectorAll('.lp-strip')[1];n.scrollLeft=n.scrollWidth});await p.waitForTimeout(150);assert.equal(await p.locator('.lp-strip').nth(1).getAttribute('data-lp-fade-after'),'false',JSON.stringify({v,w,h,font,scroll:await p.locator('.lp-strip').nth(1).evaluate(n=>({pos:n.scrollLeft,size:n.clientWidth,total:n.scrollWidth}))}));
   await p.evaluate(()=>{mock.timeline['11Brothers']={time:20,duration:100,percent:20};mock.screen.playerClosed()});await p.waitForTimeout(50);assert.equal(await p.locator('.lp-started .lp-picture').first().evaluate(n=>getComputedStyle(n).outlineOffset),'0px');
   if(w===1920&&font===20)await p.screenshot({path:__dirname+'/renders/013-'+v+'.png'});
  }
  await p.evaluate(()=>{while(document.querySelector('.lamplay').dataset.view!=='vertical')mock.click('Вид:');Lampa.Controller.collectionFocus(jQuery('.lp-episode').eq(3),jQuery('.lamplay'))});await p.waitForTimeout(250);
  let r=await p.locator('.lp-episode').nth(3).evaluate(n=>{let a=n.getBoundingClientRect(),i=n.querySelector('.lp-picture').getBoundingClientRect(),p=document.querySelector('.lp-body-pane').getBoundingClientRect();return{left:i.left-a.left,top:i.top-a.top,bottom:a.bottom-i.bottom,paneBottom:p.bottom};});assert.ok(Math.abs(r.left)<1&&Math.abs(r.top)<1&&Math.abs(r.bottom)<1&&Math.abs(r.paneBottom-h)<1,JSON.stringify(r));assert.equal(await p.locator('.lp-body-pane').getAttribute('data-lp-fade-before'),'true');assert.equal(await p.locator('.lp-body-pane').getAttribute('data-lp-fade-after'),'true');if(w===1920&&font===20)await p.screenshot({path:__dirname+'/renders/013-vertical.png'});await p.close();
 }
 console.log('PASS actual Lampa header/activity geometry: three full lines, small title gap, preserved card size and full focus outline at five TV/font configurations');
 console.log('PASS series strips reach both viewport edges; list reaches bottom; masks follow real scroll state; List thumbnail has no inset; started outline has no gap');
 const p=await page();
 // Native controller definitions, including the original first-selector focus on entering rewind.
 await p.evaluate(()=>{
  const originalToggle=Lampa.Controller.toggle;Lampa.Controller.toggle=function(n){const old=mock.controllers[mock.controller];if(old&&old.gone)old.gone(n);originalToggle(n)};
  jQuery('body').append('<div class="player player--panel-visible"><div class="player-panel panel--visible"><div class="player-panel__body"><div class="player-panel__apex"><div class="player-panel__apex-left-side"><div class="player-next"><div class="player-next__episode"><div class="player-next__thumbnail loaded"><img class="player-next__thumbnail-img"></div><div class="player-next__body"><div class="player-next__title">Следующая серия</div><div class="player-next__episode-title">Название</div></div></div></div></div></div><div class="player-panel__timeline selector"></div><div class="player-panel__playpause selector">Play</div></div></div></div>');
  jQuery('.player-next__thumbnail-img').attr('src',mock.svg('Next'));
  window.Controller=Lampa.Controller;window.Player=Lampa.Player;window.PlayerIPTV={playning:()=>false};window.PlayerFooter={available:()=>false};window.listener$j={send:()=>{}};window.Html={render:()=>jQuery('.player-panel')};window.render$c=()=>Html.render();window.toggleUp=()=>Lampa.Controller.toggle('player');window.toggleRewind=()=>Lampa.Controller.toggle('player_rewind');window.toggleButtons=()=>Lampa.Controller.toggle('player_panel');window.toPlayer=()=>Lampa.Controller.toggle('player');
  Lampa.PlayerPanel.hide=()=>{jQuery('.player-panel').removeClass('panel--visible');mock.hidden=true};Lampa.PlayerPanel.toggle=()=>{mock.hidden=false;jQuery('.player-panel').addClass('panel--visible');Lampa.Controller.toggle('player_panel')};
  Lampa.Controller.add('player',{toggle:()=>Lampa.PlayerPanel.hide(),up:()=>Lampa.PlayerPanel.toggle(),down:()=>Lampa.PlayerPanel.toggle()});
  Lampa.PlayerPlaylist.next=()=>{mock.nextCount=(mock.nextCount||0)+1;Lampa.Player.play(mock.playlist[1])};jQuery('.lp-episode').first().trigger('hover:enter');
 });await p.addScriptTag({path:__dirname+'/research/player-controllers.js'});await p.evaluate(()=>installNativePlayerControllers());await p.waitForTimeout(150);
 const move=async dir=>p.evaluate(dir=>{const c=Lampa.Controller.enabled().controller;c[dir]()},dir);
 for(let reveal of ['up','down']){
  await p.evaluate(()=>Lampa.Controller.toggle('player'));await move(reveal);assert.equal(await p.locator('.player-panel__playpause.focus').count(),1);
  await move('up');assert.equal(await p.locator('.player-panel__timeline.focus').count(),1);assert.equal(await p.locator('.player-next.focus').count(),0);
  await move('up');assert.equal(await p.locator('.player-next.focus').count(),1);
  await move('down');assert.equal(await p.locator('.player-panel__timeline.focus').count(),1);
  await move('down');assert.equal(await p.locator('.player-panel__playpause.focus').count(),1);
  await move('up');await move('up');await move('up');assert.equal(await p.evaluate(()=>mock.hidden),true);assert.equal(await p.locator('.player-next.focus').count(),0);
 }
 await move('down');await move('up');await move('up');
 let style=await p.locator('.player-next').evaluate(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect(),pic=n.querySelector('.player-next__thumbnail').getBoundingClientRect(),txt=n.querySelector('.player-next__body'),ts=getComputedStyle(txt);return {radius:parseFloat(s.borderRadius),outline:s.outlineWidth,shadow:s.boxShadow,bg:s.backgroundColor,left:pic.left-r.left,top:pic.top-r.top,rightPadding:ts.paddingRight,leftPadding:ts.paddingLeft};});assert.ok(style.radius>0&&style.outline==='0px'&&style.shadow!=='none'&&style.bg!=='rgba(0, 0, 0, 0)'&&style.left===0&&style.top===0,JSON.stringify(style));assert.equal(style.rightPadding,style.leftPadding);await p.screenshot({path:__dirname+'/renders/013-next.png'});
 await move('down');assert.equal(await p.locator('.player-next').evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');await p.locator('.player-next').click();assert.equal(await p.evaluate(()=>mock.nextCount),1);
 console.log('PASS native player controllers: hidden → Play/Pause → timeline → next → hidden, both reverse steps, repeated reveal, rounded flush focus and click');
 await b.close();assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);process.exit(1)});
