const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function proxyUrl(url) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

function isTextHls(buffer) {
  const sample = Buffer.from(buffer).subarray(0, 64).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  return sample.startsWith("#EXTM3U");
}

function looksLikeHls(url, contentType) {
  return /\.m3u8(?:$|[?#])/i.test(url) ||
    /mpegurl|vnd\.apple\.mpegurl/i.test(contentType || "");
}

function rewritePlaylist(text, baseUrl) {
  const rewrite = (value) => {
    try {
      const absolute = new URL(value, baseUrl).toString();
      return proxyUrl(absolute);
    } catch {
      return value;
    }
  };

  // Rewrite URI="..." attributes used by keys, maps, media playlists, etc.
  text = text.replace(/URI\s*=\s*("|')([^"']+)(\1)/gi,
    (_m, q, value) => `URI=${q}${rewrite(value)}${q}`);

  // Rewrite non-comment playlist lines (variants and media segments).
  return text.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    return rewrite(trimmed);
  }).join("\n");
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range,Content-Type,Accept");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Range,Accept-Ranges,Content-Length,Content-Type,ETag,Last-Modified"
  );
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const raw = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;

    if (!raw) return res.status(400).send("URL em falta");

    let target;
    try {
      target = new URL(raw);
    } catch {
      return res.status(400).send("URL inválida");
    }

    if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
      return res.status(400).send("Protocolo inválido");
    }

    const headers = {
      "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
      "Accept": req.headers.accept || "*/*"
    };

    if (req.headers.range) headers.Range = req.headers.range;

    // Do not forward the Vercel proxy URL as Referer.
    if (req.headers.referer && !req.headers.referer.includes("/api/proxy")) {
      headers.Referer = req.headers.referer;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        method: req.method === "HEAD" ? "HEAD" : "GET",
        headers,
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    const finalUrl = upstream.url || target.toString();
    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("PROXY UPSTREAM", {
        status: upstream.status,
        target: target.toString(),
        finalUrl,
        contentType,
        detail: detail.slice(0, 300)
      });

      return res.status(502).json({
        error: "Servidor IPTV recusou o recurso",
        upstreamStatus: upstream.status,
        contentType,
        url: finalUrl
      });
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

    if (req.method === "HEAD") {
      const pass = {
        "content-type": "Content-Type",
        "content-length": "Content-Length",
        "content-range": "Content-Range",
        "accept-ranges": "Accept-Ranges",
        "etag": "ETag",
        "last-modified": "Last-Modified"
      };
      for (const [from, to] of Object.entries(pass)) {
        const value = upstream.headers.get(from);
        if (value) res.setHeader(to, value);
      }
      return res.status(upstream.status).end();
    }

    /*
     * HLS playlists must be read as text and rewritten so that every
     * variant/segment/key remains inside the HTTPS proxy.
     *
     * Some IPTV servers incorrectly label TS data as .m3u8. Therefore
     * we inspect the first bytes instead of blindly treating every
     * .m3u8 URL as text.
     */
    if (looksLikeHls(finalUrl, contentType)) {
      const buffer = Buffer.from(await upstream.arrayBuffer());

      if (isTextHls(buffer)) {
        const playlist = rewritePlaylist(
          buffer.toString("utf8"),
          finalUrl
        );

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        return res.status(200).send(playlist);
      }

      // Not an actual HLS playlist: pass the binary response through.
      const binaryType =
        contentType.includes("mpegurl") ? "video/mp2t" :
        contentType || "video/mp2t";

      res.setHeader("Content-Type", binaryType);
      const contentRange = upstream.headers.get("content-range");
      const acceptRanges = upstream.headers.get("accept-ranges");
      if (contentRange) res.setHeader("Content-Range", contentRange);
      if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);

      return res.status(200).send(buffer);
    }

    const pass = {
      "content-type": "Content-Type",
      "content-range": "Content-Range",
      "accept-ranges": "Accept-Ranges",
      "etag": "ETag",
      "last-modified": "Last-Modified"
    };

    for (const [from, to] of Object.entries(pass)) {
      const value = upstream.headers.get(from);
      if (value) res.setHeader(to, value);
    }

    if (upstream.body) {
      const reader = upstream.body.getReader();

      res.on("close", () => {
        try { reader.cancel(); } catch {}
      });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.write(Buffer.from(value))) {
            await new Promise(resolve => res.once("drain", resolve));
          }
        }
        return res.end();
      } catch (streamError) {
        console.error("PROXY STREAM ERROR", streamError);
        if (!res.headersSent) return res.status(502).send("Erro durante o streaming");
        return res.end();
      }
    }

    return res.status(200).send(Buffer.from(await upstream.arrayBuffer()));

  } catch (error) {
    console.error("PROXY ERROR", error);

    const detail = error?.name === "AbortError"
      ? "Timeout ao contactar o servidor IPTV"
      : (error?.cause?.message || error?.message || "Erro de rede");

    return res.status(502).json({
      error: "Não foi possível obter o recurso IPTV",
      detail
    });
  }
}
