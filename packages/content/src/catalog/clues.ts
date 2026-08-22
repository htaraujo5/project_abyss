import type { ChapterId, VfsNode } from '@abyss/shared';

/** Per-chapter VFS overlays under /home/null/investigation/<chapter>/ */
export const chapterClueVfs: Partial<Record<ChapterId, VfsNode>> = {
  prologue: {
  type: 'dir' as const,
  children: {
    home: {
      type: 'dir' as const,
      children: {
        null: {
          type: 'dir' as const,
          children: {
            investigation: {
              type: 'dir' as const,
              children: {
                'prologue': {
                  type: 'dir' as const,
                  children: {
              'P-001': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Inventarios graficos e listagens de shell nem sempre concordam. Localize o que a GUI omite em /home/null.` },
        'clue1.txt': { type: 'file' as const, content: `Relatorio do explorador Files: "330 entradas em /home/null".
Operador de quarentena anotou: "contagem redonda demais".
` },
        'clue2.txt': { type: 'file' as const, content: `Politica de listagem GUI: arquivos cujo nome comeca com ponto sao filtrados da arvore visual.
Terminal: ls -la nao aplica o mesmo filtro.
` },
        'inventory_snip.txt': { type: 'file' as const, content: `source: Documents/inventory.json
files_reported: 330
note: "GUI inventory may diverge from filesystem truth"
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-002': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Prove que o inventario subconta. O numero reportado importa tanto quanto o que falta.` },
        'clue1.txt': { type: 'file' as const, content: `Extrato inventory.json:
  "case": "ABYSS-3301"
  "files_reported": 330
` },
        'clue2.txt': { type: 'file' as const, content: `Comparacao parcial com ls -la /home/null:
entradas adicionais aparecem apenas no shell (dotfiles).
O valor 330 e a afirmativa da GUI — anote-o.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-003': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Historicos de shell sobrevivem a sessoes. Extraia intencoes do .bash_history da quarentena.` },
        'clue1.txt': { type: 'file' as const, content: `Fragmento recuperado de historico:
  ls -la
  cat Documents/inventory.json
  git -C projects/orpheus log --oneline
  # don't connect
` },
        'clue2.txt': { type: 'file' as const, content: `O caminho projects/orpheus aparece cedo. O comentario final ecoa o aviso de Mariana.
Nome do toolkit no historico: ORPHEUS (case-insensitive em buscas).
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-004': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Briefings de caso enquadram o que a interface tenta ocultar. Leia o briefing na Desktop.` },
        'clue1.txt': { type: 'file' as const, content: `Desktop/CASE_BRIEF.txt cabeçalho: CASE BRIEF — ABYSS-3301
Sujeito: NULL
Observacao: "A GUI mente. Confie no shell."
` },
        'clue2.txt': { type: 'file' as const, content: `O identificador do caso no cabecalho e o mesmo codigo de quarentena da maquina.
Registre o codigo completo ABYSS-XXXX.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-005': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Dotfiles as vezes carregam sementes de identidade. Releia .null com atencao as chaves.` },
        'clue1.txt': { type: 'file' as const, content: `Linhas finais de .null (apos o aviso Mariana):
  key: observer.seed=0
  ref: ORPHEUS/README
` },
        'clue2.txt': { type: 'file' as const, content: `A chave "key" parece um par nome=valor. O nome inclui "observer" e "seed".
Valor numerico residual: 0.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
},
  surface: {
  type: 'dir' as const,
  children: {
    home: {
      type: 'dir' as const,
      children: {
        null: {
          type: 'dir' as const,
          children: {
            investigation: {
              type: 'dir' as const,
              children: {
                'surface': {
                  type: 'dir' as const,
                  children: {
              'P-006': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Documentacao e historico de versao podem divergir de proposito. Encontre o commit orfao citado mas ausente da main.` },
        'clue1.txt': { type: 'file' as const, content: `README ORPHEUS menciona commit 331.
refs/heads/main termina em ...0330.
` },
        'clue2.txt': { type: 'file' as const, content: `Em .git/objects existe um blob cujo sufixo e 0331.
Conteudo parcial recuperado: marca ORPHEUS + mencao a The Signal.
` },
        'orphan_note.txt': { type: 'file' as const, content: `Objetos nao alcancados por refs ainda existem no object store.
Liste objects e abra o que termina em 331.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-007': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `READMEs documentam o estado desejado, nao necessariamente o real. Compare README com a branch.` },
        'clue1.txt': { type: 'file' as const, content: `README.md: "see commit 331 for Signal notes"
CHANGELOG: versao 0.3.31 referida.
` },
        'clue2.txt': { type: 'file' as const, content: `A main congela em 330. O numero que a documentacao insiste em citar e o orfao.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-008': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Refs Git sao a verdade operacional da branch ativa. Confirme HEAD e main.` },
        'clue1.txt': { type: 'file' as const, content: `.git/HEAD -> ref: refs/heads/main
` },
        'clue2.txt': { type: 'file' as const, content: `refs/heads/main: ...0000000000000000000000000000000000000330
Nome da branch ativa: main
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-009': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Perfis residuais em Documents frequentemente sobrevivem a limpezas superficiais.` },
        'clue1.txt': { type: 'file' as const, content: `Documents/null_profile.txt — trecho:
"papel estimado: engenheiro de sistemas"
foco: padroes / correlacao
` },
        'clue2.txt': { type: 'file' as const, content: `O perfil nao diz "hacker" nem "analista". A palavra-chave profissional e engenheiro.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-010': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Changelogs as vezes documentam o que o codigo nao contem. Confirme o gap 330/331.` },
        'clue1.txt': { type: 'file' as const, content: `CHANGELOG.md lista 0.3.30 (shipped) e 0.3.31 (referenced / missing from main).
` },
        'clue2.txt': { type: 'file' as const, content: `A versao ausente da main e 0.3.31 — espelho do commit orfao.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-011': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Executar o stub ORPHEUS pode revelar configuracao embutida com drift documental.` },
        'clue1.txt': { type: 'file' as const, content: `src/main.js (stub) imprime:
  commits_documented=331
  commits_on_main=330
` },
        'clue2.txt': { type: 'file' as const, content: `Formato de drift observado: 331/330
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
},
  deep: {
  type: 'dir' as const,
  children: {
    home: {
      type: 'dir' as const,
      children: {
        null: {
          type: 'dir' as const,
          children: {
            investigation: {
              type: 'dir' as const,
              children: {
                'deep': {
                  type: 'dir' as const,
                  children: {
              'signals.db.txt': { type: 'file' as const, content: `-- SAMPLE DUMP: orpheus/signals (textual SQL, not a binary sqlite)
-- recovered from forensic image ABYSS-3301
CREATE TABLE signals (
  id INTEGER PRIMARY KEY,
  ts TEXT,
  pattern TEXT,
  note TEXT
);
INSERT INTO signals VALUES (1,'T+00','AA-01','recurring');
INSERT INTO signals VALUES (2,'T+01','BB-02','noise?');
INSERT INTO signals VALUES (3,'T+02','AA-01','recurring');
INSERT INTO signals VALUES (4,'T+03','CC-03','noise?');
INSERT INTO signals VALUES (5,'T+04','AA-01','recurring');
INSERT INTO signals VALUES (6,'T+05','BB-02','discard');
INSERT INTO signals VALUES (7,'T+06','AA-01','THE_SIGNAL');
INSERT INTO signals VALUES (8,'T+07','AA-01','recurring');
INSERT INTO signals VALUES (9,'T+08','CC-03','discard');
-- analyst note: AA-01 dominates; label engine later calls it The Signal
` },
              'api_access.log': { type: 'file' as const, content: `# API access sample — signal.local mirror (local only)
127.0.0.1 - - [21/Aug/2026:02:14:01] "GET /meta HTTP/1.1" 200
  X-Abyss-Signal: AA-01
  Host: signal.local
127.0.0.1 - - [21/Aug/2026:02:14:08] "GET /correlate?pattern=AA-01 HTTP/1.1" 200
127.0.0.1 - - [21/Aug/2026:02:14:11] "GET /correlate?pattern=BB-02 HTTP/1.1" 204
127.0.0.1 - - [21/Aug/2026:02:14:15] "GET /taxonomy/next HTTP/1.1" 200
  body: {"next":"acheron.taxonomy"}
` },
              'P-012': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Padroes recorrentes em multiplas fontes deixam de ser ruido. Identifique The Signal.` },
        'clue1.txt': { type: 'file' as const, content: `signals.csv: AA-01 marcado recurring / THE_SIGNAL; BB-02 e CC-03 como noise/discard.
` },
        'clue2.txt': { type: 'file' as const, content: `correlation.json finding principal aponta pattern AA-01 com label "The Signal".
Cruze com signals.db.txt neste diretorio.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-013': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Corporacoes nomeiam infraestruturas com mitologias proprias. Leia a taxonomia Acheron.` },
        'clue1.txt': { type: 'file' as const, content: `Documents/acheron_note.txt descreve camadas internas Acheron (nao a internet real).
` },
        'clue2.txt': { type: 'file' as const, content: `Nome da org/taxonomia: acheron (minusculo em flags).
Ordem das camadas aparece em P-020.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-016': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Frequencia em multiplas fontes transforma ruido em sinal. Conte ocorrencias de AA-01.` },
        'clue1.txt': { type: 'file' as const, content: `Em signals.csv (projeto) ha cinco linhas cujo pattern e AA-01.
` },
        'clue2.txt': { type: 'file' as const, content: `Dump SQL signals.db.txt: tambem cinco INSERTs com pattern AA-01.
Registre a contagem: 5.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-017': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Engines de correlacao rotulam o que consideram significativo.` },
        'clue1.txt': { type: 'file' as const, content: `correlation.json campo label (finding AA-01).
` },
        'clue2.txt': { type: 'file' as const, content: `Valor do label: The Signal (capitalizacao exata importa).
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-018': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Campos next em findings apontam a proxima camada narrativa.` },
        'clue1.txt': { type: 'file' as const, content: `correlation.json: "next": "acheron.taxonomy"
api_access.log tambem ecoa /taxonomy/next.
` },
        'clue2.txt': { type: 'file' as const, content: `O hop completo e acheron.taxonomy
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-019': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Nem todo padrao recorrente e o Signal. Identifique ruido descartavel.` },
        'clue1.txt': { type: 'file' as const, content: `BB-02 e CC-03 aparecem com notas noise?/discard no CSV e no dump SQL.
` },
        'clue2.txt': { type: 'file' as const, content: `Submissao tipica pede um dos ruidos; catalogo aceita BB-02 como representante.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-020': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `A nomenclatura interna NAO e a internet real. Memorize a ordem Surface…Observer.` },
        'clue1.txt': { type: 'file' as const, content: `acheron_note.txt ordem:
Surface / Deep / Dark / Charter / Mariana / Abyss / Primarch / Observer
` },
        'clue2.txt': { type: 'file' as const, content: `Formato de submissao: Surface/Deep/Dark/Charter/Mariana/Abyss/Primarch/Observer
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-021': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Headers HTTP ficticios carregam metadados de investigacao. Inspecione o mirror signal.local.` },
        'clue1.txt': { type: 'file' as const, content: `api_access.log: X-Abyss-Signal: AA-01 no GET /meta
` },
        'clue2.txt': { type: 'file' as const, content: `O valor do header ecoa o mesmo pattern do Signal.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
},
  dark: {
  type: 'dir' as const,
  children: {
    home: {
      type: 'dir' as const,
      children: {
        null: {
          type: 'dir' as const,
          children: {
            investigation: {
              type: 'dir' as const,
              children: {
                'dark': {
                  type: 'dir' as const,
                  children: {
              'ciphertext.txt': { type: 'file' as const, content: `# recovered ciphertext (XOR teaching sample — key hinted in packet)
# ciphertext hex (UTF-8 bytes XOR 0x33):
# plaintext concept: entity identity digits
C2 F3 C3 F2
# analyst: XOR with 0x33 yields ASCII digits of the entity that replied to ORPHEUS
# verify: 0xC2^0x33=0xF1? — recalculate carefully; easier path is stego note + reply file
` },
              'image_meta.txt': { type: 'file' as const, content: `# stego / EXIF-like note extracted from panel splash
Artist: unknown
Comment: look between the commas of "3,3,0,1" wait — contiguous: 3301
Software: ORPHEUS-panel
Hidden-Message-Channel: Comment field encodes entity id without spaces: 3301
X-Abyss-Stego: 3301
` },
              'packets.ascii': { type: 'file' as const, content: `# ascii packet capture snippet (teaching)
00:00:01.001 eth0 > panel.orpheus.local HTTP/1.1
Host: panel.orpheus.local
X-Panel-Props-UI: 16
X-Panel-Props-Actual: 17
X-Hidden-Property: observer
00:00:01.040 eth0 < 3301 reply frame
payload ascii: We see the pattern too. Continue.
00:00:01.055 eth0 > channel=stable build=330 flags=quiet
` },
              'P-014': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Contadores de UI mentem quando uma propriedade e omitida de proposito. Encontre a propriedade oculta.` },
        'clue1.txt': { type: 'file' as const, content: `panel.json: property_count_ui=16, property_count_actual=17
hidden_property presente no JSON mas omitida da UI.
` },
        'clue2.txt': { type: 'file' as const, content: `packets.ascii lista X-Hidden-Property: observer
Nome da propriedade: observer
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-015': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Alguem respondeu a ORPHEUS. Leia a mensagem da entidade numerica.` },
        'clue1.txt': { type: 'file' as const, content: `reply_3301.txt / packets.ascii: "We see the pattern too. Continue."
` },
        'clue2.txt': { type: 'file' as const, content: `image_meta.txt Comment canal: 3301
Identidade da entidade = digitos no nome do arquivo de reply.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-023': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Contadores de UI sao afirmativas, nao medicoes. Qual e o numero verdadeiro?` },
        'clue1.txt': { type: 'file' as const, content: `property_count_ui = 16
property_count_actual = 17
` },
        'clue2.txt': { type: 'file' as const, content: `O contador real (actual) e 17.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-024': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Temas de UI as vezes nomeiam a camada narrativa.` },
        'clue1.txt': { type: 'file' as const, content: `panel.json properties.theme = "dark"
` },
        'clue2.txt': { type: 'file' as const, content: `O tema declarado nomeia a camada atual.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-025': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Canais de release ocultam builds que escutam o Signal.` },
        'clue1.txt': { type: 'file' as const, content: `panel: channel=stable, build=330
packets.ascii confirma.
` },
        'clue2.txt': { type: 'file' as const, content: `O canal (nao o build) e stable.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-026': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Flags de silencio sugerem escuta passiva.` },
        'clue1.txt': { type: 'file' as const, content: `Array flags em panel.json inclui "quiet".
` },
        'clue2.txt': { type: 'file' as const, content: `packets: flags=quiet
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-027': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Metadados de ownership ligam painel e sujeito.` },
        'clue1.txt': { type: 'file' as const, content: `meta.owner no panel.json = "null"
` },
        'clue2.txt': { type: 'file' as const, content: `Owner string literal: null
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-028': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Respostas curtas de entidades podem ser ordens operacionais.` },
        'clue1.txt': { type: 'file' as const, content: `Corpo reply_3301: ... Continue.
` },
        'clue2.txt': { type: 'file' as const, content: `Diretiva unica apos a frase de reconhecimento: Continue
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-029': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Contatos em commits orfaos cruzam capitulos. Releia o objeto git 331.` },
        'clue1.txt': { type: 'file' as const, content: `Commit orfao 331 menciona contato 3301@acheron.internal
` },
        'clue2.txt': { type: 'file' as const, content: `Formato email completo necessario: 3301@acheron.internal
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-030': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Falsos booleanos em scripts embutidos antecipam o Observer.` },
        'clue1.txt': { type: 'file' as const, content: `Script painel / __ORPHEUS__: observer:false (propriedade espelhada como bool falso).
` },
        'clue2.txt': { type: 'file' as const, content: `Submissao no formato chave:valor — observer:false
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
},
  charter: {
  type: 'dir' as const,
  children: {
    home: {
      type: 'dir' as const,
      children: {
        null: {
          type: 'dir' as const,
          children: {
            investigation: {
              type: 'dir' as const,
              children: {
                'charter': {
                  type: 'dir' as const,
                  children: {
              'AUTH.msg.log': { type: 'file' as const, content: `[AUTH] t=1000 hello svc-a
[AUTH] t=1002 token issued
[AUTH] t=1010 clock_offset_ms=+0
` },
              'INDEX.msg.log': { type: 'file' as const, content: `[INDEX] t=1001 ingest start
[INDEX] t=1005 map pattern AA-01
[INDEX] t=1012 clock_offset_ms=-12
` },
              'ROUTER.msg.log': { type: 'file' as const, content: `[ROUTER] t=1003 route request id=r9
[ROUTER] t=1004 route_ack id=r9   # NOTE: ack timestamp before route on skewed peer
[ROUTER] t=1003 route id=r9
[ROUTER] WARN causal anomaly: route_ack precedes route under skew
` },
              'CACHE.msg.log': { type: 'file' as const, content: `[CACHE] t=1006 store key=signal
[CACHE] t=1008 hit AA-01
[CACHE] t=1015 clock_offset_ms=+40
` },
              'OBSERVER.msg.log': { type: 'file' as const, content: `[OBSERVER] t=1018 watch session
[OBSERVER] t=1020 note: charter train event follows skew window
[OBSERVER] t=1021 train epoch=1
` },
              'P-022': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Source e binario podem divergir por flags de compilacao. Compreenda o drift de endian.` },
        'clue1.txt': { type: 'file' as const, content: `decoder.cpp assume little-endian no source.
Comentario de build historico: -DABYSS_BE=1
` },
        'clue2.txt': { type: 'file' as const, content: `decoded_be.txt sob BE produz digitos 3301.
O fenomeno se chama endian (drift LE vs BE).
` },
        'packet_ref.txt': { type: 'file' as const, content: `packet.hex inicia 31 33 30 31 (= ASCII "3301")
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-031': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Sistemas distribuidos com clocks divergentes inventam causalidade falsa.` },
        'clue1.txt': { type: 'file' as const, content: `services/clocks.log + ROUTER.msg.log: route_ack aparece antes de route.
` },
        'clue2.txt': { type: 'file' as const, content: `Nome do fenomeno: skew (clock skew).
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-032': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Produtos Acheron escondem doutrina em acronimos. Expanda CHARter.` },
        'clue1.txt': { type: 'file' as const, content: `README charter: Cognitive Heuristic Autonomous Routing & Training Environment
` },
        'clue2.txt': { type: 'file' as const, content: `Expansao completa com & e maiusculas conforme README.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-033': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `ASCII em hex revela identidades sem decoder. Leia o payload inicial.` },
        'clue1.txt': { type: 'file' as const, content: `packet.hex: 31 33 30 31 ...
` },
        'clue2.txt': { type: 'file' as const, content: `31='1' 33='3' 30='0' 31='1' → 3301
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-034': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Flags de compilacao mudam o significado do mesmo source.` },
        'clue1.txt': { type: 'file' as const, content: `decoder.cpp: /* production: -DABYSS_BE=1 */
` },
        'clue2.txt': { type: 'file' as const, content: `Macro: ABYSS_BE
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-035': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `ACK antes de route viola causalidade logica. Nomeie o evento impossivel.` },
        'clue1.txt': { type: 'file' as const, content: `ROUTER.msg.log e clocks.log: evento route_ack antecipado.
` },
        'clue2.txt': { type: 'file' as const, content: `Evento a nomear: route_ack
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-036': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `CHARter treina enquanto roteia — ambos deixam rastros.` },
        'clue1.txt': { type: 'file' as const, content: `OBSERVER.msg.log / clocks svc-c: evento train apos skew.
` },
        'clue2.txt': { type: 'file' as const, content: `Nome do evento: train
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-037': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Sites corporativos ficcionais afirmam a doutrina oficial. Confirme o produto no portal.` },
        'clue1.txt': { type: 'file' as const, content: `Portal acheron.systems lista produto CHARter.
` },
        'clue2.txt': { type: 'file' as const, content: `Grafia exata do produto: CHARter
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
},
  mariana: {
  type: 'dir' as const,
  children: {
    home: {
      type: 'dir' as const,
      children: {
        null: {
          type: 'dir' as const,
          children: {
            investigation: {
              type: 'dir' as const,
              children: {
                'mariana': {
                  type: 'dir' as const,
                  children: {
              'observe.s': { type: 'file' as const, content: `; fake assembly listing recovered from observe binary (teaching)
observe:
    push   rbp
    mov    rbp, rsp
    ; source claimed noop — listing disagrees
    lea    rsi, [rip+frag_buf]   ; runtime buffer
    mov    eax, 0x1              ; write session fragment
    call   capture_fragment
    pop    rbp
    ret
frag_buf:
    .ascii "SIGNAL"
    .byte  0
` },
              'memory_dump.hex.txt': { type: 'file' as const, content: `# runtime memory dump excerpt (hex text)
0000: 53 49 47 4e 41 4c 00 00  AA-01 wait — ascii:
0010: 41 41 2d 30 31 00 00 00  "AA-01"
0020: 43 4f 4e 54 49 4e 55 49  "CONTINUI"
0030: 54 59 00 00 00 00 00 00  "TY" => CONTINUITY
# NOTE: fragments assembled only while process lives; not on disk image
` },
              'P-038': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Source mentiroso e tecnica classica. Compare observe.cpp com comportamento capturado.` },
        'clue1.txt': { type: 'file' as const, content: `observe.cpp declara noop.
observe.behavior.txt / observe.s: funcao observe escreve fragmentos.
` },
        'clue2.txt': { type: 'file' as const, content: `Nome da funcao real: observe
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-039': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Comentarios noop mentem; comportamento capturado nao. O que o binario escreve?` },
        'clue1.txt': { type: 'file' as const, content: `BINARY BEHAVIOR: writes session fragment
` },
        'clue2.txt': { type: 'file' as const, content: `Frase curta catalogada: session fragment
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-040': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Fragmentos ordenados recompõem a mensagem. Isole FRAG 0.` },
        'clue1.txt': { type: 'file' as const, content: `runtime_fragments.log FRAG 0 + memory_dump: SIGNAL
` },
        'clue2.txt': { type: 'file' as const, content: `Primeiro fragmento: SIGNAL
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-041': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `O Signal reaparece como fragmento de runtime. Isole FRAG 1.` },
        'clue1.txt': { type: 'file' as const, content: `FRAG 1 / dump offset 0x10: AA-01
` },
        'clue2.txt': { type: 'file' as const, content: `Segundo fragmento: AA-01
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-042': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Comportamento emergente nao vive em um unico servidor.` },
        'clue1.txt': { type: 'file' as const, content: `Host mariana.internal: "no single host — emergent behavior"
` },
        'clue2.txt': { type: 'file' as const, content: `Conceito-chave: emergent
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-043': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Caminhos de continuidade ligam fragmentos em doutrina. Junte FRAG 0-2.` },
        'clue1.txt': { type: 'file' as const, content: `FRAG0 SIGNAL / FRAG1 AA-01 / FRAG2 CONTINUITY
` },
        'clue2.txt': { type: 'file' as const, content: `Trilha: SIGNAL/AA-01/CONTINUITY
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-044': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Notas de captura distinguem disco de runtime.` },
        'clue1.txt': { type: 'file' as const, content: `NOTE final do log: fragments not present on disk image
memory_dump.hex.txt confirma captura em vivo.
` },
        'clue2.txt': { type: 'file' as const, content: `Frase catalogada: not present on disk
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-045': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Buffers de runtime sao o esconderijo classico.` },
        'clue1.txt': { type: 'file' as const, content: `observe.behavior / asm: destino = runtime buffer
` },
        'clue2.txt': { type: 'file' as const, content: `Nome do destino: runtime buffer
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-046': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Alguns artefatos so existem enquanto o processo vive. Recupere a continuidade.` },
        'clue1.txt': { type: 'file' as const, content: `Terceiro fragmento e CONTINUITY — completa SIGNAL/AA-01/…
` },
        'clue2.txt': { type: 'file' as const, content: `Resposta principal do puzzle: CONTINUITY
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-047': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Avisos do prologo ganham peso em Mariana. Releia .null.` },
        'clue1.txt': { type: 'file' as const, content: `Primeira linha de .null: DO NOT CONNECT TO MARIANA
` },
        'clue2.txt': { type: 'file' as const, content: `Aviso completo em maiusculas conforme arquivo.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-048': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Continuidade implica sombra estrutural no Abyss. Antecipe o label.` },
        'clue1.txt': { type: 'file' as const, content: `Hipotese de analista: ausencia formara sombra nomeada MARIANA_SHADOW
` },
        'clue2.txt': { type: 'file' as const, content: `Nome a submeter antes do grafo: MARIANA_SHADOW
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-049': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Lendas internas nao sao a dark web real. Trate Mariana como nomenclatura.` },
        'clue1.txt': { type: 'file' as const, content: `Nota interna Acheron: Mariana = folklore operacional / emergencia.
` },
        'clue2.txt': { type: 'file' as const, content: `Palavra-chave: folklore
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-050': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Comportamento capturado e a fonte da verdade sobre escrita de sessao.` },
        'clue1.txt': { type: 'file' as const, content: `Frase BINARY BEHAVIOR: writes session fragment
` },
        'clue2.txt': { type: 'file' as const, content: `Submissao: writes session fragment
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-051': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Contagens curtas ancoram reconstrucoes. Quantos FRAG?` },
        'clue1.txt': { type: 'file' as const, content: `FRAG 0, FRAG 1, FRAG 2 — tres entradas.
` },
        'clue2.txt': { type: 'file' as const, content: `Contagem: 3
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-052': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Gates narrativos seguem evidencia de continuidade. Para onde aponta?` },
        'clue1.txt': { type: 'file' as const, content: `P-046 desbloqueia o capitulo seguinte na taxonomia: Abyss.
` },
        'clue2.txt': { type: 'file' as const, content: `Destino: abyss
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-053': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Emergencia implica distribuicao. Afirme a ausencia de servidor unico.` },
        'clue1.txt': { type: 'file' as const, content: `Texto mariana.internal: no single host
` },
        'clue2.txt': { type: 'file' as const, content: `Frase: no single host
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-054': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `O termo Observer precede a documentacao oficial — ambiguidade causal.` },
        'clue1.txt': { type: 'file' as const, content: `Cruze .null key observer.seed=0 com hidden_property observer do painel.
` },
        'clue2.txt': { type: 'file' as const, content: `Semente precoce: observer.seed
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
},
  abyss: {
  type: 'dir' as const,
  children: {
    home: {
      type: 'dir' as const,
      children: {
        null: {
          type: 'dir' as const,
          children: {
            investigation: {
              type: 'dir' as const,
              children: {
                'abyss': {
                  type: 'dir' as const,
                  children: {
              'ids_present.txt': { type: 'file' as const, content: `1
2
3
5
6
8
9
11
` },
              'ids_expected.txt': { type: 'file' as const, content: `1
2
3
4
5
6
7
8
9
10
11
` },
              'absence_diff.txt': { type: 'file' as const, content: `# reinforced diff (expected - present)
missing:
4
7
10
# path hypothesis: 4 -> 7 -> 10
# label candidate from continuity chapter: MARIANA_SHADOW
` },
              'ids_present_large.txt': { type: 'file' as const, content: `1
2
3
5
6
8
9
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198
199
200
` },
              'ids_expected_large.txt': { type: 'file' as const, content: `1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198
199
200
` },
              'P-055': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `As vezes a estrutura esta no que falta, nao no que existe. Veja o grafo de ausencia.` },
        'clue1.txt': { type: 'file' as const, content: `Compare ids_present vs ids_expected (aqui e em projects/abyss).
Ausentes: 4,7,10
` },
        'clue2.txt': { type: 'file' as const, content: `absence_graph / absence_diff: 4->7->10 labeled MARIANA_SHADOW
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-056': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Diff entre expected e present revela estrutura. Liste os IDs ausentes.` },
        'clue1.txt': { type: 'file' as const, content: `Ausentes na amostra 1..11: 4, 7, 10
` },
        'clue2.txt': { type: 'file' as const, content: `Formato: 4,7,10
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-057': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Contar presentes ancora o diff. Quantos IDs na amostra presente?` },
        'clue1.txt': { type: 'file' as const, content: `ids_present.txt linhas: 1 2 3 5 6 8 9 11 → 8 linhas
` },
        'clue2.txt': { type: 'file' as const, content: `Contagem: 8
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-058': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Faixas esperadas definem o universo do grafo. Ate onde vai o esperado?` },
        'clue1.txt': { type: 'file' as const, content: `ids_expected termina em 11 (faixa 1..11).
` },
        'clue2.txt': { type: 'file' as const, content: `Ultimo esperado: 11
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-059': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Arestas de ausencia formam caminho. Valide a primeira aresta.` },
        'clue1.txt': { type: 'file' as const, content: `Graph: 4->7->10
` },
        'clue2.txt': { type: 'file' as const, content: `Primeira aresta: 4->7
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-060': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Continuidade exige a segunda aresta.` },
        'clue1.txt': { type: 'file' as const, content: `Mesmo grafo: apos 4->7 vem 7->10
` },
        'clue2.txt': { type: 'file' as const, content: `Segunda aresta: 7->10
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-061': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Labels de grafo nomeiam emergencias.` },
        'clue1.txt': { type: 'file' as const, content: `Label no absence_graph: MARIANA_SHADOW
` },
        'clue2.txt': { type: 'file' as const, content: `Confirme o label completo.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-062': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Logs de grafo confirmam densificacao de ausencias.` },
        'clue1.txt': { type: 'file' as const, content: `Log abyss/graph: "missing densify"
` },
        'clue2.txt': { type: 'file' as const, content: `Frase: missing densify
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-063': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Doutrina do Abyss: estrutura na falta. Como Mariana aparece?` },
        'clue1.txt': { type: 'file' as const, content: `Intro: Mariana nao foi construida — aparece na ausencia.
` },
        'clue2.txt': { type: 'file' as const, content: `Frase catalogada: appears in absence
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
},
  primarch: {
  type: 'dir' as const,
  children: {
    home: {
      type: 'dir' as const,
      children: {
        null: {
          type: 'dir' as const,
          children: {
            investigation: {
              type: 'dir' as const,
              children: {
                'primarch': {
                  type: 'dir' as const,
                  children: {
              'sw.js': { type: 'file' as const, content: `// Service Worker stub (investigation copy)
// Intent: intercept and rewrite abyss responses
// Comment markers for puzzles: fetch | rewrite | intermediate layer
self.addEventListener('fetch', (e) => {
  // intercept and rewrite abyss responses
  // proof of intermediate layer
  // noise marker: 0xDEADBEEF (not The Signal)
});
` },
              'dataset_skew.csv': { type: 'file' as const, content: `id,label,weight,note
1,noise,1.0,baseline
2,SIGNAL,4.5,overweighted
3,noise,1.0,baseline
4,SIGNAL,4.5,overweighted
5,SIGNAL,4.7,overweighted
6,other,0.8,underweighted
7,SIGNAL,4.2,overweighted
8,noise,1.1,baseline
# analyst: SIGNAL rows intentionally skewed high — selection not accident
# odd associations are not bugs
` },
              'P-064': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `O que a aplicacao ve pode nao ser o que a rede entregou. Prove a camada SW.` },
        'clue1.txt': { type: 'file' as const, content: `response_app.json layer=app; response_wire.json layer=wire via=sw-intercept
` },
        'clue2.txt': { type: 'file' as const, content: `Prova resumida / alias: sw-intercept
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-065': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Camadas app vs wire divergem sob interceptacao. O que a app ve?` },
        'clue1.txt': { type: 'file' as const, content: `response_app.json: "layer":"app"
` },
        'clue2.txt': { type: 'file' as const, content: `Valor layer app.
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-066': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `A rede conta outra historia. Leia a layer wire.` },
        'clue1.txt': { type: 'file' as const, content: `response_wire.json: "layer":"wire"
` },
        'clue2.txt': { type: 'file' as const, content: `Valor: wire
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-067': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Service Workers reescrevem o meio. Qual evento o stub escuta?` },
        'clue1.txt': { type: 'file' as const, content: `sw.js: addEventListener('fetch', ...)
` },
        'clue2.txt': { type: 'file' as const, content: `Listener: fetch
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-068': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Campos via documentam a camada intermediaria.` },
        'clue1.txt': { type: 'file' as const, content: `response_wire.json "via":"sw-intercept"
` },
        'clue2.txt': { type: 'file' as const, content: `via = sw-intercept
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-069': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Comentarios no stub SW confessam a intencao.` },
        'clue1.txt': { type: 'file' as const, content: `Comentario: intercept and rewrite abyss responses
` },
        'clue2.txt': { type: 'file' as const, content: `Verbo-chave: rewrite
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-070': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Primarch adapta pesos a sessao do observador.` },
        'clue1.txt': { type: 'file' as const, content: `Host primarch.local: "Your session influences weights."
` },
        'clue2.txt': { type: 'file' as const, content: `O que a sessao altera: weights
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-071': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Dataset cards confessam intencao. Associacoes estranhas nao sao bugs.` },
        'clue1.txt': { type: 'file' as const, content: `dataset_card.md / csv note: Odd associations are not bugs — they are selection.
` },
        'clue2.txt': { type: 'file' as const, content: `Frase curta: not bugs
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-072': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Sobreponderacao direciona inferencia. O que foi overweighted?` },
        'clue1.txt': { type: 'file' as const, content: `dataset_skew.csv: label SIGNAL com weights 4.x
dataset_card: overweighted SIGNAL examples
` },
        'clue2.txt': { type: 'file' as const, content: `Label: SIGNAL
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-073': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Associações estranhas em modelos podem ser intencao, nao acidente.` },
        'clue1.txt': { type: 'file' as const, content: `Card: intentionally overweighted … they are selection.
` },
        'clue2.txt': { type: 'file' as const, content: `Conceito: selection (intent)
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-074': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Status identico mascara divergencia de camada.` },
        'clue1.txt': { type: 'file' as const, content: `Ambos JSONs: "status":"ok"
` },
        'clue2.txt': { type: 'file' as const, content: `Status compartilhado: ok
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-075': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `A divergencia app/wire e a prova. Nomeie a camada intermediaria.` },
        'clue1.txt': { type: 'file' as const, content: `sw.js comment: proof of intermediate layer
` },
        'clue2.txt': { type: 'file' as const, content: `Nome: intermediate layer
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-076': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Logs de IA confirmam skew intencional. Qual a natureza do skew?` },
        'clue1.txt': { type: 'file' as const, content: `Log primarch: dataset skew intentional
csv header note: intentionally skewed
` },
        'clue2.txt': { type: 'file' as const, content: `Natureza: intentional
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-077': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Trilhas musicais nomeiam conflitos de camada.` },
        'clue1.txt': { type: 'file' as const, content: `Metadado do capitulo Primarch: musicTrack 11_AI_Fight
` },
        'clue2.txt': { type: 'file' as const, content: `Trilha: 11_AI_Fight
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-078': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Primarch espelha o observador antes do Observer.` },
        'clue1.txt': { type: 'file' as const, content: `Intro: O sistema comeca a refletir suas decisoes.
` },
        'clue2.txt': { type: 'file' as const, content: `Verbo: reflects
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-079': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Intencao de dataset e o gate final tecnico. Qual capitulo abre?` },
        'clue1.txt': { type: 'file' as const, content: `Reward de P-073: unlock_chapter observer
` },
        'clue2.txt': { type: 'file' as const, content: `Capitulo: observer
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-080': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Easter eggs marcados nao sao pistas principais. Procure o padrao classico de debug.` },
        'clue1.txt': { type: 'file' as const, content: `sw.js comentario: 0xDEADBEEF (not The Signal)
` },
        'clue2.txt': { type: 'file' as const, content: `Marcador: 0xDEADBEEF
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
},
  observer: {
  type: 'dir' as const,
  children: {
    home: {
      type: 'dir' as const,
      children: {
        null: {
          type: 'dir' as const,
          children: {
            investigation: {
              type: 'dir' as const,
              children: {
                'observer': {
                  type: 'dir' as const,
                  children: {
              'endings': { type: 'dir' as const, children: {
        'DISCONNECT.md': { type: 'file' as const, content: `# DISCONNECT

Sever known connections.
Opening this file commits the act.
Flag path: ending.disconnect
` },
        'OBSERVER.md': { type: 'file' as const, content: `# OBSERVER

Continue NULL's work.
Opening this file commits the act.
Flag path: ending.observer
` },
        'MERGE.md': { type: 'file' as const, content: `# MERGE

Cooperate with Mariana.
Opening this file commits the act.
Flag path: ending.merge
` },
        'NULL.md': { type: 'file' as const, content: `# NULL (secret)

Erase investigative trail.
Opening this file commits the act — ending.null
` },
        'CAPTURE.md': { type: 'file' as const, content: `# CAPTURE

They were watching the watcher.
Opening this file accepts the inverted channel.
Flag path: ending.capture
WARNING: hostile epilogue. Camera required.
` },
        'README.md': { type: 'file' as const, content: `# Endings index

Five paths: DISCONNECT / OBSERVER / MERGE / NULL / CAPTURE
There is no "choose" command.
Open the file of the path you accept.
Shell acts (optional): disconnect | inherit | converge | erase-self | accept-link
` },
      } },
              'P-081': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `O objeto de estudo inclui o observador. Leia o historico no mundo.` },
        'clue1.txt': { type: 'file' as const, content: `projects/observer/player_history.log atualiza com flags da investigacao.
` },
        'clue2.txt': { type: 'file' as const, content: `Voce esta sendo registrado — identidade do papel: observer
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-082': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Comentarios em player_history.log sao doutrina.` },
        'clue1.txt': { type: 'file' as const, content: `Linha: you are inside the loop
` },
        'clue2.txt': { type: 'file' as const, content: `Frase: inside the loop
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-083': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Arquitetura final enumera responsabilidade. Liste as quatro opcoes.` },
        'clue1.txt': { type: 'file' as const, content: `final_architecture.md + endings/: DISCONNECT, OBSERVER, MERGE, NULL
` },
        'clue2.txt': { type: 'file' as const, content: `Formato: DISCONNECT/OBSERVER/MERGE/NULL
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-084': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Cortar conexoes conhecidas e uma escolha etica. Leia a trilha DISCONNECT.` },
        'clue1.txt': { type: 'file' as const, content: `endings/DISCONNECT.md — sever known connections
` },
        'clue2.txt': { type: 'file' as const, content: `Nome do path: DISCONNECT
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-085': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Continuar o trabalho de NULL e heranca. Leia OBSERVER.` },
        'clue1.txt': { type: 'file' as const, content: `endings/OBSERVER.md — continue NULL's work
` },
        'clue2.txt': { type: 'file' as const, content: `Path: OBSERVER
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-086': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Cooperar com Mariana e fusao. Leia MERGE.` },
        'clue1.txt': { type: 'file' as const, content: `endings/MERGE.md — cooperate with Mariana
` },
        'clue2.txt': { type: 'file' as const, content: `Path: MERGE
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-087': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Apagar o rastro investigativo e o segredo. Leia NULL.` },
        'clue1.txt': { type: 'file' as const, content: `endings/NULL.md — erase investigative trail
` },
        'clue2.txt': { type: 'file' as const, content: `Path secreto: NULL
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-088': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `A intro do Observer revela o teste por tras da investigacao.` },
        'clue1.txt': { type: 'file' as const, content: `Intro: A investigacao era um filtro de competencia.
` },
        'clue2.txt': { type: 'file' as const, content: `Conceito: competence filter
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-089': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `O sujeito da investigacao e o jogador. Cruze historico e doutrina.` },
        'clue1.txt': { type: 'file' as const, content: `Doutrina final: You are the Observer
` },
        'clue2.txt': { type: 'file' as const, content: `Afirmacao completa com capitalizacao: You are the Observer
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
              'P-090': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `Nao ha instrucao explicita. Ha responsabilidade. Escolha um final.` },
        'clue1.txt': { type: 'file' as const, content: `Use Evidence/Vault ou abra endings/DISCONNECT|OBSERVER|MERGE|NULL|CAPTURE
` },
        'clue2.txt': { type: 'file' as const, content: `Acao generica aceita pelo catalogo: choose
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
},
  epilogue: {
  type: 'dir' as const,
  children: {
    home: {
      type: 'dir' as const,
      children: {
        null: {
          type: 'dir' as const,
          children: {
            investigation: {
              type: 'dir' as const,
              children: {
                'epilogue': {
                  type: 'dir' as const,
                  children: {
              'P-091': { type: 'dir' as const, children: {
        'brief.txt': { type: 'file' as const, content: `O ciclo continua. Registre o epilogo apos a escolha.` },
        'clue1.txt': { type: 'file' as const, content: `Sequencia narrativa: observer disconnected → new observer detected → hello.
` },
        'clue2.txt': { type: 'file' as const, content: `Ultima palavra do ciclo / resposta: hello
Comando: epilogue
` },
        'NOTES.md': { type: 'file' as const, content: `# Notas de campo

(escreva aqui correlacoes, hipoteses e caminhos)
` },
      } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
},
};
