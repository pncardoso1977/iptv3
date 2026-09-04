# Everywhere TV Web v2

PWA IPTV para Vercel com login Xtream Codes, catálogo Live/Filmes/Séries e reprodução sem VPS.

## Reprodução

- Live: a aplicação solicita HLS (`.m3u8`) ao servidor Xtream e passa-o pelo `/api/proxy`.
- iOS/Safari: usa HLS nativo do Safari.
- MP4: usa `<video>` com suporte a Range através do proxy.
- Não é necessário VPS ou FFmpeg externo.

## Importante

O servidor Xtream tem de disponibilizar HLS para os canais Live. A playlist `get.php` com `output=mpegts` descreve streams MPEG-TS (`.ts`); para browsers Apple, a app tenta o endpoint HLS equivalente (`.m3u8`). Se o fornecedor não disponibilizar HLS, uma aplicação web sem transcoder externo não consegue transformar MPEG-TS em HLS de forma fiável apenas com HTML5.
