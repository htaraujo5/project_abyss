import type { VfsNode } from '@abyss/shared';

export function cloneVfs(node: VfsNode): VfsNode {
  return JSON.parse(JSON.stringify(node)) as VfsNode;
}

export function resolvePath(cwd: string, input: string): string {
  const raw = input.startsWith('/') ? input : `${cwd}/${input}`;
  const parts = raw.split('/').filter(Boolean);
  const stack: string[] = [];
  for (const p of parts) {
    if (p === '.') continue;
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  return '/' + stack.join('/');
}

export function getNode(root: VfsNode, path: string): VfsNode | null {
  if (path === '/' || path === '') return root;
  const parts = path.split('/').filter(Boolean);
  let cur: VfsNode = root;
  for (const part of parts) {
    if (cur.type !== 'dir' || !cur.children?.[part]) return null;
    cur = cur.children[part];
  }
  return cur;
}

export function ensureDir(root: VfsNode, path: string): VfsNode {
  const parts = path.split('/').filter(Boolean);
  let cur = root;
  if (cur.type !== 'dir') throw new Error('root not dir');
  cur.children ??= {};
  for (const part of parts) {
    if (!cur.children[part]) {
      cur.children[part] = { type: 'dir', children: {} };
    }
    cur = cur.children[part];
    if (cur.type !== 'dir') throw new Error('not a directory: ' + part);
    cur.children ??= {};
  }
  return cur;
}

export function writeFile(root: VfsNode, path: string, content: string): void {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();
  if (!name) throw new Error('invalid path');
  const parentPath = '/' + parts.join('/');
  const parent = parts.length ? ensureDir(root, parentPath) : root;
  if (parent.type !== 'dir') throw new Error('parent not dir');
  parent.children ??= {};
  parent.children[name] = { type: 'file', content };
}

export type DirEntry = {
  name: string;
  type: 'file' | 'dir';
  hidden?: boolean;
  size: number;
  items?: number;
};

export function listDir(
  root: VfsNode,
  path: string,
  opts: { all?: boolean; gui?: boolean } = {},
): DirEntry[] {
  const node = getNode(root, path);
  if (!node || node.type !== 'dir') return [];
  const entries: DirEntry[] = [];
  for (const [name, child] of Object.entries(node.children ?? {})) {
    const isDot = name.startsWith('.');
    if (opts.gui) {
      if (child.guiHidden) continue;
      if (isDot) continue;
    } else if (!opts.all && isDot) {
      continue;
    }
    entries.push({
      name,
      type: child.type,
      hidden: isDot || !!child.guiHidden,
      size: child.type === 'file' ? (child.content ?? '').length : 0,
      items: child.type === 'dir' ? Object.keys(child.children ?? {}).length : undefined,
    });
  }
  return entries.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1,
  );
}

export function readFile(root: VfsNode, path: string): string | null {
  const node = getNode(root, path);
  if (!node || node.type !== 'file') return null;
  return node.content ?? '';
}

export function pathExists(root: VfsNode, path: string): boolean {
  return getNode(root, path) !== null;
}

export function fileContains(root: VfsNode, path: string, text: string): boolean {
  const c = readFile(root, path);
  return c !== null && c.includes(text);
}

/** Flatten for GUI inventory count tricks */
export function countVisibleGuiFiles(root: VfsNode, path = '/'): number {
  let count = 0;
  const node = getNode(root, path);
  if (!node) return 0;
  if (node.type === 'file') {
    return node.guiHidden ? 0 : 1;
  }
  for (const [name, child] of Object.entries(node.children ?? {})) {
    if (child.guiHidden) continue;
    if (name.startsWith('.') && child.guiHidden !== false) continue;
    if (child.type === 'file') count += 1;
    else count += countVisibleGuiFiles(child, path);
  }
  return count;
}

export function parentOf(path: string): { parent: string; name: string } {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop() ?? '';
  return { parent: '/' + parts.join('/'), name };
}

export function removeNode(root: VfsNode, path: string): boolean {
  const { parent, name } = parentOf(path);
  if (!name) return false;
  const p = getNode(root, parent);
  if (!p || p.type !== 'dir' || !p.children?.[name]) return false;
  delete p.children[name];
  return true;
}

export function putNode(root: VfsNode, path: string, node: VfsNode): boolean {
  const { parent, name } = parentOf(path);
  if (!name) return false;
  const p = ensureDir(root, parent);
  if (p.type !== 'dir') return false;
  p.children ??= {};
  p.children[name] = node;
  return true;
}

export function writeBinary(root: VfsNode, path: string, data: Buffer): void {
  putNode(root, path, { type: 'file', binaryBase64: data.toString('base64') });
}

/** Bytes de um arquivo: usa `binaryBase64` quando existir, senão o texto. */
export function readBytes(root: VfsNode, path: string): Buffer | null {
  const node = getNode(root, path);
  if (!node || node.type !== 'file') return null;
  if (node.binaryBase64 != null) return Buffer.from(node.binaryBase64, 'base64');
  return Buffer.from(node.content ?? '', 'utf8');
}

export function isBinary(root: VfsNode, path: string): boolean {
  const node = getNode(root, path);
  return !!node && node.type === 'file' && node.binaryBase64 != null;
}

export function nodeSize(node: VfsNode): number {
  if (node.type === 'dir') return 4096;
  if (node.binaryBase64 != null) return Buffer.from(node.binaryBase64, 'base64').length;
  return Buffer.byteLength(node.content ?? '', 'utf8');
}

/** Modo efetivo (permissões) de um nó, com padrão coerente por tipo. */
export function nodeMode(node: VfsNode, name = ''): string {
  if (node.mode) return node.mode;
  if (node.type === 'dir') return 'drwxr-xr-x';
  if (/\.(sh|py|out|bin|elf)$/.test(name)) return '-rwxr-xr-x';
  return '-rw-r--r--';
}

/**
 * Timestamp determinístico por caminho: o VFS não guarda mtime, mas comandos
 * como `ls -l`, `stat` e `find -newer` precisam de valores estáveis.
 */
export function nodeMtime(path: string, node: VfsNode): Date {
  let h = 2166136261;
  const seed = path + ':' + nodeSize(node);
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // janela de ~18 meses terminando em 2031-03-01 (época interna do jogo)
  const end = Date.UTC(2031, 2, 1);
  return new Date(end - (h % (560 * 24 * 3600 * 1000)));
}

export function copyNode(node: VfsNode): VfsNode {
  return cloneVfs(node);
}

/** Expande um glob (com barras) contra o VFS, retornando caminhos absolutos. */
export function globPaths(
  root: VfsNode,
  cwd: string,
  pattern: string,
  matcher: (glob: string) => RegExp,
  opts: { all?: boolean } = {},
): string[] {
  const absolute = pattern.startsWith('/');
  const base = absolute ? '/' : cwd;
  const segments = pattern.split('/').filter((s, i) => !(i === 0 && s === ''));
  let current = [base];
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    const next: string[] = [];
    for (const dir of current) {
      if (seg === '..') {
        next.push(resolvePath(dir, '..'));
        continue;
      }
      if (!/[*?[]/.test(seg)) {
        const p = resolvePath(dir, seg);
        if (pathExists(root, p)) next.push(p);
        continue;
      }
      const node = getNode(root, dir);
      if (!node || node.type !== 'dir') continue;
      const re = matcher(seg);
      for (const name of Object.keys(node.children ?? {}).sort()) {
        if (name.startsWith('.') && !seg.startsWith('.') && !opts.all) continue;
        if (re.test(name)) next.push(resolvePath(dir, name));
      }
    }
    current = next;
    if (!current.length) return [];
  }
  return current;
}

export function walkFiles(
  root: VfsNode,
  path = '',
  out: { path: string; node: VfsNode }[] = [],
): { path: string; node: VfsNode }[] {
  if (root.type === 'file') {
    out.push({ path: path || '/', node: root });
    return out;
  }
  for (const [name, child] of Object.entries(root.children ?? {})) {
    const p = `${path}/${name}`.replace(/\/+/g, '/');
    if (child.type === 'file') out.push({ path: p, node: child });
    else walkFiles(child, p, out);
  }
  return out;
}
