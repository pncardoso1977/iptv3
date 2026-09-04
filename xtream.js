export default async function handler(req, res) {
  try {
    const { username, password, action, ...extra } = req.query;

    if (!username || !password) {
      return res.status(400).json({ error: 'Credenciais em falta' });
    }

    const url = new URL('http://everywheretv.fun:8080/player_api.php');

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