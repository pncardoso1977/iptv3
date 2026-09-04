export default async function handler(req, res) {
  try {
    const { username, password, action, server, ...extra } = req.query;

    if (!username || !password) {
      return res.status(400).json({ error: 'Credenciais em falta' });
    }

    const server = req.query.server;
    if (!server) return res.status(400).json({ error: 'Servidor em falta' });
    let url;
    try { url = new URL(server.replace(/\/$/, '') + '/player_api.php'); } catch { return res.status(400).json({ error: 'Servidor inválido' }); }

    url.searchParams.set('username', username);
    url.searchParams.set('password', password);

    if (action) {
      url.searchParams.set('action', action);
    }

    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Servidor IPTV respondeu HTTP ${response.status}`
      });
    }

    const text = await response.text();

    try {
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(502).json({
        error: 'Resposta inválida do servidor IPTV'
      });
    }

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: 'Erro ao contactar o servidor IPTV'
    });
  }
}