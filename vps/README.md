# EverywhereTV Stream Relay (VPS)

Este serviço é destinado a streams IPTV que o Safari não consegue abrir diretamente, em particular TS. O FFmpeg faz remux para HLS (`.m3u8`) e o iPhone reproduz o HLS.

## Instalação

1. VPS Ubuntu 22.04/24.04 com Docker.
2. Copiar esta pasta para o VPS.
3. Ajustar `ALLOWED_HOSTS` em `docker-compose.yml` para os hosts do teu fornecedor.
4. Executar:

```bash
docker compose up -d --build
```

5. Testar:

```bash
curl http://IP_DO_VPS:8080/health
```

Deve responder `{"ok":true,"ffmpeg":true}`.

## HTTPS

Para iPhone, publica o serviço atrás de Nginx/Caddy com HTTPS. Exemplo de URL final:

`https://stream.teudominio.pt`

Na aplicação, abre **Definições → Servidor de streaming (VPS)** e coloca esse endereço.

## Funcionamento

A aplicação pede:

`https://stream.teudominio.pt/stream/54?source=<URL_XTREAM>`

O relay inicia FFmpeg apenas quando necessário e redireciona para:

`/hls/<id>/index.m3u8`

Não é necessário recodificar o vídeo: `-c copy` faz remux, reduzindo bastante o consumo de CPU.
