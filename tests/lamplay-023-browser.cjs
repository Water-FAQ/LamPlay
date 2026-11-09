const {chromium}=require('playwright'),assert=require('assert/strict'),fs=require('fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});fs.mkdirSync(__dirname+'/renders',{recursive:true});
 try{for(const viewport of [{width:1920,height:1080},{width:1280,height:720},{width:960,height:540}])for(const view of ['horizontal','vertical','card']){
  const p=await browser.newPage({viewport}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.setContent('<div id="activity"></div>');await p.addStyleTag({path:__dirname+'/research/host.css'});
  await p.addStyleTag({content:'html,body{margin:0;width:100%;height:100%;font:16px Arial;background:#26313b;color:white}*{box-sizing:border-box}#activity{height:100vh}.lp-cover{opacity:1}'});
  await p.addScriptTag({path:require.resolve('jquery')});await p.addScriptTag({path:__dirname+'/fixtures/lampa-mock.js'});
  await p.evaluate(v=>{mock.set('view_series',v);['rezka','kodik','filmix','kinotochka','cdnvideohub'].forEach(id=>mock.set('proxy_'+id,'no'));const push=Lampa.Activity.push;Lampa.Activity.push=o=>{const s=push(o);jQuery('#activity').append(s.render());s.start();return s;};},view);
  await p.addScriptTag({path:__dirname+'/../lamplay.js'});await p.evaluate(()=>mock.open());await p.waitForFunction(()=>!document.querySelector('.lamplay').classList.contains('lp-loading'));
  for(const index of [0,1,6]){
   await p.evaluate(i=>Lampa.Controller.collectionFocus(jQuery('.lp-episode').eq(i),jQuery('.lamplay')),index);await p.waitForTimeout(700);
   const geo=await p.evaluate(()=>{const active=document.querySelector('.lp-episode.focus'),n=document.querySelector('.lamplay').dataset.view==='vertical'?active:active.querySelector('.lp-picture'),a=n.getBoundingClientRect(),filter=document.querySelector('.lp-filters').getBoundingClientRect(),next=active.nextElementSibling;return {left:a.left,right:a.right,top:a.top,bottom:a.bottom,scale:getComputedStyle(n).transform,filterBottom:filter.bottom,next:next&&(document.querySelector('.lamplay').dataset.view==='vertical'?next:next.querySelector('.lp-picture')).getBoundingClientRect().toJSON()};});
   assert.ok(geo.left>=-1&&geo.right<=viewport.width+1,JSON.stringify({viewport,view,index,geo}));assert.ok(geo.top>=geo.filterBottom-1,JSON.stringify({view,geo}));
   assert.ok(geo.scale.includes(view==='vertical'?'1.035':'1.12'),JSON.stringify(geo));
   if(geo.next)assert.ok(view==='vertical'?geo.bottom<=geo.next.top+1:geo.right<=geo.next.left+1,JSON.stringify({view,geo}));
  }
  await p.evaluate(()=>{mock.hold();mock.click('Студия 2');});assert.equal(await p.locator('.lp-skeleton').count(),0);assert.equal(await p.locator('[data-count-season]').count(),2);
  await p.screenshot({path:__dirname+'/renders/023-'+viewport.width+'-'+view+'.png'});assert.deepEqual(errors,[]);await p.close();console.log('PASS scale, screen bounds, neighbour clearance, retained filters',viewport.width,view);
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
