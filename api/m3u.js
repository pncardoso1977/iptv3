export default async function handler(req, res) {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL M3U em falta');

    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol)) {
      return res.status(400).send('Protocolo inválido');
    }

    const response = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
      redirect: 'follow'
    });

    if (!response.ok) {
      return res.status(response.status).send(`Servidor IPTV respondeu HTTP ${response.status}`);
    }

    const text = await response.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).send(text);
  } catch (error) {
    console.error('M3U ERROR:', error);
    return res.status(500).send('Erro ao obter a playlist M3U');
  }
}
