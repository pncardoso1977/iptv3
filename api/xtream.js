export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range,Content-Type,Accept,Origin');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length,Content-Range,Accept-Ranges,Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({error:'Método não suportado'});
  try {
    let payload = req.query || {};
    if (req.method === 'POST') {
      payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    }
    const { username, password, action, server, ...extra } = payload;
    if (!username || !password) return res.status(400).json({error:'Credenciais em falta'});
    if (!server) return res.status(400).json({error:'Servidor em falta'});
    const base = String(server).replace(/\/$/, '');
    const url = new URL(base + '/player_api.php');
    url.searchParams.set('username', username);
    url.searchParams.set('password', password);
    if (action) url.searchParams.set('action', action);
    for (const [key,value] of Object.entries(extra)) if (value !== undefined) url.searchParams.set(key,value);
    const response = await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(25000),headers:{'User-Agent':'Mozilla/5.0'}});
    const text = await response.text();
    if (!response.ok) return res.status(502).json({error:'Servidor IPTV respondeu HTTP '+response.status});
    try { return res.status(200).json(JSON.parse(text)); }
    catch { return res.status(502).json({error:'Resposta inválida do servidor IPTV',preview:text.slice(0,120)}); }
  } catch (error) {
    console.error('xtream error',error);
    return res.status(502).json({error:'Não foi possível contactar o servidor IPTV',detail:error?.message||String(error)});
  }
}
