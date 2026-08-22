import type { ChapterPackage, VfsNode } from '@abyss/shared';

/** Shared base home that chapters merge into */
export const baseHomeVfs: VfsNode = {
  type: 'dir',
  children: {
    home: {
      type: 'dir',
      children: {
        null: {
          type: 'dir',
          children: {
            Desktop: {
              type: 'dir',
              children: {
                'README.txt': {
                  type: 'file',
                  content:
                    'Máquina apreendida — Case #ABYSS-3301\nOperador: INVESTIGATOR\nStatus: QUARANTINE\nNão conectar a redes externas.\n',
                },
                'notes.md': {
                  type: 'file',
                  content:
                    '# Notas\n\nAlgo está errado com a contagem de arquivos.\nO explorador gráfico não mostra tudo.\n',
                },
              },
            },
            Documents: {
              type: 'dir',
              children: {
                'inventory.json': {
                  type: 'file',
                  content: JSON.stringify(
                    {
                      case: 'ABYSS-3301',
                      subject: 'NULL',
                      files_reported: 330,
                      warning: 'GUI inventory may diverge from filesystem truth',
                    },
                    null,
                    2,
                  ),
                },
              },
            },
            projects: {
              type: 'dir',
              children: {},
            },
            '.config': {
              type: 'dir',
              children: {
                'session.env': {
                  type: 'file',
                  content: 'USER=null\nSHELL=/bin/bash\nTERM=xterm-256color\n',
                },
              },
            },
          },
        },
      },
    },
    var: {
      type: 'dir',
      children: {
        log: {
          type: 'dir',
          children: {
            'syslog': {
              type: 'file',
              content:
                'Aug 21 02:11:01 null-machine kernel: quarantine mode engaged\nAug 21 02:11:04 null-machine abyss: investigator session opened\n',
            },
          },
        },
      },
    },
    tmp: { type: 'dir', children: {} },
    etc: {
      type: 'dir',
      children: {
        hostname: { type: 'file', content: 'null-machine\n' },
        issue: {
          type: 'file',
          content: 'PROJECT ABYSS — Isolated Investigation Environment\n',
        },
      },
    },
  },
};

export function mergeVfs(base: VfsNode, overlay: VfsNode): VfsNode {
  if (base.type !== 'dir' || overlay.type !== 'dir') return overlay;
  const children: Record<string, VfsNode> = { ...(base.children ?? {}) };
  for (const [name, node] of Object.entries(overlay.children ?? {})) {
    if (children[name] && children[name].type === 'dir' && node.type === 'dir') {
      children[name] = mergeVfs(children[name], node);
    } else {
      children[name] = node;
    }
  }
  return { type: 'dir', children };
}
