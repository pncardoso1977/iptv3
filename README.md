# Everywhere TV Club — Web/PWA iOS v2

Reconstrução completa do protótipo a partir do APK fornecido, mantendo a identidade visual do Everywhere TV Club e a estrutura observável do projeto Android (Splash/Login, Home, Channels, Movies, Series, Player, Settings, XtreamRepository e M3UParser).

## Incluído
- Home com banner original, acesso rápido e "Continuar a ver".
- Canais, Filmes e Séries com pesquisa, categorias e grelha responsiva.
- Favoritos persistentes.
- Detalhes de séries, temporadas e episódios.
- Histórico/progresso de reprodução local.
- Player HTML5 fullscreen/playsinline adequado ao Safari/iOS.
- Login Xtream Codes e Playlist M3U.
- Cache local para abrir a interface rapidamente.
- PWA / Add to Home Screen / safe-area do iPhone.
- Layout desktop com navegação lateral e layout iPhone com barra inferior.

## Limitação técnica do iOS
O browser não consegue ultrapassar CORS, mixed-content ou restrições de codecs. Em produção, publicar por HTTPS e, para servidores sem CORS, usar um proxy HTTPS controlado pelo operador. Para iOS, HLS (.m3u8) é o formato preferencial.

## Arranque local
`python3 -m http.server 8080 --directory EverywhereTVWeb_v2`

Abra `http://localhost:8080`.

## Produção
Publicar a pasta num domínio HTTPS. No iPhone: Safari → Partilhar → Adicionar ao ecrã principal.


## Proxy / HLS
The app uses `/api/xtream`, `/api/m3u` and `/api/proxy` so an HTTPS Vercel frontend can access HTTP IPTV resources without Mixed Content. HLS playlists are rewritten through the same HTTPS proxy.
