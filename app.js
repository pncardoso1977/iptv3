'use strict';
const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const LS={cfg:'etv_cfg_v2',fav:'etv_fav_v2',history:'etv_history_v2',cache:'etv_cache_v2'};
const state={page:'home',mode:'xtream',cfg:load(LS.cfg),favorites:load(LS.fav)||[],history:load(LS.history)||[],cache:load(LS.cache)||{},data:{live:[],movies:[],series:[],liveCats:[],movieCats:[],seriesCats:[]},q:'',cat:'all',series:null};
function load(k){try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}} function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){if(k===LS.cache){try{localStorage.removeItem(LS.cache)}catch{}}else console.warn('Storage:',e);return false}}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(window._tt);window._tt=setTimeout(()=>e.classList.remove('show'),2200)}
function loading(on){if(on&&!$('#loading'))document.body.insertAdjacentHTML('beforeend','<div id="loading" class="loading"><div class="spinner"></div></div>');if(!on)$('#loading')?.remove()}
function icon(name){return ({home:'⌂',live:'▣',movies:'▤',series:'◉',fav:'♥',settings:'⚙',search:'⌕',play:'▶',back:'‹',refresh:'↻',logout:'⇥'})[name]||'•'}
function proxyUrl(url){if(!url)return '';try{const u=new URL(url,window.location.href); if(u.origin===window.location.origin && u.pathname.startsWith('/api/')) return u.href; return '/api/proxy?url='+encodeURIComponent(u.href)}catch{return url}}
function img(url,cls=''){const src=proxyUrl(url);return src?`<img class="${cls}" loading="lazy" src="${esc(src)}" onerror="this.style.display='none'">`:''}
function api(action,extra={}){
  const c=state.cfg;

  if(!c) throw Error('Sem configuração');

  const u=new URL('/api/xtream',window.location.origin);

  u.searchParams.set('username',c.username);
  u.searchParams.set('password',c.password);
  u.searchParams.set('server',c.server);

  if(action){
    u.searchParams.set('action',action);
  }

  Object.entries(extra).forEach(([k,v])=>{
    u.searchParams.set(k,v);
  });

  return fetch(u,{cache:'no-store'}).then(async r=>{
    const txt=await r.text();

    if(!r.ok){
      throw Error('HTTP '+r.status+' '+txt);
    }

    try{
      return JSON.parse(txt);
    }catch{
      throw Error('Resposta inválida');
    }
  });
}

async function loadXtream(){const d=state.data;const jobs=[['liveCats','get_live_categories'],['movieCats','get_vod_categories'],['seriesCats','get_series_categories'],['live','get_live_streams'],['movies','get_vod_streams'],['series','get_series']];for(const [k,a] of jobs){d[k]=await api(a);render();}state.cache={saved:Date.now(),data:null}; try{localStorage.removeItem(LS.cache)}catch{}}
function normalizeM3U(text){const out=[];let meta={};for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(line.startsWith('#EXTINF:')){const attrs={};const re=/([\w-]+)="([^"]*)"/g;let m;while((m=re.exec(line)))attrs[m[1]]=m[2];meta={name:(line.split(',').slice(1).join(',')||'Sem nome').trim(),logo:attrs['tvg-logo']||'',group:attrs['group-title']||'Outros'};}else if(line&&!line.startsWith('#')&&meta.name){out.push({name:meta.name,stream_icon:meta.logo,group:meta.group,url:line});meta={}}}return out}
async function loadM3U(){const r=await fetch(state.cfg.url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const text=await r.text();const live=normalizeM3U(text);state.data={live,movies:[],series:[],liveCats:[...new Set(live.map(x=>x.group))].map((x,i)=>({category_id:i,category_name:x})),movieCats:[],seriesCats:[]};state.cache={saved:Date.now(),data:null}; try{localStorage.removeItem(LS.cache)}catch{}}
async function login(){const err=$('#loginErr');const server=$('#server')?.value.trim(),user=$('#user')?.value.trim(),pass=$('#pass')?.value;state.mode=$('.login-tabs .on')?.dataset.mode||'xtream';err.textContent='';if(state.mode==='m3u'){const url=$('#m3uurl')?.value.trim();if(!url)return err.textContent='Introduza o URL da playlist M3U.';state.cfg={url,mode:'m3u'};}else{if(!server||!user||!pass)return err.textContent='Preencha servidor, utilizador e password.';state.cfg={server,username:user,password:pass,mode:'xtream'};}loading(true);try{if(state.mode==='m3u')await loadM3U();else{await api('get_live_categories');await loadXtream()}save(LS.cfg,state.cfg);state.page='home';render();toast('Ligação efetuada');}catch(e){console.error('Login:',e);err.textContent='Não foi possível ligar. '+(e?.message||'Verifique o servidor e as credenciais.');}finally{loading(false)}}
function nav(){const items=[['home','Início'],['live','Canais'],['movies','Filmes'],['series','Séries'],['fav','Favoritos']];return `<nav class="bottom-nav">${items.map(([p,t])=>`<button class="nav-item ${state.page===p?'active':''}" onclick="go('${p}')"><span class="ico">${icon(p)}</span>${t}</button>`).join('')}</nav>`}
function topbar(){return `<header class="topbar"><img class="top-logo" src="assets/icon.png"><span class="top-title">Everywhere <b>TV</b> Club</span><span class="grow"></span><button class="round-btn" onclick="openSearch()">${icon('search')}</button><button class="round-btn" onclick="go('settings')">${icon('settings')}</button></header>`}
function shell(body){return `<div class="app"><div class="main">${topbar()}<div class="content">${body}</div>${nav()}</div></div>`}
function loginView(){return `<main class="login"><section class="login-card"><img class="login-logo" src="assets/home_banner.png"><div class="login-tabs"><button class="on" data-mode="xtream" onclick="setLoginMode('xtream')">Xtream Codes</button><button data-mode="m3u" onclick="setLoginMode('m3u')">Playlist M3U</button></div><div id="loginFields"><div class="field"><input id="server" inputmode="url" placeholder="Servidor (https://...)" value="${esc(state.cfg?.server||'')}"></div><div class="field"><input id="user" autocomplete="username" placeholder="Utilizador" value="${esc(state.cfg?.username||'')}"></div><div class="field"><input id="pass" type="password" autocomplete="current-password" placeholder="Password"></div></div><div id="loginErr" class="error"></div><button class="primary" onclick="login()">Entrar</button><p class="hint">A versão iOS necessita de HTTPS. Se o servidor não disponibilizar CORS, será necessário um proxy HTTPS.</p></section></main>`}
function setLoginMode(m){document.querySelectorAll('.login-tabs button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));$('#loginFields').innerHTML=m==='m3u'?'<div class="field"><input id="m3uurl" inputmode="url" placeholder="URL da playlist .m3u"></div>':'<div class="field"><input id="server" inputmode="url" placeholder="Servidor (https://...)"></div><div class="field"><input id="user" autocomplete="username" placeholder="Utilizador"></div><div class="field"><input id="pass" type="password" autocomplete="current-password" placeholder="Password"></div>'}
function quick(){return `<div class="quick-grid">${[['live','Canais em direto','Ver televisão'],['movies','Filmes','Catálogo de filmes'],['series','Séries','Temporadas e episódios'],['fav','Favoritos','Os seus conteúdos']].map(([p,t,s])=>`<button class="quick" onclick="go('${p}')"><span class="quick-icon">${icon(p)}</span><span><strong>${t}</strong><small>${s}</small></span></button>`).join('')}</div>`}
function posterCard(x,type){const id=x.stream_id||x.series_id||x.id;const fav=state.favorites.includes(type+':'+id);return `<article class="poster-card resume" onclick="${type==='series'?`seriesDetail('${esc(id)}')`:`playItem('${esc(id)}','${esc(x.name)}','${type}',${x.url?`'${esc(x.url)}'`:'null'})`}">${fav?`<button class="fav-btn" onclick="event.stopPropagation();toggleFav('${type}:${esc(id)}')">♥</button>`:''}<div class="poster">${img(x.stream_icon||x.cover||x.logo)}</div><div class="title">${esc(x.name)}</div>${progressFor(type,id)}</article>`}
function progressFor(type,id){const h=state.history.find(x=>x.key===type+':'+id);return h&&h.duration?`<div class="progress"><i style="width:${Math.min(100,(h.position/h.duration)*100)}%"></i></div>`:''}
function home(){const recent=state.history.slice(0,10).map(h=>findItem(h.type,h.id,h.name)).filter(Boolean);const movies=state.data.movies.slice(0,12),series=state.data.series.slice(0,12);return shell(`<section class="hero"><img src="assets/home_banner.png"><div class="hero-copy"><h1>Streaming Premium</h1><p>Live TV · Filmes · Séries</p></div></section><section class="section"><div class="section-head"><h2>Acesso rápido</h2></div>${quick()}</section>${recent.length?`<section class="section"><div class="section-head"><h2>Continuar a ver</h2><span class="sub">${recent.length} itens</span></div><div class="row">${recent.map(x=>posterCard(x,x._type)).join('')}</div></section>`:''}<section class="section"><div class="section-head"><h2>Filmes</h2><button class="sub" onclick="go('movies')">Ver todos</button></div><div class="row">${movies.length?movies.map(x=>posterCard(x,'movies')).join(''):'<div class="empty">Sem filmes disponíveis.</div>'}</div></section><section class="section"><div class="section-head"><h2>Séries</h2><button class="sub" onclick="go('series')">Ver todos</button></div><div class="row">${series.length?series.map(x=>posterCard(x,'series')).join(''):'<div class="empty">Sem séries disponíveis.</div>'}</div></section>`)}
function findItem(type,id,name){const arr=state.data[type]||[];const x=arr.find(a=>String(a.stream_id||a.series_id||a.id)===String(id));return x?{...x,_type:type}:name?{name,_type:type,stream_id:id}:null}
function catalog(type){const data=state.data[type]||[];const cats=type==='live'?state.data.liveCats:type==='movies'?state.data.movieCats:state.data.seriesCats;const q=state.q.toLowerCase();const cat=state.cat;const items=data.filter(x=>{const cid=type==='live'?x.category_id:x.category_id;const group=type==='live'&&state.mode==='m3u'?x.group:'';return (cat==='all'||String(cid)===String(cat)||String(group)===String(cat))&&(!q||String(x.name).toLowerCase().includes(q))});return shell(`<div class="content-head"><h1>${type==='live'?'Canais em direto':type==='movies'?'Filmes':'Séries'}</h1></div><div class="searchbar"><span>${icon('search')}</span><input placeholder="Pesquisar..." value="${esc(state.q)}" oninput="state.q=this.value;render()"><button onclick="state.q='';render()">×</button></div><div class="chips"><button class="chip ${cat==='all'?'active':''}" onclick="state.cat='all';render()">Todos</button>${cats.map(c=>{const id=typeof c==='string'?c:c.category_id,n=typeof c==='string'?c:c.category_name;return `<button class="chip ${String(cat)===String(id)?'active':''}" onclick="state.cat='${esc(id)}';render()">${esc(n)}</button>`}).join('')}</div><div class="catalog-grid">${items.length?items.map(x=>catalogCard(x,type)).join(''):'<div class="empty">Nenhum resultado.</div>'}</div>`)}
function catalogCard(x,type){const id=x.stream_id||x.series_id||x.id;const key=type+':'+id;return `<article class="catalog-card" onclick="${type==='series'?`seriesDetail('${esc(id)}')`:`playItem('${esc(id)}','${esc(x.name)}','${type}',${x.url?`'${esc(x.url)}'`:'null'})`}"><button class="fav-btn" onclick="event.stopPropagation();toggleFav('${esc(key)}')">${state.favorites.includes(key)?'♥':'♡'}</button><div class="poster">${img(x.stream_icon||x.cover||x.logo)}${!x.stream_icon&&!x.cover&&!x.logo?icon('play'):''}</div><div class="meta"><div class="name">${esc(x.name)}</div><div class="tag">${type==='live'?'TV em direto':type==='movies'?'Filme':'Série'}</div></div></article>`}
function favorites(){const all=[];for(const t of ['live','movies','series'])for(const x of state.data[t]||[]){const id=x.stream_id||x.series_id||x.id;if(state.favorites.includes(t+':'+id))all.push({...x,_type:t})}return shell(`<div class="content-head"><h1>Favoritos</h1></div><div class="catalog-grid">${all.length?all.map(x=>catalogCard(x,x._type)).join(''):'<div class="empty">Ainda não tem favoritos.</div>'}</div>`)}
async function seriesDetail(id){loading(true);try{const s=state.mode==='xtream'?await api('get_series_info',{series_id:id}):null;state.series=s;renderSeries(id,s)}catch(e){toast('Não foi possível carregar a série.')}finally{loading(false)}}
function renderSeries(id,s){if(!s)return;const info=s.info||{};const poster=info.cover||info.movie_image||'';let seasons=Object.entries(s.episodes||{});const body=`<div class="detail"><div class="detail-hero"><img class="detail-backdrop" src="${esc(poster)}"><div class="content-head" style="position:absolute;top:12px;left:16px;z-index:3"><button class="back" onclick="go('series')">${icon('back')}</button></div></div><div class="detail-info"><div class="detail-poster">${img(poster)}</div><div class="detail-title"><h1>${esc(info.name||'Série')}</h1><div class="muted">${esc(info.genre||'')} ${info.releaseDate?'· '+esc(info.releaseDate):''}</div></div></div><div class="action-row"><button class="action" onclick="toggleFav('series:${esc(id)}')">${state.favorites.includes('series:'+id)?'♥ Favorito':'♡ Favorito'}</button></div><p class="muted">${esc(info.plot||'Sem descrição disponível.')}</p>${seasons.map(([season,eps])=>`<section class="section"><div class="section-head"><h2>Temporada ${esc(season)}</h2></div>${(eps||[]).map(e=>`<button class="episode" onclick="playEpisode('${esc(e.id)}','${esc(e.title||('Episódio '+e.episode_num))}','${esc(e.container_extension||'mp4')}')"><div class="episode-thumb">${img(e.info?.movie_image||e.movie_image)}${!e.info?.movie_image&&!e.movie_image?icon('play'):''}</div><div><h3>${esc(e.episode_num||'')} · ${esc(e.title||'Episódio')}</h3><p>${esc(e.info?.plot||'')}</p></div></button>`).join('')}</section>`).join('')}</div>`;document.querySelector('.content').innerHTML=body}
function playItem(id,title,type,direct){
  const c=state.cfg;
  if(!c)return;
  let url=direct;
  const item=(state.data[type]||[]).find(x=>String(x.stream_id||x.id)===String(id));
  if(type==='live'){
    if(!url){
      const base=c.server.replace(/\/$/,'');
      const ext=String(item?.container_extension||'ts').toLowerCase();
      url=`${base}/live/${encodeURIComponent(c.username)}/${encodeURIComponent(c.password)}/${id}.${ext||'ts'}`;
    }
  }else if(!url){
    const base=c.server.replace(/\/$/,'');
    const ext=(item?.container_extension||'mp4').toLowerCase();
    url=`${base}/${type==='movies'?'movie':'series'}/${encodeURIComponent(c.username)}/${encodeURIComponent(c.password)}/${id}.${ext}`;
  }
  openPlayer(proxyUrl(url),title,type,id);
}
function playEpisode(id,title,ext){const c=state.cfg;if(!c)return;const url=`${c.server.replace(/\/$/,'')}/series/${encodeURIComponent(c.username)}/${encodeURIComponent(c.password)}/${id}.${ext||'mp4'}`;openPlayer(proxyUrl(url),title,'series',id)}
function openPlayer(url,title,type,id){
  const h=state.history.find(x=>x.key===type+':'+id);
  const isLive=type==='live';
  const isHls=/\.m3u8(?:$|\?)/i.test(url);
  const isTs=/\.(ts|mpeg|mpg)(?:$|\?)/i.test(url);
  document.body.insertAdjacentHTML('beforeend',`<div class="player" id="player"><div class="player-head"><div class="player-name">${esc(title)}</div><button class="player-close" onclick="closePlayer()">×</button></div><video id="video" controls autoplay playsinline preload="metadata" crossorigin="anonymous"></video><div id="playerError" class="player-error"></div></div>`);
  const v=$('#video'),err=$('#playerError');
  err.textContent=isTs?'A preparar o canal MPEG-TS…':(isHls?'A preparar o canal HLS…':'A preparar o vídeo…');
  const fail=(msg)=>{err.textContent=msg||'Não foi possível reproduzir este stream.';err.style.display='block';console.error('Erro de reprodução',{url,title,type});};
  v.onerror=()=>fail('Não foi possível reproduzir este vídeo. O servidor não devolveu um formato compatível.');

  if(isTs && isLive && window.mpegts && typeof window.mpegts.createPlayer==='function'){
    try{
      if(!window.mpegts.getFeatureList().mseLivePlayback){
        fail('Este dispositivo/browser não suporta reprodução MPEG-TS ao vivo. No iPhone é necessário iOS 17.1 ou superior.');
        return;
      }
      window.__etvMpegts?.destroy?.();
      const player=window.mpegts.createPlayer({type:'mse',isLive:true,cors:true,url},{enableWorker:true,enableWorkerForMSE:true,enableStashBuffer:false,liveBufferLatencyChasing:true});
      window.__etvMpegts=player;
      player.on(window.mpegts.Events?.ERROR||'error',(type,detail,info)=>{console.error('mpegts error',{type,detail,info});fail('Não foi possível reproduzir o canal MPEG-TS. Verifique se o stream usa H.264/H.265 + AAC compatível com o dispositivo.');});
      player.attachMediaElement(v);player.load();
      Promise.resolve(player.play()).catch(()=>{});
      return;
    }catch(e){console.error(e);fail('Falha ao iniciar o leitor MPEG-TS.');return;}
  }

  if(isHls){
    if(v.canPlayType('application/vnd.apple.mpegurl')){
      v.src=url;v.addEventListener('loadedmetadata',()=>v.play().catch(()=>{}),{once:true});
    }else if(window.Hls && window.Hls.isSupported()){
      const hls=new window.Hls({enableWorker:true});window.__etvHls=hls;hls.loadSource(url);hls.attachMedia(v);hls.on(window.Hls.Events.MANIFEST_PARSED,()=>v.play().catch(()=>{}));hls.on(window.Hls.Events.ERROR,(e,d)=>{if(d?.fatal)fail('Não foi possível reproduzir o HLS devolvido pelo servidor.');});
    }else fail('Este dispositivo não suporta HLS neste formato.');
  }else{
    v.src=url;v.addEventListener('loadedmetadata',()=>{if(h?.position&&v.duration&&h.position<v.duration-5)v.currentTime=h.position;v.play().catch(()=>{})},{once:true});
  }
  v.ontimeupdate=()=>{if(v.duration&&type!=='live'){const item={key:type+':'+id,type,id,name:title,position:v.currentTime,duration:v.duration,updated:Date.now()};state.history=[item,...state.history.filter(x=>x.key!==item.key)].slice(0,30);save(LS.history,state.history)}};
}
function closePlayer(){$('#player')?.remove();render()}
function toggleFav(k){state.favorites=state.favorites.includes(k)?state.favorites.filter(x=>x!==k):[...state.favorites,k];save(LS.fav,state.favorites);render()}
function settings(){const c=state.cfg||{};return shell(`<div class="content-head"><h1>Definições</h1></div><div class="setting"><h3>Ligação</h3><div class="value">${esc(state.mode==='m3u'?c.url:c.server||'')}</div></div><div class="setting"><h3>Utilizador</h3><div class="value">${esc(c.username||'Playlist M3U')}</div></div><div class="setting"><h3>Conteúdo em cache</h3><div class="value">${state.cache.saved?new Date(state.cache.saved).toLocaleString('pt-PT'):'—'}</div></div><button class="action" style="width:100%;margin:10px 0" onclick="refresh()">${icon('refresh')} Atualizar conteúdo</button><button class="danger" onclick="logout()">${icon('logout')} Terminar sessão</button>`)}
async function refresh(){if(!state.cfg)return;loading(true);try{if(state.mode==='m3u')await loadM3U();else await loadXtream();toast('Conteúdo atualizado')}catch{toast('Falha ao atualizar')}finally{loading(false);render()}}
function logout(){localStorage.removeItem(LS.cfg);state.cfg=null;state.data={live:[],movies:[],series:[],liveCats:[],movieCats:[],seriesCats:[]};render()}
function openSearch(){state.page='search';render()}
function searchPage(){return shell(`<div class="content-head"><h1>Pesquisar</h1></div><div class="searchbar"><span>${icon('search')}</span><input id="globalSearch" autofocus placeholder="Filmes, séries ou canais..." value="${esc(state.q)}" oninput="state.q=this.value;renderSearchResults()"></div><div id="searchResults"></div>`)}
function renderSearchResults(){const q=state.q.toLowerCase();const arr=[];for(const t of ['live','movies','series'])for(const x of state.data[t]||[])if(String(x.name).toLowerCase().includes(q))arr.push({...x,_type:t});const e=$('#searchResults');if(e)e.innerHTML=`<div class="catalog-grid">${q?(arr.length?arr.slice(0,80).map(x=>catalogCard(x,x._type)).join(''):'<div class="empty">Nenhum resultado.</div>'):'<div class="empty">Comece a escrever para pesquisar.</div>'}</div>`}
function go(p){state.page=p;state.q='';state.cat='all';if(p==='home')state.series=null;render()}
function render(){if(!state.cfg){$('#app').innerHTML=loginView();return}if(state.page==='home')$('#app').innerHTML=home();else if(['live','movies','series'].includes(state.page))$('#app').innerHTML=catalog(state.page);else if(state.page==='fav')$('#app').innerHTML=favorites();else if(state.page==='settings')$('#app').innerHTML=settings();else if(state.page==='search'){$('#app').innerHTML=searchPage();renderSearchResults()}else if(state.series)renderSeries(state.series.info?.id,state.series)}
if(state.cfg?.mode)state.mode=state.cfg.mode;
try{localStorage.removeItem(LS.cache)}catch{}
render();
if(state.cfg&&!state.cache?.data){setTimeout(()=>{loading(true);(state.mode==='m3u'?loadM3U():loadXtream()).then(render).catch(()=>toast('Não foi possível carregar o conteúdo. Verifique a ligação.')).finally(()=>loading(false))},60)}
