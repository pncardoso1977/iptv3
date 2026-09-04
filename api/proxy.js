import { Readable } from 'node:stream';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function proxyUrl(url) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

function rewritePlaylist(text, baseUrl) {
  const rewrite = value => {
    try { return proxyUrl(new URL(value, baseUrl).toString()); } catch { return value; }
  };

  text = text.replace(/URI=("|')([^"']+)(\1)/gi, (_m,q,value,q2) => `URI=${q}${rewrite(value)}${q2}`);

  return text.split(/\r?\n/).map(line => {
    const t=line.trim();
    if (!t || t.startsWith('#')) return line;
    return rewrite(t);
  }).join('\n');
}

function isHls(target, contentType, body='') {
  return /\.m3u8(?:$|[?#])/i.test(target.pathname+target.search) || /mpegurl|vnd.apple.mpegurl/i.test(contentType) || body.trimStart().startsWith('#EXTM3U');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Range,Content-Type');
    return res.status(204).end();
  }

  try {
    const raw = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
    if (!raw) return res.status(400).send('URL em falta');

    let target;
    try { target = new URL(raw); } catch { return res.status(400).send('URL inválida'); }
    if (!ALLOWED_PROTOCOLS.has(target.protocol)) return res.status(400).send('Protocolo inválido');

    const upstreamHeaders = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Accept': req.headers.accept || '*/*'
    };
    if (req.headers.range) upstreamHeaders.Range = req.headers.range;
    if (req.headers.referer) upstreamHeaders.Referer = req.headers.referer;

    const upstream = await fetch(target, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
      redirect: 'follow',
      cache: 'no-store'
    });

    const finalUrl = upstream.url || target.toString();
    const finalTarget = new URL(finalUrl);
    const ct = (upstream.headers.get('content-type') || '').toLowerCase();

    if (!upstream.ok && upstream.status !== 206) {
      const detail = await upstream.text().catch(()=>'');
      console.error('UPSTREAM', upstream.status, finalUrl, detail.slice(0,300));
      return res.status(upstream.status).send(`Upstream HTTP ${upstream.status}`);
    }

    if (isHls(finalTarget, ct)) {
      const body = await upstream.text();
      if (!body.trimStart().startsWith('#EXTM3U')) {
        return res.status(502).send('Resposta HLS inválida');
      }
      res.setHeader('Content-Type','application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Access-Control-Allow-Origin','*');
      return res.status(200).send(rewritePlaylist(body, finalUrl));
    }

    // Do not forward Content-Length blindly: an upstream proxy/CDN may have
    // transformed the body, which makes browsers report demux/open errors.
    const headerMap = {
      'content-type':'Content-Type',
      'content-range':'Content-Range',
      'accept-ranges':'Accept-Ranges',
      'etag':'ETag',
      'last-modified':'Last-Modified'
    };
    for (const [a,b] of Object.entries(headerMap)) {
      const value=upstream.headers.get(a);
      if(value) res.setHeader(b,value);
    }

    if (!ct || ct.includes('text/html') || ct.includes('text/plain')) {
      const peek = await upstream.text().catch(()=>'');
      console.error('MEDIA RESPONSE IS NOT VIDEO', {status:upstream.status, contentType:ct, url:finalUrl, body:peek.slice(0,300)});
      return res.status(502).send('O servidor IPTV não devolveu um ficheiro de vídeo válido.');
    }

    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','Range,Content-Type');
    res.setHeader('Access-Control-Expose-Headers','Content-Range,Accept-Ranges,Content-Type,ETag,Last-Modified');

    if (req.method === 'HEAD') return res.status(upstream.status).end();
    if (upstream.body) return Readable.fromWeb(upstream.body).pipe(res);
    return res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error('PROXY ERROR:', error);
    return res.status(502).send(`Erro ao obter o recurso: ${error?.message || 'rede'}`);
  }
}
