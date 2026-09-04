import { Readable } from 'node:stream';

const ALLOWED = ['everywheretv.fun','everywheretvclub.xyz','iptv-epg.org','novaera5.club'];
const PASS_HEADERS = ['content-type','content-range','accept-ranges','etag','last-modified','cache-control','expires'];
function allowed(host){ const h=host.toLowerCase(); return ALLOWED.some(x=>h===x||h.endsWith('.'+x)); }
function abs(base,v){ try{return new URL(v,base).href}catch{return v;} }
function link(url,origin){ return origin+'/api/proxy?url='+encodeURIComponent(url); }
function rewrite(text,base,origin){
  text=text.replace(/(URI=)("[^"]*"|'[^']*')/gi,(m,p,q)=>p+JSON.stringify(link(abs(base,q.slice(1,-1)),origin)));
  return text.split(/\r?\n/).map(line=>{const t=line.trim(); if(!t||t.startsWith('#')) return line; return link(abs(base,t),origin);}).join('\n');
}
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Range,Content-Type,Accept,Origin');
  res.setHeader('Access-Control-Expose-Headers','Content-Length,Content-Range,Accept-Ranges,Content-Type');
  if(req.method==='OPTIONS') return res.status(204).end();
  const raw=req.query?.url;
  if(!raw) return res.status(400).json({error:'URL em falta'});
  let target; try{target=new URL(raw)}catch{return res.status(400).json({error:'URL inválida'});}
  if(!['http:','https:'].includes(target.protocol)||!allowed(target.hostname)) return res.status(403).json({error:'Host não autorizado',host:target.hostname});
  const headers={
    'User-Agent':'VLC/3.0.20 LibVLC/3.0.20',
    'Accept':'*/*',
    'Connection':'keep-alive'
  };
  if(req.headers.range) headers.Range=req.headers.range;
  if(req.headers['accept-language']) headers['Accept-Language']=req.headers['accept-language'];
  try{
    const upstream=await fetch(target,{method:req.method==='HEAD'?'HEAD':'GET',headers,redirect:'follow',signal:AbortSignal.timeout(30000)});
    const ct=(upstream.headers.get('content-type')||'').toLowerCase();
    if(!upstream.ok) return res.status(502).json({error:'Servidor IPTV respondeu com erro',status:upstream.status,contentType:ct});
    if(req.method==='HEAD'){res.status(upstream.status); for(const h of PASS_HEADERS){const v=upstream.headers.get(h);if(v)res.setHeader(h,v);} return res.end();}
    const finalUrl=upstream.url||target.href;
    const looksM3U=ct.includes('mpegurl')||ct.includes('vnd.apple.mpegurl')||/\.m3u8(?:$|\?)/i.test(finalUrl);
    if(looksM3U){
      const text=await upstream.text();
      if(!text.trim().startsWith('#EXTM3U')) return res.status(502).json({error:'O servidor indicou HLS mas devolveu conteúdo inválido',contentType:ct,preview:text.slice(0,100)});
      const origin=(req.headers['x-forwarded-proto']||'https')+'://'+req.headers.host;
      res.status(200); res.setHeader('Content-Type','application/vnd.apple.mpegurl'); res.setHeader('Cache-Control','no-store'); return res.send(rewrite(text,finalUrl,origin));
    }
    for(const h of PASS_HEADERS){const v=upstream.headers.get(h);if(v)res.setHeader(h,v);}
    res.status(upstream.status);
    if(upstream.body) return Readable.fromWeb(upstream.body).pipe(res);
    return res.end();
  }catch(e){
    console.error('proxy error',e);
    return res.status(502).json({error:'Não foi possível obter o vídeo/recurso do servidor IPTV',detail:e?.message||String(e),host:target.hostname,url:target.href});
  }
}
