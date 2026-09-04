import { Readable } from 'node:stream';

const PASS_HEADERS = ['content-type','content-length','content-range','accept-ranges','etag','last-modified','cache-control','expires'];

// A app aceita login com QUALQUER servidor Xtream/M3U (introduzido pelo utilizador),
// por isso o proxy de stream não pode estar limitado a uma lista fixa de domínios —
// isso bloqueava a reprodução de canais/filmes/séries de qualquer servidor que não
// estivesse nessa lista. Em vez disso, bloqueamos apenas alvos de risco (rede interna/
// localhost) para evitar que o proxy seja usado como SSRF. Se quiseres mesmo restringir
// a lista de servidores permitidos, define a variável de ambiente IPTV_ALLOWED_HOSTS
// (lista separada por vírgulas) no Vercel.
function isPrivateOrLocalHost(hostname){
  const h=String(hostname||'').toLowerCase();
  if(!h) return true;
  if(h==='localhost'||h==='0.0.0.0'||h==='::1'||h==='[::1]') return true;
  if(h.endsWith('.local')) return true;
  // IPv4 literal checks
  const m=h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if(m){
    const [a,b]=m.slice(1,3).map(Number);
    if(a===127) return true;               // loopback
    if(a===10) return true;                 // 10.0.0.0/8
    if(a===169&&b===254) return true;       // link-local
    if(a===172&&b>=16&&b<=31) return true;  // 172.16.0.0/12
    if(a===192&&b===168) return true;       // 192.168.0.0/16
    if(a===0) return true;
  }
  // IPv6 unique-local / link-local
  if(/^f[cd][0-9a-f]{2}:/i.test(h)) return true;
  if(/^fe[89ab][0-9a-f]:/i.test(h)) return true;
  return false;
}
function allowed(host){
  const h=String(host||'').toLowerCase();
  const configured=(process.env.IPTV_ALLOWED_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  // Se o operador do site definir explicitamente IPTV_ALLOWED_HOSTS, só esses domínios passam.
  if(configured.length) return configured.some(x=>h===x||h.endsWith('.'+x));
  // Caso contrário, qualquer host público é permitido (login dinâmico do utilizador).
  return !isPrivateOrLocalHost(h);
}
function link(url,origin){ return origin+'/api/proxy?url='+encodeURIComponent(url); }
function rewrite(text,base,origin){
  const attribute=line=>line.replace(/\bURI=("[^"]*"|'[^']*'|[^,\s]*)/gi,(_m,value)=>{
    const q=/^["']/.test(value)?value[0]:'';
    const raw=q?value.slice(1,-1):value;
    return 'URI='+q+link(new URL(raw,base).href,origin)+q;
  });
  return text.split(/\r?\n/).map(line=>{
    const t=line.trim();
    if(!t)return line;
    if(t.startsWith('#'))return attribute(line);
    return link(new URL(t,base).href,origin);
  }).join('\n');
}
function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Range,Content-Type,Accept,Origin,If-None-Match,If-Modified-Since');
  res.setHeader('Access-Control-Expose-Headers','Content-Length,Content-Range,Accept-Ranges,Content-Type,ETag,Last-Modified');
}

export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  if(!['GET','HEAD'].includes(req.method)) return res.status(405).json({error:'Método não suportado'});

  const raw=req.query?.url;
  if(!raw) return res.status(400).json({error:'URL em falta'});
  let target;
  try{ target=new URL(raw); }catch{ return res.status(400).json({error:'URL inválida'}); }
  if(!['http:','https:'].includes(target.protocol)||!allowed(target.hostname)){
    return res.status(403).json({error:'Host não autorizado',host:target.hostname});
  }

  const headers={
    'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 EverywhereTV/2.0',
    'Accept':'*/*',
    'Connection':'keep-alive'
  };
  for(const [incoming,outgoing] of [['range','Range'],['if-none-match','If-None-Match'],['if-modified-since','If-Modified-Since'],['accept-language','Accept-Language']]){
    if(req.headers?.[incoming]) headers[outgoing]=req.headers[incoming];
  }

  try{
    const upstream=await fetch(target,{method:req.method,headers,redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(30000)});
    const ct=(upstream.headers.get('content-type')||'').toLowerCase();
    const finalUrl=upstream.url||target.href;

    if(!upstream.ok){
      console.error('proxy upstream',upstream.status,finalUrl,ct);
      return res.status(upstream.status).json({error:'Servidor de origem respondeu HTTP '+upstream.status,status:upstream.status,contentType:ct,url:finalUrl});
    }

    if(req.method==='HEAD'){
      res.status(upstream.status);
      for(const h of PASS_HEADERS){const v=upstream.headers.get(h);if(v)res.setHeader(h,v);}
      return res.end();
    }

    const looksM3U=/\.(m3u8?|m3u)(?:$|[?#])/i.test(finalUrl)||ct.includes('mpegurl')||ct.includes('x-mpegurl');
    if(looksM3U){
      const text=await upstream.text();
      const trimmed=text.trimStart();
      const isPlaylist=trimmed.startsWith('#EXTM3U') || /#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE|ENDLIST)/i.test(text);
      if(!isPlaylist){
        return res.status(502).json({error:'A origem indicou uma playlist mas devolveu conteúdo inválido',contentType:ct});
      }
      const origin=(req.headers['x-forwarded-proto']||'https')+'://'+req.headers.host;
      res.status(200);
      res.setHeader('Content-Type','application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
      return res.send(rewrite(text,finalUrl,origin));
    }

    for(const h of PASS_HEADERS){const v=upstream.headers.get(h);if(v)res.setHeader(h,v);}
    // Some IPTV servers omit a useful media type. Infer it from the URL so Safari/HTMLVideoElement
    // receives a meaningful Content-Type while preserving the upstream type when one exists.
    if(!ct){
      if(/\.mp4(?:$|[?#])/i.test(finalUrl)) res.setHeader('Content-Type','video/mp4');
      else if(/\.(ts|mpeg|mpg)(?:$|[?#])/i.test(finalUrl)) res.setHeader('Content-Type','video/mp2t');
    }
    res.setHeader('Cache-Control','no-store');
    res.status(upstream.status);
    if(upstream.body) return Readable.fromWeb(upstream.body).pipe(res);
    return res.end();
  }catch(e){
    console.error('proxy error',e);
    return res.status(502).json({error:'Não foi possível contactar o servidor IPTV',detail:e?.name==='TimeoutError'?'A ligação ao servidor expirou':e?.message||String(e)});
  }
}
