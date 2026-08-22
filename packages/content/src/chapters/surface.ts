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
            projects: {
              type: 'dir' as const,
              children: {
                orpheus: {
                  type: 'dir' as const,
                  children: {
                    'README.md': {
                      type: 'file' as const,
                      content: `# ORPHEUS

Pattern correlation toolkit.

Documentação oficial cita commit **331**.
Branch main parece ter parado em **330**.

Se você está lendo isto, continue a divergência.
`,
                    },
                    '.git': {
                      type: 'dir' as const,
                      children: {
                        HEAD: {
                          type: 'file' as const,
                          content: 'ref: refs/heads/main\n',
                        },
                        'refs': {
                          type: 'dir' as const,
                          children: {
                            heads: {
                              type: 'dir' as const,
                              children: {
                                main: {
                                  type: 'file' as const,
                                  content: '0000000000000000000000000000000000000330\n',
                                },
                              },
                            },
                          },
                        },
                        'objects': {
                          type: 'dir' as const,
                          children: {
                            '0000000000000000000000000000000000000330': {
                              type: 'file' as const,
                              content:
                                'commit 330\nparent ...\n\nstop before pattern engine\n',
                            },
                            '0000000000000000000000000000000000000331': {
                              type: 'file' as const,
                              guiHidden: true,
                              content:
                                'commit 331 ORPHAN\n\nfeat: enable ORPHEUS pattern correlation\n\nsubject: The Signal is not noise.\ncontact: 3301@acheron.internal\n',
                            },
                          },
                        },
                        'COMMIT_EDITMSG': {
                          type: 'file' as const,
                          content: 'chore: sync docs to 330\n',
                        },
                      },
                    },
                    'docs': {
                      type: 'dir' as const,
                      children: {
                        'CHANGELOG.md': {
                          type: 'file' as const,
                          content:
                            '# Changelog\n\n## 0.3.30\n- documentation freeze at commit 330\n\n## 0.3.31 (referenced, missing from main)\n- ORPHEUS pattern engine\n',
                        },
                      },
                    },
                    'src': {
                      type: 'dir' as const,
                      children: {
                        'main.js': {
                          type: 'file' as const,
                          content: `// ORPHEUS stub — pattern correlator
const CONFIG = { commits_documented: 331, commits_on_main: 330 };
console.log(JSON.stringify(CONFIG));
`,
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
                'null_profile.txt': {
                  type: 'file' as const,
                  content:
                    'Assunto NULL — perfil preliminar\n\nEngenheiro de sistemas. Interesse em correlação de padrões.\nProjeto recorrente: ORPHEUS.\nPossível vínculo Acheron Systems (não confirmado).\n',
                },
              },
            },
          },
        },
      },
    },
  },
};

export const surface: ChapterPackage = {
  id: 'surface',
  title: 'Surface',
  intro:
    'O arquivo .null aponta para ORPHEUS. Quem era NULL — e o que esse projeto fazia?',
  musicTrack: '01_Caves',
  vfsSeed: mergeVfs(baseHomeVfs, overlay),
  puzzles: [
    {
      id: 'P-006',
      chapter: 'surface',
      title: 'Orphan Commit',
      narrativeGoal: 'Encontrar o commit órfão 331 e revelar ORPHEUS',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-001'],
      validators: [
        { type: 'flag.set', flag: 'found.orpheus' },
        {
          type: 'file.contains',
          path: '/home/null/projects/orpheus/.git/objects/0000000000000000000000000000000000000331',
          text: 'ORPHEUS',
        },
      ],
      rewards: [
        { type: 'unlock_flag', flag: 'found.orpheus' },
        { type: 'unlock_app', app: 'orpheus' },
        { type: 'unlock_evidence', evidenceId: 'EV-ORPHEUS-PROJECT' },
        { type: 'unlock_evidence', evidenceId: 'EV-ORPHAN-331' },
        { type: 'unlock_chapter', chapter: 'deep' },
      ],
      evidenceUnlocks: ['EV-ORPHEUS-PROJECT', 'EV-ORPHAN-331', 'EV-NULL-ENGINEER'],
      hintChain: [
        {
          level: 'conceptual',
          text: 'Documentação e histórico de versão podem divergir de propósito.',
        },
        {
          level: 'directional',
          text: 'Olhe em projects/orpheus — README cita commit 331; a branch main para em 330.',
        },
        {
          level: 'operational',
          text: 'ls projects/orpheus/.git/objects e cat o objeto ...0331',
        },
      ],
    },
    {
      id: 'P-009',
      chapter: 'surface',
      title: 'Profile Residue',
      narrativeGoal: 'Confirmar perfil técnico de NULL',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-001'],
      validators: [{ type: 'flag.set', flag: 'read.null.profile' }],
      rewards: [
        { type: 'unlock_flag', flag: 'read.null.profile' },
        { type: 'unlock_evidence', evidenceId: 'EV-NULL-ENGINEER' },
      ],
      evidenceUnlocks: ['EV-NULL-ENGINEER'],
      hintChain: [
        {
          level: 'conceptual',
          text: 'Perfis residuais em Documents frequentemente sobrevivem a limpezas superficiais.',
        },
        {
          level: 'directional',
          text: 'Há um arquivo de perfil em Documents.',
        },
        {
          level: 'operational',
          text: 'cat ~/Documents/null_profile.txt',
        },
      ],
    },
    {
      id: 'P-010',
      chapter: 'surface',
      title: 'Changelog Gap',
      narrativeGoal: 'Confirmar gap 330/331 no changelog',
      main: true,
      optional: false,
      secret: false,
      prerequisites: ['P-001'],
      validators: [{ type: 'flag.set', flag: 'read.changelog.gap' }],
      rewards: [
        { type: 'unlock_flag', flag: 'read.changelog.gap' },
        { type: 'unlock_evidence', evidenceId: 'EV-CHANGELOG-GAP' },
      ],
      evidenceUnlocks: ['EV-CHANGELOG-GAP'],
      hintChain: [
        {
          level: 'conceptual',
          text: 'Changelogs às vezes documentam o que o código não contém.',
        },
        {
          level: 'directional',
          text: 'docs/CHANGELOG.md dentro de orpheus.',
        },
        {
          level: 'operational',
          text: 'cat ~/projects/orpheus/docs/CHANGELOG.md',
        },
      ],
    },
    {
      id: 'P-011',
      chapter: 'surface',
      title: 'Config Drift',
      narrativeGoal: 'Ver divergência commits_documented vs commits_on_main',
      main: false,
      optional: true,
      secret: false,
      prerequisites: ['P-006'],
      validators: [{ type: 'flag.set', flag: 'ran.orpheus.main' }],
      rewards: [
        { type: 'unlock_flag', flag: 'ran.orpheus.main' },
        { type: 'unlock_evidence', evidenceId: 'EV-CONFIG-DRIFT' },
      ],
      evidenceUnlocks: ['EV-CONFIG-DRIFT'],
      hintChain: [
        {
          level: 'conceptual',
          text: 'Executar o binário/stub pode revelar configuração embutida.',
        },
        {
          level: 'directional',
          text: 'Há um main.js em orpheus/src.',
        },
        {
          level: 'operational',
          text: 'node ~/projects/orpheus/src/main.js',
        },
      ],
    },
  ],
  evidence: [
    {
      id: 'EV-ORPHEUS-PROJECT',
      kind: 'system',
      title: 'Projeto ORPHEUS',
      summary: 'Toolkit de correlação de padrões.',
      chapter: 'surface',
      tags: ['orpheus'],
    },
    {
      id: 'EV-ORPHAN-331',
      kind: 'evidence',
      title: 'Commit órfão 331',
      summary: 'Commit fora da branch main menciona The Signal e 3301@acheron.internal.',
      chapter: 'surface',
      tags: ['git', 'signal'],
    },
    {
      id: 'EV-NULL-ENGINEER',
      kind: 'person',
      title: 'NULL — engenheiro',
      summary: 'Perfil preliminar: engenheiro de sistemas, foco em padrões.',
      chapter: 'surface',
      tags: ['null'],
    },
    {
      id: 'EV-CHANGELOG-GAP',
      kind: 'contradiction',
      title: 'Gap no changelog',
      summary: '0.3.31 referenciado mas ausente da main.',
      chapter: 'surface',
      tags: ['docs'],
    },
    {
      id: 'EV-CONFIG-DRIFT',
      kind: 'evidence',
      title: 'Config drift 331/330',
      summary: 'Stub ORPHEUS expõe commits_documented=331 vs commits_on_main=330.',
      chapter: 'surface',
      tags: ['orpheus'],
    },
  ],
  websites: [
    {
      host: 'orpheus.local',
      title: 'ORPHEUS — local mirror',
      html: `<h1>ORPHEUS</h1><p>Pattern correlation</p><p>docs: commit 331</p><p style="color:#666">mirror incomplete</p>`,
      headers: { 'X-Abyss-Chapter': 'surface', 'X-Abyss-Project': 'ORPHEUS' },
    },
  ],
  logs: [
    {
      id: 'orpheus-build',
      source: 'orpheus',
      lines: [
        'build: main@330 ok',
        'warn: object 331 present but unreachable from HEAD',
        'note: contact field references acheron.internal',
      ],
    },
  ],
};
