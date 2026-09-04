import { Readable } from 'node:stream';

function rewriteHls(text, baseUrl) {
  const rewriteUri = (value) => {
    try {
      const absolute = new URL(value, baseUrl).toString();
      return `/api/proxy?url=${encodeURIComponent(absolute)}`;
    } catch {
      return value;
    }
  };

  // Rewrite URI="..." attributes such as EXT-X-KEY and EXT-X-MAP.
  text = text.replace(/URI="([^"]+)"/g, (_, value) => `URI="${rewriteUri(value)}"`);

  // Rewrite playlist/segment lines, preserving comments and blank lines.
  return text.split(/\r?\n/).map(line => {
    const value = line.trim();
    if (!value || value.startsWith('#')) return line;
    return rewriteUri(value);
  }).join('\n');
}

export default async function handler(req, res) {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL do stream em falta');

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
      return res.status(upstream.status).send(`Servidor IPTV respondeu HTTP ${upstream.status}`);
    }

    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    const isHls = target.pathname.toLowerCase().endsWith('.m3u8') ||
      contentType.includes('mpegurl') ||
      contentType.includes('vnd.apple.mpegurl');

    if (isHls) {
      const playlist = rewriteHls(await upstream.text(), target);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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

    // Do not buffer the entire video when the runtime exposes a Web stream.
    if (upstream.body) {
      return Readable.fromWeb(upstream.body).pipe(res);
    }

    return res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error('PROXY ERROR:', error);
    return res.status(500).send('Erro ao obter o stream');
  }
}
