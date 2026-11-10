const assert=require('assert/strict'),C=require('../lamplay.js');
const calls=[];let direct=0,failDirect=false;
global.XMLHttpRequest=class{open(method,url){this.method=method;this.url=url;}setRequestHeader(){}abort(){this.aborted=true;}send(body){calls.push({method:this.method,url:this.url,body});this.status=200;this.responseText=JSON.stringify({items:[],isSerial:true});this.onload();}};
const L={Reguest:function(){this.timeout=this.clear=()=>{};this.native=this.silent=(u,ok,fail)=>{direct++;failDirect?fail({status:403},'error'):ok({items:[],isSerial:true});};}};
const request=(mode,url='https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?pub=12&aggr=kp&id=123')=>new Promise((ok,no)=>new C.Transport(L,(k,f)=>k.startsWith('proxy_')?mode:f).request(url,null,'json',ok,no));
(async()=>{
 await request('no');assert.equal(direct,1);assert.equal(calls.length,0);
 await request('auto');assert.equal(direct,2);assert.equal(calls.length,0,'empty success does not use proxy');
 failDirect=true;await request('auto');assert.equal(direct,3);assert.equal(calls.length,1);assert.ok(calls[0].url.includes('/v1/cdnvideohub/playlist?'));
 await request('yes');assert.equal(direct,3);assert.equal(calls.length,2);
 await request('yes','https://kodik-api.com/search?title=Example&token=private-test-token');assert.equal(calls.at(-1).method,'POST');assert.ok(!calls.at(-1).url.includes('private-test-token'));assert.equal(JSON.parse(calls.at(-1).body).token,'private-test-token');
 for(const host of ['filmixapp.cyou','filmixapp.vip','fxapp.biz']){await request('yes','http://'+host+'/api/v2/search?story=Example&user_dev_id=0000000000000000&user_dev_token=private-test-token');assert.ok(calls.at(-1).url.endsWith('/v1/filmix/mobile/search'));assert.equal(calls.at(-1).method,'POST');assert.ok(!calls.at(-1).url.includes('private-test-token'));}
 console.log('PASS direct/forced/automatic metadata routing, empty success and private POST token');
})().catch(e=>{console.error(e);process.exitCode=1;});
