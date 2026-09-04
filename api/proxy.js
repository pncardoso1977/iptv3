import { Readable } from 'node:stream';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function makeProxyUrl(url) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

function rewriteHlsPlaylist(text, baseUrl) {
  // Rewrite URI="..." attributes (EXT-X-KEY, EXT-X-MAP, media playlists, etc.)
  text = text.replace(/URI=("|')([^"']+)("|')/gi, (_m, q1, value) => {
    try {
      const absolute = new URL(value, baseUrl).toString();
      return `URI=${q1}${makeProxyUrl(absolute)}${q1}`;
    } catch {
      return _m;
    }
  });

  // Rewrite playlist/segment URLs on non-comment lines.
  return text.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;

    try {
      return makeProxyUrl(new URL(trimmed, baseUrl).toString());
    } catch {
      return line;
    }
  }).join('\n');
}

function looksLikeHls(target, contentType, body = '') {
  return target.pathname.toLowerCase().endsWith('.m3u8') ||
    contentType.includes('application/vnd.apple.mpegurl') ||
    contentType.includes('application/x-mpegurl') ||
    contentType.includes('audio/mpegurl') ||
    contentType.includes('mpegurl') ||
    body.trimStart().startsWith('#EXTM3U');
}

export default async function handler(req, res) {
  try {
    const targetUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
    if (!targetUrl) return res.status(400).send('URL em falta');

    let target;
    try {
      target = new URL(targetUrl);
    } catch {
      return res.status(400).send('URL inválida');
    }

    if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
      return res.status(400).send('Protocolo inválido');
    }

    const headers = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Accept': req.headers.accept || '*/*'
    };

    if (req.headers.range) headers.Range = req.headers.range;
    if (req.headers.referer) headers.Referer = req.headers.referer;

    const upstream = await fetch(target, {
      headers,
      redirect: 'follow'
    });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).send(`Upstream HTTP ${upstream.status}`);
    }

    const finalUrl = upstream.url || target.toString();
    const finalTarget = new URL(finalUrl);
    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();

    // HLS playlists must be returned as text. Safari can then consume the
    // playlist from the HTTPS Vercel origin, while every referenced resource
    // is routed through this same proxy.
    if (looksLikeHls(finalTarget, contentType)) {
      const body = await upstream.text();
      if (!body.trimStart().startsWith('#EXTM3U')) {
        return res.status(502).send('O servidor devolveu conteúdo que não é uma playlist HLS válida.');
      }

      const playlist = rewriteHlsPlaylist(body, finalUrl);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
      return res.end(playlist);
    }

    // Binary media / TS / MP4 / AAC, preserving range-related headers.
    const copyHeaders = [
      ['content-type', 'Content-Type'],
      ['content-length', 'Content-Length'],
      ['content-range', 'Content-Range'],
      ['accept-ranges', 'Accept-Ranges'],
      ['etag', 'ETag'],
      ['last-modified', 'Last-Modified'],
      ['cache-control', 'Cache-Control']
    ];

    for (const [source, destination] of copyHeaders) {
      const value = upstream.headers.get(source);
      if (value) res.setHeader(destination, value);
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');

    if (upstream.body) {
      return Readable.fromWeb(upstream.body).pipe(res);
    }

    return res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error('PROXY ERROR:', error);
    return res.status(500).send('Erro ao obter o recurso');
  }
}
