import { Readable } from "node:stream";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function proxyUrl(url) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

function rewritePlaylist(text, baseUrl) {
  const rewrite = (value) => {
    try { return proxyUrl(new URL(value, baseUrl).toString()); } catch { return value; }
  };
  text = text.replace(/URI=("|')([^"']+)(\1)/gi, (_m, q, value) => `URI=${q}${rewrite(value)}${q}`);
  return text.split(/\r?\n/).map(line => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return line;
    return rewrite(t);
  }).join("\n");
}

function looksLikeHls(url, contentType) {
  return /\.m3u8(?:$|[?#])/i.test(url) || /mpegurl|vnd.apple.mpegurl/i.test(contentType || "");
}

export default async function handler(req, res) {
  try {
    const raw = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
    if (!raw) return res.status(400).send("URL em falta");
    let target;
    try { target = new URL(raw); } catch { return res.status(400).send("URL inválida"); }
    if (!ALLOWED_PROTOCOLS.has(target.protocol)) return res.status(400).send("Protocolo inválido");

    const headers = {
      "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
      "Accept": req.headers.accept || "*/*"
    };
    if (req.headers.range) headers.Range = req.headers.range;
    if (req.headers.referer) headers.Referer = req.headers.referer;

    const upstream = await fetch(target, {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers, redirect: "follow", cache: "no-store"
    });

    const finalUrl = upstream.url || target.toString();
    const ct = (upstream.headers.get("content-type") || "").toLowerCase();

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("PROXY UPSTREAM", upstream.status, finalUrl, detail.slice(0, 300));
      return res.status(upstream.status).send(`Upstream HTTP ${upstream.status}`);
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range,Accept-Ranges,Content-Type,ETag,Last-Modified");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

    if (looksLikeHls(finalUrl, ct)) {
      const body = await upstream.text();
      if (!body.trimStart().startsWith("#EXTM3U")) {
        console.error("INVALID HLS", finalUrl, body.slice(0, 500));
        return res.status(502).send("Resposta HLS inválida");
      }
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.status(200).send(rewritePlaylist(body, finalUrl));
    }

    const map = {
      "content-type": "Content-Type",
      "content-range": "Content-Range",
      "accept-ranges": "Accept-Ranges",
      "etag": "ETag",
      "last-modified": "Last-Modified"
    };
    for (const [from, to] of Object.entries(map)) {
      const value = upstream.headers.get(from);
      if (value) res.setHeader(to, value);
    }

    if (req.method === "HEAD") return res.status(upstream.status).end();
    if (upstream.body) return Readable.fromWeb(upstream.body).pipe(res);
    return res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error("PROXY ERROR", error);
    return res.status(502).send(`Erro ao obter o recurso: ${error?.message || "rede"}`);
  }
}
