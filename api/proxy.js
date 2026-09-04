import { Readable } from 'node:stream';

const HOP = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','content-length']);
const ALLOWED = ['everywheretv.fun','everywheretvclub.xyz','iptv-epg.org','novaera5.club'];
function allowed(host){const h=host.toLowerCase(); return ALLOWED.some(x=>h===x||h.endsWith('.'+x));}
function abs(base, value){try{return new URL(value,base).href}catch{return value}}
function proxyLink(url, origin){return `${origin}/api/proxy?url=${encodeURIComponent(url)}`}
function rewriteM3U(text, base, origin){
  text=text.replace(/(URI=)("[^"]*"|'[^']*')/gi,(m,p,q)=>{const v=q.slice(1,-1); return p+JSON.stringify(proxyLink(abs(base,v),origin))});
  return text.split(/\r?\n/).map(line=>{
    const t=line.trim();
    if(!t||t.startsWith('#')) return line;
    const u=abs(base,t); return proxyLink(u,origin);
  }).join('\n');
}
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Range,Content-Type,Accept,Origin');
  res.setHeader('Access-Control-Expose-Headers','Content-Length,Content-Range,Accept-Ranges,Content-Type');
  if(req.method==='OPTIONS') return res.status(204).end();
  const raw=req.query?.url;
  if(!raw) return res.status(400).json({error:'URL em falta'});
  let target; try{target=new URL(raw)}catch{return res.status(400).json({error:'URL inválida'})}
  if(!['http:','https:'].includes(target.protocol)||!allowed(target.hostname)) return res.status(403).json({error:'Host não autorizado',host:target.hostname});
  const headers={'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1','Accept':'*/*'};
  if(req.headers.range) headers.Range=req.headers.range;
  if(req.headers['accept-language']) headers['Accept-Language']=req.headers['accept-language'];
  try{
    const upstream=await fetch(target,{method:req.method==='HEAD'?'HEAD':'GET',headers,redirect:'follow',signal:AbortSignal.timeout(30000)});
    const ct=(upstream.headers.get('content-type')||'').toLowerCase();
    if(!upstream.ok){return res.status(502).json({error:'Servidor IPTV respondeu com erro',status:upstream.status,url:target.href,contentType:ct});}
    if(req.method==='HEAD'){res.status(upstream.status); if(ct)res.setHeader('Content-Type',ct); return res.end();}
    const finalUrl=upstream.url||target.href;
    const isM3U=ct.includes('mpegurl')||ct.includes('vnd.apple.mpegurl')||/\.m3u8(?:$|\?)/i.test(finalUrl);
    if(isM3U){const text=await upstream.text(); if(!text.trim().startsWith('#EXTM3U')) return res.status(502).json({error:'O servidor indicou HLS mas devolveu conteúdo inválido',contentType:ct}); const body=rewriteM3U(text,finalUrl,`${req.headers['x-forwarded-proto']||'https'}://${req.headers.host}`);res.status(200);res.setHeader('Content-Type','application/vnd.apple.mpegurl');res.setHeader('Cache-Control','no-store');return res.send(body);}
    const pass=['content-type','content-range','accept-ranges','etag','last-modified','cache-control'];
    for(const h of pass){const v=upstream.headers.get(h);if(v)res.setHeader(h,v)}
    res.status(upstream.status);
    if(upstream.body) return Readable.fromWeb(upstream.body).pipe(res);
    return res.end();
  }catch(e){console.error('proxy error',e);return res.status(502).json({error:'Falha ao contactar o servidor IPTV',detail:e?.message||String(e),host:target.hostname});}
}
