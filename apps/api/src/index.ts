import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { chapters, allPuzzles, allEvidence, getChapter } from '@abyss/content';
import {
  CHAPTER_META,
  CHAPTER_ORDER,
  LoginRequestSchema,
  RegisterRequestSchema,
  type ChapterId,
} from '@abyss/shared';
import {
  initStore,
  createGuest,
  putSession,
  getSession,
  createSave,
  loadSave,
  listSaves,
  execCommand,
  observePath,
  forceTrapCapture,
  resetSaveProgress,
  updateSavePartial,
  getShell,
  writeSave,
} from './store.js';
import { hintFor, evaluateAll } from './runtime/engine.js';
import { listDir, readFile, getNode, walkFiles } from './runtime/vfs.js';
import { sandboxMode } from './runtime/docker-adapter.js';
import {
  buildTrace,
  buildPackets,
  buildMemory,
  buildOrpheus,
} from './runtime/telemetry.js';
import { initAuth, registerUser, loginUser } from './auth.js';
import { camadaCHeaders } from './runtime/camada-c.js';

const PORT = Number(process.env.PORT ?? 8787);

async function main() {
  await initStore();
  await initAuth();
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/api')) {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('Referrer-Policy', 'no-referrer');
    }

    const path = req.url.split('?')[0];
    const saveRoute = /^\/api\/saves\/([^/]+)/.exec(path);
    if (saveRoute) {
      const session = getSession(bearer(req.headers.authorization));
      if (session) {
        const save = await loadSave(saveRoute[1]);
        if (save && save.playerId === session.playerId) {
          for (const [key, value] of Object.entries(camadaCHeaders(save))) {
            reply.header(key, value);
          }
        }
      }
    }
  });

  app.get('/api/health', async () => ({
    ok: true,
    sandbox: sandboxMode(),
    contentChapters: CHAPTER_ORDER.length,
    puzzles: allPuzzles().length,
    evidence: allEvidence().length,
  }));

  app.post<{ Body: { displayName?: string } }>('/api/auth/guest', async (req) => {
    return createGuest(req.body?.displayName);
  });

  app.post('/api/auth/register', async (req, reply) => {
    const parsed = RegisterRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return reply.code(400).send({
        error: `${issue.path.join('.') || 'campo'}: ${issue.message}`,
        field: issue.path[0],
      });
    }
    try {
      const session = await registerUser(parsed.data);
      await putSession(session);
      return session;
    } catch (e) {
      return reply.code(409).send({ error: message(e) });
    }
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = LoginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message });
    }
    try {
      const session = await loginUser(parsed.data.username, parsed.data.password);
      await putSession(session);
      return session;
    } catch (e) {
      return reply.code(401).send({ error: message(e) });
    }
  });

  app.get('/api/meta/chapters', async () => ({
    order: CHAPTER_ORDER,
    meta: CHAPTER_META,
  }));

  app.get('/api/meta/puzzles', async () => ({
    puzzles: allPuzzles().map((p) => ({
      id: p.id,
      chapter: p.chapter,
      title: p.title,
      narrativeGoal: p.narrativeGoal,
      main: p.main,
      optional: p.optional,
      secret: p.secret,
      prerequisites: p.prerequisites,
      evidenceUnlocks: p.evidenceUnlocks,
      description: p.description,
      cluePath: p.cluePath,
      hintLevels: p.hintChain.map((h) => h.level),
      acceptsSubmit: !!(p.answer || (p.answerAliases && p.answerAliases.length)),
      // NÃO vazar: answer, answerAliases, validators, hintChain.text
    })),
  }));
  app.get('/api/meta/evidence', async () => ({ evidence: allEvidence() }));
  app.get<{ Params: { id: string } }>('/api/meta/chapters/:id', async (req, reply) => {
    const ch = chapters[req.params.id as keyof typeof chapters];
    if (!ch) return reply.code(404).send({ error: 'not found' });
    const { vfsSeed: _v, ...rest } = ch;
    return rest;
  });

  app.get('/api/saves', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    return { saves: await listSaves(session.playerId) };
  });

  app.post<{ Body: { name?: string; slot?: number } }>('/api/saves', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await createSave(session.playerId, req.body?.name, req.body?.slot ?? 1);
    return { save: publicSave(save) };
  });

  app.get<{ Params: { id: string } }>('/api/saves/:id', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    return { save: publicSave(save) };
  });

  app.post<{
    Params: { id: string };
    Body: { command: string };
  }>('/api/saves/:id/exec', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    try {
      const result = await execCommand(req.params.id, req.body.command ?? '');
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        cwd: result.cwd,
        events: result.events,
        completedPuzzles: result.completedPuzzles,
        unlockedEvidence: result.unlockedEvidence,
        newFlags: result.newFlags,
        narrative: result.narrative,
        ending: result.ending,
        save: publicSave(result.save),
      };
    } catch (e) {
      return reply.code(400).send({ error: String(e) });
    }
  });

  app.get<{
    Params: { id: string };
    Querystring: { path?: string; mode?: string };
  }>('/api/saves/:id/fs', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    const shell = getShell(save.id);
    const root = shell?.snapshot() ?? save.vfsSnapshot!;
    const fsPath = req.query.path ?? '/home/null';
    const gui = req.query.mode !== 'shell';
    const node = getNode(root, fsPath);
    if (!node) return reply.code(404).send({ error: 'path not found' });
    if (node.type === 'file') {
      const content = gui && node.guiHidden ? null : readFile(root, fsPath);
      let observed: Awaited<ReturnType<typeof observePath>> | null = null;
      try {
        observed = await observePath(req.params.id, fsPath);
      } catch {
        observed = null;
      }
      return {
        type: 'file',
        path: fsPath,
        content,
        size: (node.content ?? '').length,
        hidden: !!node.guiHidden,
        ending: observed?.ending,
        completedPuzzles: observed?.completedPuzzles ?? [],
        unlockedEvidence: observed?.unlockedEvidence ?? [],
        newFlags: observed?.newFlags ?? [],
        narrative: observed?.narrative ?? [],
        save: observed ? publicSave(observed.save) : publicSave(save),
      };
    }
    return {
      type: 'dir',
      path: fsPath,
      entries: listDir(root, fsPath, { gui, all: !gui }),
    };
  });

  // telemetria das ferramentas forenses (Trace, Packet, Memory, ORPHEUS)
  app.get<{ Params: { id: string } }>('/api/saves/:id/telemetry', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    const narrative: { source: string; lines: string[] }[] = [];
    for (const cid of CHAPTER_ORDER) {
      if (!save.flags[`chapter.${cid}`] && cid !== save.currentChapter) continue;
      for (const l of getChapter(cid as ChapterId).logs) {
        narrative.push({ source: l.source, lines: l.lines });
      }
    }
    return {
      chapter: save.currentChapter,
      trace: buildTrace(save.id, save.currentChapter, narrative),
      packets: buildPackets(save.id, save.currentChapter),
      memory: buildMemory(save.id, save.currentChapter),
      orpheus: buildOrpheus(save.id, save.currentChapter),
    };
  });

  // busca global: arquivos, conteúdo, evidências e puzzles (UI/UX doc §UX "busca global")
  app.get<{
    Params: { id: string };
    Querystring: { q?: string };
  }>('/api/saves/:id/search', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    const q = (req.query.q ?? '').trim().toLowerCase();
    if (q.length < 2) return { files: [], evidence: [], puzzles: [] };
    const shell = getShell(save.id);
    const root = shell?.snapshot() ?? save.vfsSnapshot!;
    const files: { path: string; line?: number; excerpt?: string }[] = [];
    for (const { path, node } of walkFiles(root)) {
      if (node.guiHidden) continue;
      if (path.toLowerCase().includes(q)) {
        files.push({ path });
      } else {
        const lines = (node.content ?? '').split('\n');
        const idx = lines.findIndex((l) => l.toLowerCase().includes(q));
        if (idx >= 0) files.push({ path, line: idx + 1, excerpt: lines[idx].trim().slice(0, 160) });
      }
      if (files.length >= 60) break;
    }
    const evidence = allEvidence()
      .filter(
        (e) =>
          save.evidence[e.id] &&
          (e.title.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q)),
      )
      .slice(0, 20)
      .map((e) => ({ id: e.id, title: e.title, kind: e.kind }));
    const puzzles = allPuzzles()
      .filter(
        (p) =>
          save.puzzles[p.id] &&
          (p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)),
      )
      .slice(0, 20)
      .map((p) => ({ id: p.id, title: p.title, status: save.puzzles[p.id]?.status ?? 'locked' }));
    return { files, evidence, puzzles };
  });

  // estado persistente de UI por save (UI/UX doc §UX "estados persistentes por save")
  app.patch<{
    Params: { id: string };
    Body: { ui: Record<string, unknown> };
  }>('/api/saves/:id/ui', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    save.windowLayout = { ...(save.windowLayout ?? {}), ...(req.body?.ui ?? {}) };
    await writeSave(save);
    return { ok: true };
  });

  app.post<{
    Params: { id: string };
    Body: { puzzleId: string };
  }>('/api/saves/:id/hint', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    const hint = hintFor(save, req.body.puzzleId);
    await writeSave(save);
    return hint;
  });

  app.post<{
    Params: { id: string };
    Body: { from: string; to: string; label?: string };
  }>('/api/saves/:id/links', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    const link = {
      id: `${req.body.from}-${req.body.to}-${Date.now()}`,
      from: req.body.from,
      to: req.body.to,
      label: req.body.label,
    };
    save.links.push(link);
    if (save.evidence[req.body.from]) save.evidence[req.body.from].state = 'related';
    if (save.evidence[req.body.to]) save.evidence[req.body.to].state = 'related';
    evaluateAll(save, save.vfsSnapshot!);
    await writeSave(save);
    return { link, save: publicSave(save) };
  });

  app.delete<{ Params: { id: string; linkId: string } }>(
    '/api/saves/:id/links/:linkId',
    async (req, reply) => {
      const session = getSession(bearer(req.headers.authorization));
      if (!session) return reply.code(401).send({ error: 'unauthorized' });
      const save = await loadSave(req.params.id);
      if (!save || save.playerId !== session.playerId) {
        return reply.code(404).send({ error: 'not found' });
      }
      save.links = save.links.filter((l) => l.id !== req.params.linkId);
      await writeSave(save);
      return { save: publicSave(save) };
    },
  );

  // anotações e estado analítico das evidências (hipóteses coexistentes)
  app.patch<{
    Params: { id: string; evidenceId: string };
    Body: { notes?: string; state?: 'observed' | 'related' | 'confirmed' | 'contradicted' | 'discarded' };
  }>('/api/saves/:id/evidence/:evidenceId', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    const entry = save.evidence[req.params.evidenceId];
    if (!entry) return reply.code(404).send({ error: 'evidence not collected' });
    if (req.body.notes != null) entry.notes = req.body.notes.slice(0, 4000);
    if (req.body.state) entry.state = req.body.state;
    evaluateAll(save, save.vfsSnapshot!);
    await writeSave(save);
    return { save: publicSave(save) };
  });

  app.get<{ Params: { id: string } }>('/api/saves/:id/chapter', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    const ch = getChapter(save.currentChapter);
    return {
      id: ch.id,
      title: ch.title,
      intro: ch.intro,
      musicTrack: ch.musicTrack,
      websites: ch.websites,
      logs: ch.logs,
      puzzles: ch.puzzles.map((p) => ({
        id: p.id,
        title: p.title,
        status: save.puzzles[p.id]?.status ?? 'locked',
      })),
    };
  });

  app.post<{
    Params: { id: string };
    Body: { ending: 'disconnect' | 'observer' | 'merge' | 'null' | 'capture' };
  }>('/api/saves/:id/ending', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const result = await execCommand(req.params.id, `choose ${req.body.ending}`);
    return { save: publicSave(result.save), ending: result.ending, narrative: result.narrative };
  });

  app.post<{
    Params: { id: string };
    Body: { reason?: string };
  }>('/api/saves/:id/trap-capture', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    const result = await forceTrapCapture(req.params.id, req.body?.reason ?? 'unknown');
    return {
      save: publicSave(result.save),
      ending: result.ending,
      narrative: result.narrative,
      completedPuzzles: result.completedPuzzles,
      unlockedEvidence: result.unlockedEvidence,
      newFlags: result.newFlags,
    };
  });

  app.post<{ Params: { id: string } }>('/api/saves/:id/reset', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    const next = await resetSaveProgress(req.params.id);
    return { save: publicSave(next) };
  });

  app.get<{
    Params: { id: string; host: string };
  }>('/api/saves/:id/browse/:host', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    const ch = getChapter(save.currentChapter);
    // search all unlocked chapters
    let site = ch.websites.find((w) => w.host === req.params.host);
    if (!site) {
      for (const id of CHAPTER_ORDER) {
        if (!save.flags[`chapter.${id}`] && id !== save.currentChapter) continue;
        const found = getChapter(id).websites.find((w) => w.host === req.params.host);
        if (found) {
          site = found;
          break;
        }
      }
    }
    if (!site) return reply.code(404).send({ error: 'site not found' });
    return site;
  });

  app.get<{ Params: { id: string } }>('/api/saves/:id/logs', async (req, reply) => {
    const session = getSession(bearer(req.headers.authorization));
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const save = await loadSave(req.params.id);
    if (!save || save.playerId !== session.playerId) {
      return reply.code(404).send({ error: 'not found' });
    }
    const logs = [];
    for (const cid of CHAPTER_ORDER) {
      if (!save.flags[`chapter.${cid}`] && cid !== save.currentChapter) continue;
      logs.push(...getChapter(cid as ChapterId).logs);
    }
    return { logs };
  });

  // WebSocket terminal duplex
  app.get('/ws/terminal', { websocket: true }, (socket, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token') ?? '';
    const saveId = url.searchParams.get('saveId') ?? '';
    const session = getSession(token);
    if (!session) {
      socket.close();
      return;
    }
    socket.send(JSON.stringify({ type: 'ready', cwd: '/home/null' }));
    socket.on('message', async (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type: string; command?: string };
        if (msg.type === 'exec' && msg.command != null) {
          const save = await loadSave(saveId);
          if (!save || save.playerId !== session.playerId) {
            socket.send(JSON.stringify({ type: 'error', error: 'save' }));
            return;
          }
          const result = await execCommand(saveId, msg.command);
          socket.send(
            JSON.stringify({
              type: 'result',
              ...result,
              save: publicSave(result.save),
            }),
          );
        }
      } catch (e) {
        socket.send(JSON.stringify({ type: 'error', error: String(e) }));
      }
    });
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`ABYSS API on http://localhost:${PORT} (sandbox=${sandboxMode()})`);
}

function bearer(h?: string) {
  if (!h) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1];
}

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function publicSave(save: Awaited<ReturnType<typeof loadSave>>) {
  if (!save) return null;
  const { vfsSnapshot: _v, ...rest } = save;
  return rest;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
