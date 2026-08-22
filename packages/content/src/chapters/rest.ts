import type { ChapterPackage, PuzzleDefinition, EvidenceDefinition } from '@abyss/shared';
import { mergeVfs, baseHomeVfs } from '../vfs.js';

function chapter(
  partial: Omit<ChapterPackage, 'vfsSeed'> & { vfsExtra?: Parameters<typeof mergeVfs>[1] },
): ChapterPackage {
  const { vfsExtra, ...rest } = partial;
  return {
    ...rest,
    vfsSeed: vfsExtra ? mergeVfs(baseHomeVfs, vfsExtra) : baseHomeVfs,
  };
}

const deepOverlay = {
  type: 'dir' as const,
  children: {
    home: {
      type: 'dir' as const,
      children: {
        null: {
          type: 'dir' as const,
          children: {
            projects: {
              type: 'dir' as const,
              children: {
                orpheus: {
                  type: 'dir' as const,
                  children: {
                    data: {
                      type: 'dir' as const,
                      children: {
                        'signals.csv': {
                          type: 'file' as const,
                          content:
                            'id,source,pattern,note\n1,web,AA-01,noise?\n2,dns,AA-01,noise?\n3,mail,BB-02,noise?\n4,web,AA-01,recurring\n5,syslog,AA-01,recurring\n6,cache,CC-03,once\n7,web,AA-01,THE_SIGNAL\n',
                        },
                        'correlation.json': {
                          type: 'file' as const,
                          content: JSON.stringify(
                            {
                              engine: 'ORPHEUS',
                              finding: 'AA-01 is not noise',
                              label: 'The Signal',
                              next: 'acheron.taxonomy',
                            },
                            null,
                            2,
                          ),
                        },
                      },
                    },
                  },
                },
              },
            },
            Documents: {
              type: 'dir' as const,
              children: {
                'acheron_note.txt': {
                  type: 'file' as const,
                  content:
                    'Acheron Systems — taxonomia interna de camadas de infraestrutura.\nSurface / Deep / Dark / Charter / Mariana / Abyss / Primarch / Observer\nIsto NÃO é a internet real. É nomenclatura interna.\n',
                },
              },
            },
          },
        },
      },
    },
  },
};

export const deep: ChapterPackage = chapter({
  id: 'deep',
  title: 'Deep',
  intro: 'ORPHEUS correlaciona padrões. O que ele estava buscando — e o que chamou de Signal?',
  musicTrack: '03_Currents',
  vfsExtra: deepOverlay,
  puzzles: [
    {
      id: 'P-012',
      chapter: 'deep',
      title: 'Signal in the Noise',
      narrativeGoal: 'Identificar AA-01 como The Signal',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-006'],
      validators: [{ type: 'flag.set', flag: 'found.signal' }],
      rewards: [
        { type: 'unlock_flag', flag: 'found.signal' },
        { type: 'unlock_evidence', evidenceId: 'EV-THE-SIGNAL' },
        { type: 'unlock_chapter', chapter: 'dark' },
      ],
      evidenceUnlocks: ['EV-THE-SIGNAL', 'EV-ACHERON-TAXONOMY'],
      hintChain: [
        { level: 'conceptual', text: 'Padrões recorrentes em múltiplas fontes deixam de ser ruído.' },
        { level: 'directional', text: 'Analise signals.csv e correlation.json em orpheus/data.' },
        { level: 'operational', text: 'cat ~/projects/orpheus/data/correlation.json' },
      ],
    },
    {
      id: 'P-013',
      chapter: 'deep',
      title: 'Acheron Taxonomy',
      narrativeGoal: 'Ler a taxonomia interna Acheron',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-006'],
      validators: [{ type: 'flag.set', flag: 'read.acheron.taxonomy' }],
      rewards: [
        { type: 'unlock_flag', flag: 'read.acheron.taxonomy' },
        { type: 'unlock_evidence', evidenceId: 'EV-ACHERON-TAXONOMY' },
      ],
      evidenceUnlocks: ['EV-ACHERON-TAXONOMY'],
      hintChain: [
        { level: 'conceptual', text: 'Corporações nomeiam infraestruturas com mitologias próprias.' },
        { level: 'directional', text: 'Documents/acheron_note.txt' },
        { level: 'operational', text: 'cat ~/Documents/acheron_note.txt' },
      ],
    },
  ],
  evidence: [
    {
      id: 'EV-THE-SIGNAL',
      kind: 'evidence',
      title: 'The Signal',
      summary: 'Padrão AA-01 recorrente rotulado por ORPHEUS como The Signal.',
      chapter: 'deep',
      tags: ['signal', 'orpheus'],
    },
    {
      id: 'EV-ACHERON-TAXONOMY',
      kind: 'organization',
      title: 'Taxonomia Acheron',
      summary: 'Camadas ficcionais internas: Surface…Observer.',
      chapter: 'deep',
      tags: ['acheron'],
    },
  ],
  websites: [
    {
      host: 'signal.local',
      title: 'Signal Mirror',
      html: `<h1>AA-01</h1><p>recurring across surfaces</p><meta name="abyss" content="the-signal"/>`,
      headers: { 'X-Abyss-Signal': 'AA-01' },
    },
  ],
  logs: [
    {
      id: 'orpheus-corr',
      source: 'orpheus',
      lines: ['correlate: AA-01 count=5', 'label candidate: The Signal', 'escalate: dark layer'],
    },
  ],
});

const darkOverlay = {
  type: 'dir' as const,
  children: {
    home: {
      type: 'dir' as const,
      children: {
        null: {
          type: 'dir' as const,
          children: {
            projects: {
              type: 'dir' as const,
              children: {
                orpheus: {
                  type: 'dir' as const,
                  children: {
                    web: {
                      type: 'dir' as const,
                      children: {
                        'panel.json': {
                          type: 'file' as const,
                          content: JSON.stringify(
                            {
                              title: 'ORPHEUS Panel',
                              properties: {
                                id: 1,
                                name: 'panel',
                                theme: 'dark',
                                layers: 8,
                                signal: 'AA-01',
                                status: 'listening',
                                endpoint: '/api/v1',
                                retries: 3,
                                timeout: 30,
                                debug: false,
                                locale: 'pt-BR',
                                version: '0.3.30',
                                build: 330,
                                channel: 'stable',
                                flags: ['quiet'],
                                meta: { owner: 'null' },
                              },
                              property_count_ui: 16,
                              property_count_actual: 17,
                              hidden_property: 'observer',
                            },
                            null,
                            2,
                          ),
                        },
                        'reply_3301.txt': {
                          type: 'file' as const,
                          content:
                            'FROM: 3301\nTO: ORPHEUS\n\nWe see the pattern too.\nContinue.\n\n— 3301\n',
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
    },
  },
};

export const dark: ChapterPackage = chapter({
  id: 'dark',
  title: 'Dark',
  intro: 'Alguém — ou algo — respondeu a ORPHEUS. A entidade 3301 entra em cena.',
  musicTrack: '12_Electric_Stream',
  vfsExtra: darkOverlay,
  puzzles: [
    {
      id: 'P-014',
      chapter: 'dark',
      title: 'Missing JSON Property',
      narrativeGoal: 'Descobrir a propriedade oculta observer',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-012'],
      validators: [{ type: 'flag.set', flag: 'found.observer.prop' }],
      rewards: [
        { type: 'unlock_flag', flag: 'found.observer.prop' },
        { type: 'unlock_evidence', evidenceId: 'EV-OBSERVER-PROP' },
        { type: 'unlock_evidence', evidenceId: 'EV-ENTITY-3301' },
        { type: 'unlock_chapter', chapter: 'charter' },
      ],
      evidenceUnlocks: ['EV-OBSERVER-PROP', 'EV-ENTITY-3301'],
      hintChain: [
        { level: 'conceptual', text: 'Contadores de UI mentem quando uma propriedade é omitida de propósito.' },
        { level: 'directional', text: 'panel.json em orpheus/web — UI diz 16, actual diz 17.' },
        { level: 'operational', text: 'cat ~/projects/orpheus/web/panel.json e procure hidden_property / observer' },
      ],
    },
    {
      id: 'P-015',
      chapter: 'dark',
      title: 'Entity 3301',
      narrativeGoal: 'Ler a resposta de 3301',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-012'],
      validators: [{ type: 'flag.set', flag: 'read.3301.reply' }],
      rewards: [
        { type: 'unlock_flag', flag: 'read.3301.reply' },
        { type: 'unlock_evidence', evidenceId: 'EV-ENTITY-3301' },
      ],
      evidenceUnlocks: ['EV-ENTITY-3301'],
      hintChain: [
        { level: 'conceptual', text: 'Respostas a sistemas de correlação podem ser humanas — ou parecer humanas.' },
        { level: 'directional', text: 'reply_3301.txt no diretório web do ORPHEUS.' },
        { level: 'operational', text: 'cat ~/projects/orpheus/web/reply_3301.txt' },
      ],
    },
  ],
  evidence: [
    {
      id: 'EV-OBSERVER-PROP',
      kind: 'evidence',
      title: 'observer:false (oculto)',
      summary: 'Propriedade JSON omitida da UI: observer.',
      chapter: 'dark',
      tags: ['observer', 'web'],
    },
    {
      id: 'EV-ENTITY-3301',
      kind: 'person',
      title: 'Entidade 3301',
      summary: 'Resposta a ORPHEUS: "We see the pattern too."',
      chapter: 'dark',
      tags: ['3301'],
    },
  ],
  websites: [
    {
      host: 'panel.orpheus.local',
      title: 'ORPHEUS Panel',
      html: `<h1>Panel</h1><p>Properties: 16</p><script>window.__ORPHEUS__={observer:false}</script>`,
      headers: { 'X-Abyss-Observer': 'false', 'X-Abyss-Entity': '3301' },
    },
  ],
  logs: [
    {
      id: '3301',
      source: 'signal',
      lines: ['inbound reply tagged 3301', 'payload: continue', 'channel: dark'],
    },
  ],
});

export const charter: ChapterPackage = chapter({
  id: 'charter',
  title: 'Charter',
  intro: 'Acheron não é só uma empresa. CHARter — Cognitive Heuristic Autonomous Routing & Training Environment.',
  musicTrack: '14_New_Factory',
  vfsExtra: {
    type: 'dir',
    children: {
      home: {
        type: 'dir',
        children: {
          null: {
            type: 'dir',
            children: {
              projects: {
                type: 'dir',
                children: {
                  charter: {
                    type: 'dir',
                    children: {
                      'README.md': {
                        type: 'file',
                        content:
                          '# CHARter\n\nCognitive Heuristic Autonomous Routing & Training Environment\n\nSource and binary disagree on endian defaults.\n',
                      },
                      'decoder.cpp': {
                        type: 'file',
                        content: `// Historical decoder — little endian assumed
#include <cstdint>
// decode(packet) expects LE
// production binary was built with -DABYSS_BE=1
`,
                      },
                      'packet.hex': {
                        type: 'file',
                        content: '31 33 30 31 00 AA 01 00\n',
                      },
                      'decoded_be.txt': {
                        type: 'file',
                        content: '3301\nSIGNAL_OK\n',
                      },
                      'services': {
                        type: 'dir',
                        children: {
                          'clocks.log': {
                            type: 'file',
                            content:
                              'svc-a ts=1000 event=route\nsvc-b ts=900 event=route_ack\nsvc-c ts=1005 event=train\nIMPOSSIBLE: ack before route on logical causality if clocks aligned\n',
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
      },
    },
  },
  puzzles: [
    {
      id: 'P-022',
      chapter: 'charter',
      title: 'Decoder Drift',
      narrativeGoal: 'Compreender drift de endian / mensagens 3301',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-014'],
      validators: [{ type: 'flag.set', flag: 'understood.decoder.drift' }],
      rewards: [
        { type: 'unlock_flag', flag: 'understood.decoder.drift' },
        { type: 'unlock_evidence', evidenceId: 'EV-DECODER-DRIFT' },
      ],
      evidenceUnlocks: ['EV-DECODER-DRIFT', 'EV-CHARTER-DEF'],
      hintChain: [
        { level: 'conceptual', text: 'Source e binário podem divergir por flags de compilação.' },
        { level: 'directional', text: 'Compare decoder.cpp, packet.hex e decoded_be.txt.' },
        { level: 'operational', text: 'cat ~/projects/charter/decoded_be.txt' },
      ],
    },
    {
      id: 'P-031',
      chapter: 'charter',
      title: 'Clock Reconstruction',
      narrativeGoal: 'Detectar evento causalmente impossível',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-014'],
      validators: [{ type: 'flag.set', flag: 'found.clock.skew' }],
      rewards: [
        { type: 'unlock_flag', flag: 'found.clock.skew' },
        { type: 'unlock_evidence', evidenceId: 'EV-CLOCK-SKEW' },
        { type: 'unlock_chapter', chapter: 'mariana' },
      ],
      evidenceUnlocks: ['EV-CLOCK-SKEW'],
      hintChain: [
        { level: 'conceptual', text: 'Sistemas distribuídos com clocks divergentes inventam causalidade falsa.' },
        { level: 'directional', text: 'services/clocks.log' },
        { level: 'operational', text: 'cat ~/projects/charter/services/clocks.log' },
      ],
    },
  ] as PuzzleDefinition[],
  evidence: [
    {
      id: 'EV-CHARTER-DEF',
      kind: 'system',
      title: 'CHARter',
      summary: 'Cognitive Heuristic Autonomous Routing & Training Environment.',
      chapter: 'charter',
      tags: ['acheron', 'charter'],
    },
    {
      id: 'EV-DECODER-DRIFT',
      kind: 'contradiction',
      title: 'Decoder endian drift',
      summary: 'Source assume LE; binário histórico BE produz 3301.',
      chapter: 'charter',
      tags: ['cpp'],
    },
    {
      id: 'EV-CLOCK-SKEW',
      kind: 'event',
      title: 'Clock skew impossível',
      summary: 'ACK temporalmente antes do route sob relógios desalinhados.',
      chapter: 'charter',
      tags: ['distributed'],
    },
  ] as EvidenceDefinition[],
  websites: [
    {
      host: 'acheron.systems',
      title: 'Acheron Systems',
      html: `<h1>Acheron Systems</h1><p>Infrastructure for cognitive routing.</p><p>Product: CHARter</p>`,
      headers: { 'X-Abyss-Org': 'Acheron' },
    },
  ],
  logs: [
    {
      id: 'charter',
      source: 'charter',
      lines: ['route ok', 'train ok', 'warn: skew detected across svc-a/b'],
    },
  ],
});

export const mariana: ChapterPackage = chapter({
  id: 'mariana',
  title: 'Mariana',
  intro: 'Não há um único servidor Mariana. O comportamento emerge entre sistemas.',
  musicTrack: '16_Strange_Experiments',
  vfsExtra: {
    type: 'dir',
    children: {
      home: {
        type: 'dir',
        children: {
          null: {
            type: 'dir',
            children: {
              projects: {
                type: 'dir',
                children: {
                  mariana: {
                    type: 'dir',
                    children: {
                      'observe.cpp': {
                        type: 'file',
                        content: `// source claims observe() is a no-op
void observe() { /* noop */ }
`,
                      },
                      'observe.behavior.txt': {
                        type: 'file',
                        content:
                          'BINARY BEHAVIOR (captured):\nobserve() writes session fragment to runtime buffer\nfragment: SIGNAL/AA-01/CONTINUITY\n',
                      },
                      'runtime_fragments.log': {
                        type: 'file',
                        content:
                          'FRAG 0: SIGNAL\nFRAG 1: AA-01\nFRAG 2: CONTINUITY\nNOTE: not present on disk image before runtime\n',
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
  },
  puzzles: [
    {
      id: 'P-038',
      chapter: 'mariana',
      title: 'Source/Binary Divergence',
      narrativeGoal: 'Descobrir função observe real',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-031'],
      validators: [{ type: 'flag.set', flag: 'found.observe' }],
      rewards: [
        { type: 'unlock_flag', flag: 'found.observe' },
        { type: 'unlock_evidence', evidenceId: 'EV-OBSERVE-FN' },
      ],
      evidenceUnlocks: ['EV-OBSERVE-FN'],
      hintChain: [
        { level: 'conceptual', text: 'Source mentiroso é uma técnica clássica de ocultação.' },
        { level: 'directional', text: 'Compare observe.cpp com observe.behavior.txt.' },
        { level: 'operational', text: 'cat ~/projects/mariana/observe.behavior.txt' },
      ],
    },
    {
      id: 'P-046',
      chapter: 'mariana',
      title: 'Runtime Fragments',
      narrativeGoal: 'Recuperar fragmentos do Signal em runtime',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-031'],
      validators: [{ type: 'flag.set', flag: 'found.runtime.fragments' }],
      rewards: [
        { type: 'unlock_flag', flag: 'found.runtime.fragments' },
        { type: 'unlock_evidence', evidenceId: 'EV-RUNTIME-FRAGMENTS' },
        { type: 'unlock_chapter', chapter: 'abyss' },
      ],
      evidenceUnlocks: ['EV-RUNTIME-FRAGMENTS'],
      hintChain: [
        { level: 'conceptual', text: 'Alguns artefatos só existem enquanto o processo vive.' },
        { level: 'directional', text: 'runtime_fragments.log' },
        { level: 'operational', text: 'cat ~/projects/mariana/runtime_fragments.log' },
      ],
    },
  ],
  evidence: [
    {
      id: 'EV-OBSERVE-FN',
      kind: 'system',
      title: 'observe()',
      summary: 'Binário grava fragmentos; source declara noop.',
      chapter: 'mariana',
      tags: ['reversing'],
    },
    {
      id: 'EV-RUNTIME-FRAGMENTS',
      kind: 'evidence',
      title: 'Fragmentos runtime',
      summary: 'SIGNAL / AA-01 / CONTINUITY',
      chapter: 'mariana',
      tags: ['signal', 'memory'],
    },
  ],
  websites: [
    {
      host: 'mariana.internal',
      title: 'Mariana Viz',
      html: `<h1>Mariana</h1><p>No single host. Emergent routing.</p>`,
      headers: { 'X-Abyss-Mariana': 'emergent' },
    },
  ],
  logs: [{ id: 'mariana', source: 'mariana', lines: ['observe invoked', 'fragment flush'] }],
});

export const abyssChapter: ChapterPackage = chapter({
  id: 'abyss',
  title: 'Abyss',
  intro: 'Milhões de registros. Os IDs ausentes formam estrutura. Mariana não foi “construída” — aparece na ausência.',
  musicTrack: '17_System_Overload',
  vfsExtra: {
    type: 'dir',
    children: {
      home: {
        type: 'dir',
        children: {
          null: {
            type: 'dir',
            children: {
              projects: {
                type: 'dir',
                children: {
                  abyss: {
                    type: 'dir',
                    children: {
                      'ids_present.txt': {
                        type: 'file',
                        content: '1\n2\n3\n5\n6\n8\n9\n11\n',
                      },
                      'ids_expected.txt': {
                        type: 'file',
                        content: '1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n',
                      },
                      'absence_graph.txt': {
                        type: 'file',
                        content:
                          'Missing IDs: 4,7,10\nGraph: 4->7->10 forms continuity path labeled MARIANA_SHADOW\n',
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
  },
  puzzles: [
    {
      id: 'P-055',
      chapter: 'abyss',
      title: 'Graph of Absence',
      narrativeGoal: 'Ver o grafo formado por IDs ausentes',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-046'],
      validators: [{ type: 'flag.set', flag: 'found.absence.graph' }],
      rewards: [
        { type: 'unlock_flag', flag: 'found.absence.graph' },
        { type: 'unlock_evidence', evidenceId: 'EV-ABSENCE-GRAPH' },
        { type: 'unlock_chapter', chapter: 'primarch' },
      ],
      evidenceUnlocks: ['EV-ABSENCE-GRAPH'],
      hintChain: [
        { level: 'conceptual', text: 'Às vezes a estrutura está no que falta, não no que existe.' },
        { level: 'directional', text: 'Compare ids_present, ids_expected e absence_graph.' },
        { level: 'operational', text: 'cat ~/projects/abyss/absence_graph.txt' },
      ],
    },
  ],
  evidence: [
    {
      id: 'EV-ABSENCE-GRAPH',
      kind: 'evidence',
      title: 'Grafo de ausência',
      summary: 'IDs 4→7→10 formam MARIANA_SHADOW.',
      chapter: 'abyss',
      tags: ['sql', 'graph'],
    },
  ],
  websites: [],
  logs: [{ id: 'abyss', source: 'graph', lines: ['missing densify', 'label MARIANA_SHADOW'] }],
});

export const primarch: ChapterPackage = chapter({
  id: 'primarch',
  title: 'Primarch',
  intro: 'O sistema começa a refletir suas decisões. Service Workers interceptam. Datasets mentem com intenção.',
  musicTrack: '11_AI_Fight',
  vfsExtra: {
    type: 'dir',
    children: {
      home: {
        type: 'dir',
        children: {
          null: {
            type: 'dir',
            children: {
              projects: {
                type: 'dir',
                children: {
                  primarch: {
                    type: 'dir',
                    children: {
                      'sw.js': {
                        type: 'file',
                        content: `// Service Worker stub
self.addEventListener('fetch', (e) => {
  // intercept and rewrite abyss responses
  // proof of intermediate layer
});
`,
                      },
                      'response_app.json': {
                        type: 'file',
                        content: '{"status":"ok","layer":"app"}\n',
                      },
                      'response_wire.json': {
                        type: 'file',
                        content: '{"status":"ok","layer":"wire","via":"sw-intercept"}\n',
                      },
                      'dataset_card.md': {
                        type: 'file',
                        content:
                          '# Dataset Card\n\nTraining intentionally overweighted SIGNAL examples.\nOdd associations are not bugs — they are selection.\n',
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
  },
  puzzles: [
    {
      id: 'P-064',
      chapter: 'primarch',
      title: 'Worker Interception',
      narrativeGoal: 'Provar camada intermediária SW',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-055'],
      validators: [{ type: 'flag.set', flag: 'found.sw.intercept' }],
      rewards: [
        { type: 'unlock_flag', flag: 'found.sw.intercept' },
        { type: 'unlock_evidence', evidenceId: 'EV-SW-INTERCEPT' },
      ],
      evidenceUnlocks: ['EV-SW-INTERCEPT'],
      hintChain: [
        { level: 'conceptual', text: 'O que a aplicação “vê” pode não ser o que a rede entregou.' },
        { level: 'directional', text: 'Compare response_app.json e response_wire.json.' },
        { level: 'operational', text: 'cat ~/projects/primarch/response_wire.json' },
      ],
    },
    {
      id: 'P-073',
      chapter: 'primarch',
      title: 'Dataset Intent',
      narrativeGoal: 'Reconhecer seleção deliberada de treino',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-055'],
      validators: [{ type: 'flag.set', flag: 'found.dataset.intent' }],
      rewards: [
        { type: 'unlock_flag', flag: 'found.dataset.intent' },
        { type: 'unlock_evidence', evidenceId: 'EV-DATASET-INTENT' },
        { type: 'unlock_chapter', chapter: 'observer' },
      ],
      evidenceUnlocks: ['EV-DATASET-INTENT'],
      hintChain: [
        { level: 'conceptual', text: 'Associações estranhas em modelos podem ser intenção, não acidente.' },
        { level: 'directional', text: 'dataset_card.md' },
        { level: 'operational', text: 'cat ~/projects/primarch/dataset_card.md' },
      ],
    },
  ],
  evidence: [
    {
      id: 'EV-SW-INTERCEPT',
      kind: 'system',
      title: 'SW interception',
      summary: 'Resposta wire difere da app via service worker.',
      chapter: 'primarch',
      tags: ['web', 'sw'],
    },
    {
      id: 'EV-DATASET-INTENT',
      kind: 'evidence',
      title: 'Dataset intent',
      summary: 'Treino sobreponderou SIGNAL de propósito.',
      chapter: 'primarch',
      tags: ['ml'],
    },
  ],
  websites: [
    {
      host: 'primarch.local',
      title: 'Primarch',
      html: `<h1>Adaptive</h1><p>Your session influences weights.</p>`,
      headers: { 'X-Abyss-Adaptive': '1' },
    },
  ],
  logs: [{ id: 'primarch', source: 'ai', lines: ['sw rewrite', 'dataset skew intentional'] }],
});

export const observer: ChapterPackage = chapter({
  id: 'observer',
  title: 'Observer',
  intro: 'Logs contêm suas decisões. A investigação era um filtro de competência. Você é o Observer.',
  musicTrack: '09_Simulation_Unknown',
  vfsExtra: {
    type: 'dir',
    children: {
      home: {
        type: 'dir',
        children: {
          null: {
            type: 'dir',
            children: {
              projects: {
                type: 'dir',
                children: {
                  observer: {
                    type: 'dir',
                    children: {
                      'player_history.log': {
                        type: 'file',
                        content:
                          '# This file updates with your investigation flags\n# Read it after making progress — you are inside the loop.\n',
                      },
                      'final_architecture.md': {
                        type: 'file',
                        content: `# Final Architecture

You may:
1. DISCONNECT — sever known connections (open endings/DISCONNECT)
2. OBSERVER — continue NULL's work (open endings/OBSERVER)
3. MERGE — cooperate with Mariana (open endings/MERGE)
4. NULL — erase investigative trail (open endings/NULL)
5. CAPTURE — accept the inverted channel (open endings/CAPTURE)

There is no choose command. Opening the file is the act.
`,
                      },
                      'endings': {
                        type: 'dir',
                        children: {
                          'DISCONNECT': {
                            type: 'file',
                            content:
                              'Act: open this file to sever known connections.\nDesfecho: disconnect\n',
                          },
                          'OBSERVER': {
                            type: 'file',
                            content: 'Act: open this file to inherit the watch.\nDesfecho: observer\n',
                          },
                          'MERGE': {
                            type: 'file',
                            content:
                              'Act: open this file to authorize fusion with Mariana.\nDesfecho: merge\n',
                          },
                          'NULL': {
                            type: 'file',
                            content: 'Act: open this file to erase your footprint.\nDesfecho: null\n',
                          },
                          'CAPTURE': {
                            type: 'file',
                            content:
                              'WARNING: inverted channel.\nAct: open this file to accept the link.\nDesfecho: capture\n',
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
      },
    },
  },
  puzzles: [
    {
      id: 'P-081',
      chapter: 'observer',
      title: 'Observer History',
      narrativeGoal: 'Perceber que o histórico do jogador está no mundo',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-073'],
      validators: [{ type: 'flag.set', flag: 'read.player.history' }],
      rewards: [
        { type: 'unlock_flag', flag: 'read.player.history' },
        { type: 'unlock_evidence', evidenceId: 'EV-PLAYER-HISTORY' },
      ],
      evidenceUnlocks: ['EV-PLAYER-HISTORY'],
      hintChain: [
        { level: 'conceptual', text: 'O objeto de estudo inclui o observador.' },
        { level: 'directional', text: 'player_history.log em projects/observer.' },
        { level: 'operational', text: 'cat ~/projects/observer/player_history.log' },
      ],
    },
    {
      id: 'P-090',
      chapter: 'observer',
      title: 'Final Architecture',
      narrativeGoal: 'Escolher um final',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-081'],
      validators: [{ type: 'flag.set', flag: 'ending.chosen' }],
      rewards: [
        { type: 'unlock_flag', flag: 'ending.chosen' },
        { type: 'unlock_chapter', chapter: 'epilogue' },
        { type: 'narrative', event: 'observer.choice' },
      ],
      evidenceUnlocks: ['EV-FINAL-CHOICE'],
      hintChain: [
        { level: 'conceptual', text: 'Não há instrução explícita. Há responsabilidade.' },
        { level: 'directional', text: 'Leia final_architecture.md e use o app Evidence/Vault ou o comando choose.' },
        { level: 'operational', text: 'Abra endings/DISCONNECT|OBSERVER|MERGE|NULL|CAPTURE — abrir é o ato.' },
      ],
    },
  ],
  evidence: [
    {
      id: 'EV-PLAYER-HISTORY',
      kind: 'evidence',
      title: 'Histórico do observador',
      summary: 'Logs do mundo refletem decisões do jogador.',
      chapter: 'observer',
      tags: ['meta'],
    },
    {
      id: 'EV-FINAL-CHOICE',
      kind: 'question',
      title: 'Escolha final',
      summary: 'Disconnect / Observer / Merge / NULL / Capture',
      chapter: 'observer',
      tags: ['ending'],
    },
  ],
  websites: [
    {
      host: 'observer.local',
      title: 'Observer',
      html: `<h1>/8</h1><p>observer</p><p>hello.</p>`,
      headers: { 'X-Abyss-Observer': 'you' },
    },
  ],
  logs: [{ id: 'observer', source: 'meta', lines: ['new observer detected', 'awaiting choice'] }],
});

export const epilogue: ChapterPackage = chapter({
  id: 'epilogue',
  title: 'Epílogo',
  intro: 'observer disconnected → new observer detected → hello.',
  musicTrack: '10_Welcome_Mix',
  puzzles: [
    {
      id: 'P-091',
      chapter: 'epilogue',
      title: 'Closure',
      narrativeGoal: 'Registrar o epílogo',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-090'],
      validators: [{ type: 'flag.set', flag: 'epilogue.seen' }],
      rewards: [
        { type: 'unlock_flag', flag: 'epilogue.seen' },
        { type: 'narrative', event: 'epilogue.complete' },
      ],
      evidenceUnlocks: [],
      hintChain: [
        { level: 'conceptual', text: 'O ciclo continua.' },
        { level: 'directional', text: 'Abra o Vault ou execute: epilogue' },
        { level: 'operational', text: 'Comando: epilogue' },
      ],
    },
  ],
  evidence: [],
  websites: [],
  logs: [
    {
      id: 'epilogue',
      source: 'ending',
      lines: ['observer disconnected', 'new observer detected', 'hello.'],
    },
  ],
});
