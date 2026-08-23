# PROJECT ABYSS

Thriller investigativo técnico completo no browser. O desktop apreendido de **NULL** é o jogo.

## Conteúdo

- **91 puzzles** (P-001…P-091) — ~55 main / ~25 optional / ~10 secret
- **10 capítulos:** Prólogo → Surface → Deep → Dark → Charter → Mariana → Abyss → Primarch → Observer → Epílogo
- **4 finais:** Disconnect / Observer / Merge / NULL
- Workspace de investigação: `/home/null/investigation/<capítulo>/P-XXX/`
- Submit: `submit P-XXX <resposta>`

## Stack

| Pacote | Função |
| --- | --- |
| `apps/web` | Desktop React (Terminal, Files, Code, Browser, Trace, Packet, Graph, Hex, Image Lab, Memory, Forge, Evidence, Vault, ORPHEUS) |
| `apps/api` | Fastify + VFS Unix + Puzzle/Evidence engines + auth guest/register/login |
| `packages/shared` | Contratos Zod |
| `packages/content` | Campanha data-driven + catálogo + clues VFS |
| `infra/docker` | Compose (web/api/postgres/redis) |

## Subir

```bash
npm install
npm run build -w @abyss/shared
npm run build -w @abyss/content
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:8787/api/health  

## Jogar (fluxo)

1. Iniciar investigação (guest)
2. `ls -la /home/null` vs Files GUI → `cat /home/null/.null`
3. `investigate` → explorar briefs → `submit P-XXX resposta`
4. Avançar camadas até Observer → `choose disconnect|observer|merge|null` → `epilogue`

## Auth

- `POST /api/auth/guest`
- `POST /api/auth/register` `{ username, password, displayName? }`
- `POST /api/auth/login` `{ username, password }`

## Soundtrack

Arquivos em `apps/web/public/audio/`. Baixar pack completo:

```bash
npm run soundtrack:download
# copiar documentacao/PROJECT_ABYSS_SOUNDTRACK_PACK/audio/*.ogg → apps/web/public/audio/
```

## Deploy (domínio)

Produção: **https://project_abyss.softnexware.com**

| Serviço | Porta |
| --- | --- |
| Web (nginx + proxy `/api` e `/ws`) | **8080** ← use esta no reverse proxy |
| API (interna) | 8787 |
| Postgres / Redis | só rede Docker |

```bash
docker compose -f infra/docker/docker-compose.yml up -d --build
```

No nginx do host (SSL Let's Encrypt), aponte o vhost para `http://127.0.0.1:8080` com suporte a WebSocket (`Upgrade` / `Connection`). Modelo em [`infra/docker/host-proxy.example.conf`](infra/docker/host-proxy.example.conf).

## Testes

```bash
npm run test -w @abyss/api
```

## Documentação de design

[`documentacao/`](documentacao/) — fonte de verdade (GDD, puzzles, visual, arquitetura).

