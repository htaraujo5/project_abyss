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

## Deploy (Dokploy)

Painel: [http://2.24.87.103:3000/](http://2.24.87.103:3000/)  
Domínio: **https://abyss_project.softnexware.com**

| Serviço | Container port (Dokploy Domains) | Host (debug) |
| --- | --- | --- |
| **web** ← escolha este no Domains | **8035** | 8035 |
| api | 3344 (não exponha no domínio) | 3344 |
| postgres | — | 48291 |
| redis | — | 49173 |

No Dokploy → Domains do compose:

1. Host: `abyss_project.softnexware.com`
2. Service: `web`
3. Container Port: **8035**
4. HTTPS + Let's Encrypt

O `:3000` do servidor é só o painel. Bad Gateway quase sempre = porta do Domains ≠ 8035 (ex.: 80 ou 3000).

Compose: `infra/docker/docker-compose.yml` (rede `dokploy-network`).

## Testes

```bash
npm run test -w @abyss/api
```

## Documentação de design

[`documentacao/`](documentacao/) — fonte de verdade (GDD, puzzles, visual, arquitetura).

