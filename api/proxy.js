import { Readable } from 'node:stream';

function proxyUrl(value, baseUrl) {
  try {
    const absolute = new URL(value, baseUrl).toString();
    return `/api/proxy?url=${encodeURIComponent(absolute)}`;
  } catch {
    return value;
  }
}

function rewriteHls(text, baseUrl) {
  // Rewrite URI="..." attributes used by keys, maps, media, images, etc.
  text = text.replace(/URI=("|')([^"']+)("|')/gi, (_, q1, value, q2) => {
    return `URI=${q1}${proxyUrl(value, baseUrl)}${q2}`;
  });

  // Rewrite every non-comment line: variant playlists and media segments.
  return text.split(/\r?\n/).map(line => {
    const value = line.trim();
    if (!value || value.startsWith('#')) return line;
    return proxyUrl(value, baseUrl);
  }).join('\n');
}

export default async function handler(req, res) {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL em falta');

    const target = new URL(targetUrl);
    if (!['http:', 'https:'].includes(target.protocol)) {
      return res.status(400).send('Protocolo inválido');
    }

    const headers = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Accept': req.headers.accept || '*/*'
    };
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetch(target, {
      headers,
      redirect: 'follow'
    });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).send(`Upstream HTTP ${upstream.status}`);
    }

    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    const isHls = target.pathname.toLowerCase().endsWith('.m3u8') ||
      contentType.includes('mpegurl') ||
      contentType.includes('vnd.apple.mpegurl');

    if (isHls) {
      const body = await upstream.text();
      // Do not label arbitrary text as HLS: only rewrite valid playlists.
      if (!body.trimStart().startsWith('#EXTM3U')) {
        return res.status(502).send('O servidor não devolveu uma playlist HLS válida');
      }
      const playlist = rewriteHls(body, target);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).send(playlist);
    }

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

    if (upstream.body) {
      return Readable.fromWeb(upstream.body).pipe(res);
    }
    return res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error('PROXY ERROR:', error);
    return res.status(500).send('Erro ao obter o recurso');
  }
}
