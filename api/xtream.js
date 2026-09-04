export default async function handler(req, res) {
  try {
    const { username, password, action, server, ...extra } = req.query;

    if (!username || !password) {
      return res.status(400).json({ error: 'Credenciais em falta' });
    }

    if (!server) {
      return res.status(400).json({ error: 'Servidor em falta' });
    }

    let base = String(server).trim().replace(/\/$/, '');

    // Accept either a plain Xtream base URL or one ending in player_api.php.
    // If a user pasted /get.php?... we still reduce it to the server origin/path.
    try {
      const parsed = new URL(base);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'O servidor deve usar HTTP ou HTTPS' });
      }
      if (/\/(player_api|panel_api|api)\.php$/i.test(parsed.pathname)) {
        base = `${parsed.origin}${parsed.pathname.replace(/\/(player_api|panel_api|api)\.php$/i, '')}`.replace(/\/$/, '');
      } else if (/\/get\.php$/i.test(parsed.pathname)) {
        base = `${parsed.origin}${parsed.pathname.replace(/\/get\.php$/i, '')}`.replace(/\/$/, '');
      }
    } catch {
      return res.status(400).json({ error: 'URL do servidor inválida' });
    }

    const url = new URL(base + '/player_api.php');
    url.searchParams.set('username', username);
    url.searchParams.set('password', password);
    if (action) url.searchParams.set('action', action);

    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
          'Accept': 'application/json,text/plain,*/*',
          'Connection': 'keep-alive'
        }
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Servidor IPTV respondeu HTTP ${response.status}`,
        detail: text.slice(0, 500)
      });
    }

    try {
      const data = JSON.parse(text);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).json(data);
    } catch {
      return res.status(502).json({
        error: 'Resposta inválida do servidor IPTV',
        detail: text.slice(0, 500)
      });
    }
  } catch (error) {
    console.error('XTREAM ERROR:', error);
    const detail = error?.name === 'AbortError'
      ? 'Tempo limite ao contactar o servidor IPTV.'
      : (error?.message || 'Erro de rede');
    return res.status(502).json({
      error: 'Erro ao contactar o servidor IPTV',
      detail
    });
  }
}
