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

- Web: http://localhost:8035  
- API: http://localhost:3344/api/health  

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

| Serviço | Porta (host = container) |
| --- | --- |
| Web (nginx + proxy `/api` e `/ws`) | **8035** ← reverse proxy do domínio |
| API | **3344** |
| Postgres | **48291** (host) → 5432 no container |
| Redis | **49173** (host) → 6379 no container |

```bash
docker compose -f infra/docker/docker-compose.yml up -d --build
```

No nginx/softnexware (SSL Let's Encrypt), aponte o vhost para `http://127.0.0.1:8035` **ou**, se o proxy estiver na rede Docker, `http://web:8035` (porta **8035**, não 80). WebSocket: headers `Upgrade` / `Connection`. Modelo em [`infra/docker/host-proxy.example.conf`](infra/docker/host-proxy.example.conf).

## Testes

```bash
npm run test -w @abyss/api
```

## Documentação de design

[`documentacao/`](documentacao/) — fonte de verdade (GDD, puzzles, visual, arquitetura).

