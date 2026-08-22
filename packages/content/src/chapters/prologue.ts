import type { ChapterPackage } from '@abyss/shared';
import { mergeVfs, baseHomeVfs } from '../vfs.js';

const overlay = {
  type: 'dir' as const,
  children: {
    home: {
      type: 'dir' as const,
      children: {
        null: {
          type: 'dir' as const,
          children: {
            '.null': {
              type: 'file' as const,
              guiHidden: true,
              content:
                'DO NOT CONNECT TO MARIANA\n\nIf you are reading this, the quarantine failed\nor someone authorized deeper access.\n\n— N\n\nkey: observer.seed=0\nref: ORPHEUS/README\n',
            },
            '.bash_history': {
              type: 'file' as const,
              guiHidden: true,
              content:
                'ls -la\ncat Documents/inventory.json\ngit -C projects/orpheus log --oneline\n# don\'t connect\n',
            },
            Desktop: {
              type: 'dir' as const,
              children: {
                'CASE_BRIEF.txt': {
                  type: 'file' as const,
                  content:
                    'CASE BRIEF — ABYSS-3301\n\nSujeito: NULL (identidade não confirmada)\nMáquina apreendida em estado de quarantine.\nObjetivo inicial: análise forense local.\n\nObservação do analista anterior:\n"A GUI mente. Confie no shell."\n',
                },
              },
            },
          },
        },
      },
    },
  },
};

export const prologue: ChapterPackage = {
  id: 'prologue',
  title: 'A Máquina',
  intro:
    'Você recebeu acesso à máquina apreendida associada a NULL. Quarentena ativa. Sem rede externa. Observe. Não confie na interface.',
  musicTrack: '10_Welcome_Mix',
  vfsSeed: mergeVfs(baseHomeVfs, overlay),
  puzzles: [
    {
      id: 'P-001',
      chapter: 'prologue',
      title: 'Hidden File',
      narrativeGoal: 'Descobrir o arquivo oculto .null',
      main: true,
      optional: false,
      secret: false,
      prerequisites: [],
      validators: [
        { type: 'file.exists', path: '/home/null/.null' },
        { type: 'flag.set', flag: 'found.null' },
      ],
      rewards: [
        { type: 'unlock_flag', flag: 'found.null' },
        { type: 'unlock_evidence', evidenceId: 'EV-NULL-DOTFILE' },
        { type: 'unlock_evidence', evidenceId: 'EV-WARNING-MARIANA' },
        { type: 'unlock_chapter', chapter: 'surface' },
        { type: 'narrative', event: 'prologue.complete' },
      ],
      evidenceUnlocks: ['EV-NULL-DOTFILE', 'EV-WARNING-MARIANA', 'EV-GUI-DIVERGENCE'],
      hintChain: [
        {
          level: 'conceptual',
          text: 'Inventários gráficos e listagens de sistema nem sempre concordam.',
        },
        {
          level: 'directional',
          text: 'Compare o que o Files mostra em /home/null com o que o Terminal lista com ls -la.',
        },
        {
          level: 'operational',
          text: 'Execute: ls -la /home/null  e então cat /home/null/.null',
        },
      ],
      description:
        'A GUI reporta 330 arquivos. O shell revela divergência. Encontre o que está escondido.',
    },
  ],
  evidence: [
    {
      id: 'EV-GUI-DIVERGENCE',
      kind: 'contradiction',
      title: 'Divergência GUI × Shell',
      summary: 'O explorador gráfico omite entradas que o terminal lista.',
      chapter: 'prologue',
      body: 'inventory.json afirma files_reported=330. ls -la mostra artefatos adicionais.',
      tags: ['forensics', 'unix'],
    },
    {
      id: 'EV-NULL-DOTFILE',
      kind: 'evidence',
      title: 'Arquivo .null',
      summary: 'Dotfile oculto no home do sujeito.',
      chapter: 'prologue',
      body: 'Contém aviso: DO NOT CONNECT TO MARIANA. Referência a ORPHEUS.',
      tags: ['null', 'warning'],
    },
    {
      id: 'EV-WARNING-MARIANA',
      kind: 'question',
      title: 'O que é Mariana?',
      summary: 'Aviso explícito contra conexão com Mariana.',
      chapter: 'prologue',
      tags: ['mariana'],
    },
  ],
  websites: [
    {
      host: 'case.local',
      title: 'ABYSS Case Portal',
      html: `<h1>CASE #ABYSS-3301</h1><p>Sujeito: NULL</p><p>Status: QUARANTINE</p><p>Nota: inventário GUI pode estar incompleto.</p>`,
      headers: { 'X-Abyss-Chapter': 'prologue', 'X-Abyss-Files': '330' },
    },
  ],
  logs: [
    {
      id: 'boot',
      source: 'quarantine',
      lines: [
        '[quarantine] session started',
        '[quarantine] external egress DENY',
        '[forensics] gui_inventory=330',
        '[forensics] hint: trust the shell',
      ],
    },
  ],
};
