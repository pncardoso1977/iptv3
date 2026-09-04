export default async function handler(req, res) {
  try {
    const { url, username, password, type, id, extension } = req.query;
    let target;

    if (url) {
      target = new URL(url);
    } else {
      if (!username || !password || !type || !id) {
        return res.status(400).send('Parâmetros do stream em falta');
      }
      const allowed = { live: 'live', movie: 'movie', series: 'series' };
      if (!allowed[type]) return res.status(400).send('Tipo de stream inválido');
      const ext = extension || (type === 'live' ? 'ts' : 'mp4');
      target = new URL(
        `http://everywheretv.fun:8080/${allowed[type]}/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(id)}.${encodeURIComponent(ext)}`
      );
    }

    if (target.hostname !== 'everywheretv.fun') {
      return res.status(403).send('Servidor não autorizado');
    }
    if (!['http:', 'https:'].includes(target.protocol)) {
      return res.status(400).send('URL inválido');
    }

    const headers = { 'User-Agent': 'Mozilla/5.0' };
    for (const name of ['range', 'if-none-match', 'if-modified-since']) {
      const value = req.headers?.[name];
      if (value) headers[name] = value;
    }

    const response = await fetch(target, { headers, cache: 'no-store' });
    res.statusCode = response.status;

    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');

    if (req.method === 'HEAD') return res.end();
    if (!response.body) return res.end();

    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (error) {
      try { res.destroy(error); } catch {}
    }
  } catch (error) {
    console.error('Stream proxy:', error);
    if (!res.headersSent) res.status(502).send('Erro ao obter o stream IPTV');
    else res.end();
  }
}
