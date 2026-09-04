# Everywhere TV Web v2

PWA IPTV para Vercel com login Xtream Codes, catálogo Live/Filmes/Séries e reprodução sem VPS.

## Reprodução

- Live com `container_extension=ts` (ou URL `.ts`) usa `mpegts.js` local, com MediaSource ou Managed Media Source quando o browser a disponibiliza.
- HLS real (`.m3u8`) usa HLS nativo no Safari/iOS e `hls.js` local nos restantes browsers.
- Filmes e episódios MP4 usam `<video>` normal; o proxy preserva Range, Content-Range e Accept-Ranges.
- O proxy reescreve playlists HLS, incluindo segmentos, `EXT-X-KEY` e `EXT-X-MAP`, sem tentar tratar TS como HLS.

## Build

As bibliotecas do leitor estão incluídas em `assets/`; não são carregadas de CDN e não exigem VPS, FFmpeg ou runtime Vercel personalizado.
