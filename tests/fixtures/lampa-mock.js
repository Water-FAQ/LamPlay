(function(root){
    const $=root.jQuery;
    const values={lamplay_source:'rezka'}, components={}, listeners={},settingsListeners={},params={},calls=[],notices=[],played=[],timeline={},controllers={};
    let active=null,selection=null,input=null,film=false,loggedIn=false,confirm=true,hold=false,pending=[],many=false,ambiguous=false,aliasMovie=false,missingLogo=false,upcoming=false;
    const events=()=>{const subs={};return {follow:(n,f)=>(subs[n]||=[]).push(f),send:(n,e)=>(subs[n]||[]).forEach(f=>f(e))};};
    const playerEvents=events(),videoEvents=events(),playlistEvents=events();let playlist=[],playdata=null;
    const releases=()=>`<div class="b-content__inline_item-link"><a href="/${film?'films':'series'}/1.html">${film?(aliasMovie?'Тестовый фильм / Другое название':'Тестовый фильм'):'Братья'}</a><div>2026, США</div></div>`+(ambiguous?'<div class="b-content__inline_item-link"><a href="/series/2.html">Братья</a><div>2026, США</div></div>':'');
    const episodeList=s=>Array.from({length:many?176:7},(_,i)=>`<li class="b-simple_episode__item" data-season_id="${s||1}" data-episode_id="${i+1}">Серия ${i+1}</li>`).join('');
    const voices=()=>[1,2,3,4,5,6,7,8,9].map((i)=>`<li class="b-translator__item" data-translator_id="${i}">Студия ${i}</li>`).join('');
    const page=()=>`<script>sof.initCDN${film?'MoviesEvents(1,1,0,0,0,{});':'SeriesEvents(1,1,1,1,{});'}</script><ul id="translators-list">${voices()}</ul><input id="ctrl_favs" value="f">${episodeList(1)+episodeList(2)}`;
    const svg=(label,color)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="780" height="440"><rect width="100%" height="100%" fill="${color||'#235469'}"/><path d="M0 440L390 0 780 440" fill="#537966"/><text x="30" y="330" font-size="48" fill="white">${label}</text></svg>`);
    function Request(){this.timeout=()=>{};this.clear=()=>{};this.native=this.silent=(url,done,fail,data,extra)=>{
        calls.push({url,data,extra});if(hold){pending.push({done,fail,url});return;}
        let value;
        if(url.includes('/ajax/login/')){loggedIn=true;value={success:confirm,message:confirm?'':'Неверный логин или пароль'};}
        else if(url.endsWith('/logout/')){loggedIn=false;value='<a href="/login/">Войти</a>';}
        else if(url==='https://rezka.ag/'||url==='https://rezka.fi/'){value=loggedIn&&confirm?'<a href="/logout/">Выйти</a>':'<a href="/login/">Войти</a>';}
        else if(url.includes('do=search')||url.includes('/engine/ajax/search.php'))value=releases();
        else if(url.includes('/ajax/get_cdn_series')){
            if(String(data).includes('action=get_episodes'))value={success:true,episodes:episodeList(1)+episodeList(2)};
            else value={success:true,url:'[2160p]https://cdn.test/4k.mp4,[1080p]https://cdn.test/1080.mp4,[720p]https://cdn.test/720.mp4'};
        }
        else if(url.includes('api.tmdb.test/')){
            if(url.includes('/images?'))value={logos:missingLogo?[]:[{iso_639_1:'ru',file_path:'/logo.png'}]};
            else if(url.includes('/season/')){const s=Number(url.match(/season\/(\d+)/)[1]);value={episodes:Array.from({length:many?176:upcoming?10:7},(_,i)=>({season_number:s,episode_number:i+1,name:['В дороге','Охота','Малыш Вуди','Группа'][i]||'Эпизод '+(i+1),still_path:upcoming&&i>7?null:'/ep'+(i+1)+'.jpg',runtime:upcoming&&i>6?null:32,air_date:upcoming&&i>7?'2099-12-15':'2026-09-22',vote_average:upcoming&&i>6?0:8.2,overview:'Краткое описание событий серии. Герои отправляются в дорогу и встречают новых знакомых.'}))};}
            else value={id:99,name:film?undefined:'Братья',title:film?'Тестовый фильм':undefined,backdrop_path:'/background.jpg',poster_path:'/poster.jpg',runtime:113,release_date:'2026-09-22',tagline:'Иногда, чтобы изменить жизнь, достаточно встречи.',images:{logos:[{iso_639_1:'ru',file_path:'/logo.png'}]}};
        }
        else if(url.includes('/series/')||url.includes('/films/'))value=page();
        else if(url.includes('kodik-add.com'))value='integration.token="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"';
        else if(url.includes('/get-player?'))value={allowed:1,link:'//player.test/serial/10/hash/720p',translation:'Студия 1'};
        else if(url.includes('player.test/serial/'))value='<option data-media-id="10" data-media-hash="hash" data-media-type="serial" value="1">Студия 1</option><option data-serial-id="10" data-serial-hash="hash" value="1" selected>1</option><option data-id="111" data-hash="hash" value="1">1</option>';
        else if(url.includes('player.test/seria/'))value=`<script>var urlParams='{"d":"d","d_sign":"ds","pd":"pd","pd_sign":"ps","ref":"ref","ref_sign":"rs"}';var videoInfo={};videoInfo.type='seria';videoInfo.hash='hash';videoInfo.id='23';</script><script src="/assets/js/app.player_single.test.js"></script>`;
        else if(url.includes('/assets/js/'))value='$.ajax({type:"POST",url:atob("'+root.btoa('/get-video')+'")});';
        else if(url.endsWith('/get-video'))value={links:{720:[{src:'https://cdn.test/kodik.m3u8'}]}};
        else return setTimeout(()=>fail({status:404},'error'),1);
        setTimeout(()=>done(value),1);
    };}
    const L={Storage:{get:(k,f)=>Object.hasOwn(values,k)?values[k]:f,set:(k,v)=>values[k]=JSON.parse(JSON.stringify(v))},Platform:{is:()=>false},
        Listener:{follow:(n,f)=>(listeners[n]||=[]).push(f)},SettingsApi:{getParam:id=>Object.values(params).filter(p=>p.component===id),addComponent:c=>{root.mock.settingsComponents[c.component]=c;},addParam:p=>{params[p.param.name]=p;if(p.param.default!==undefined&&!Object.hasOwn(values,p.param.name))values[p.param.name]=p.param.default;}},
        Settings:{listener:{follow:(n,f)=>(settingsListeners[n]||=[]).push(f)},create:(name,options)=>{root.mock.settingsCalls.push({name,options});}},
        Component:{add:(id,C)=>components[id]=C},
        Activity:{active:()=>active,backward:()=>active=null,push:obj=>{let screen=new components[obj.component](obj);active={movie:obj.movie,activity:{}};screen.activity=active.activity;screen.activity.render=()=>screen.render();$('.lamplay').remove();$('body').append(screen.create());screen.start();root.mock.screen=screen;return screen;}},
        Controller:{listener:events(),add:(n,c)=>controllers[n]=c,toggle:n=>{root.mock.controller=n;controllers[n]?.toggle?.();L.Controller.listener.send('toggle',{name:n});},enabled:()=>({name:root.mock.controller||'content',controller:controllers[root.mock.controller||'content']}),collectionSet:()=>{},collectionFocus:(last,html)=>{const target=last?$(last):html.find('.selector').first();$('.selector.focus').removeClass('focus');target.addClass('focus').trigger('hover:focus');}},
        Select:{show:o=>selection=o},Input:{edit:(options,callback)=>input={options,callback}},Utils:{hash:s=>s},Reguest:Request,
        TMDB:{api:p=>'https://api.tmdb.test/'+p,key:()=> 'synthetic-key',image:p=>svg(p.includes('/logo')?'БРАТЬЯ':p.includes('/ep')?'ЭПИЗОД':'БРАТЬЯ','#25485e')},
        Timeline:{view:hash=>Object.assign({hash,time:0,duration:0,percent:0},timeline[hash],{handler:(percent,time,duration)=>timeline[hash]={percent,time,duration}})},
        Favorite:{add:()=>{}},Noty:{show:m=>notices.push(m)},
        Player:{listener:playerEvents,play:d=>{played.push(d);playdata=d;playerEvents.send('start',d);},playlist:p=>{playlist=p;playlistEvents.send('set',{playlist:p,position:0});},playdata:()=>playdata},
        PlayerVideo:{listener:videoEvents,to:p=>root.mock.seek=p},PlayerPlaylist:{listener:playlistEvents,get:()=>playlist},PlayerPanel:{listener:events(),render:()=>$('.player-panel')}
    };
    root.Lampa=L;root.Navigator={canmove:()=>false,move:()=>{}};root.appready=true;
    root.mock={values,calls,notices,played,listeners,params,controllers,settingsCalls:[],settingsComponents:{},timeline,svg,
        open:(isFilm=false)=>{film=isFilm;return L.Activity.push({component:'lamplay',movie:{id:99,source:'tmdb',media_type:film?'movie':'tv',title:film?'Тестовый фильм':undefined,name:film?undefined:'Братья',original_title:film?'Test Movie':undefined,original_name:film?undefined:'Brothers',release_date:film?'2026-09-22':undefined,first_air_date:film?undefined:'2026-09-22',backdrop_path:'/background.jpg'}});},
        click:label=>{const el=$('.lamplay .selector').filter(function(){return $(this).text().includes(label)}).first();if(!el.length)throw Error('Missing '+label);el.trigger('hover:enter');},
        select:value=>{const i=selection.items.find(i=>String(i.value)===String(value));if(!i)throw Error('Missing option '+value);selection.onSelect(i);},
        input:value=>input.callback(value),get inputOptions(){return input?.options},get selection(){return selection},get playlist(){return playlist},
        parameter:n=>params['lamplay_'+n],set:(k,v)=>values['lamplay_'+k]=v,
        settingsEvent:(name,body,params)=>{(settingsListeners.open||[]).forEach(f=>f({name,body,params}));},
        progress:(time,duration)=>{videoEvents.send('timeupdate',{current:time,duration});},
        failLogin:()=>confirm=false,many:()=>many=true,ambiguous:()=>ambiguous=true,
        upcoming:()=>upcoming=true,aliasMovie:()=>aliasMovie=true,noLogo:()=>missingLogo=true,activateFull:render=>active={activity:{render:()=>render}},hold:()=>{hold=true;return pending;},release:()=>{hold=false;},screen:null
    };
})(window);
