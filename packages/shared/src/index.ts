import { z } from 'zod';

export const ChapterIdSchema = z.enum([
  'prologue',
  'surface',
  'deep',
  'dark',
  'charter',
  'mariana',
  'abyss',
  'primarch',
  'observer',
  'epilogue',
]);
export type ChapterId = z.infer<typeof ChapterIdSchema>;

export const CHAPTER_ORDER: ChapterId[] = [
  'prologue',
  'surface',
  'deep',
  'dark',
  'charter',
  'mariana',
  'abyss',
  'primarch',
  'observer',
  'epilogue',
];

export const CHAPTER_META: Record<
  ChapterId,
  { title: string; layer: string; question: string }
> = {
  prologue: {
    title: 'A Máquina',
    layer: 'Prólogo',
    question: 'O que esta máquina esconde?',
  },
  surface: {
    title: 'Surface',
    layer: 'Camada 1',
    question: 'Quem era NULL?',
  },
  deep: {
    title: 'Deep',
    layer: 'Camada 2',
    question: 'O que ORPHEUS buscava?',
  },
  dark: {
    title: 'Dark',
    layer: 'Camada 3',
    question: 'Quem respondeu a ORPHEUS?',
  },
  charter: {
    title: 'Charter',
    layer: 'Camada 4',
    question: 'O que é Acheron?',
  },
  mariana: {
    title: 'Mariana',
    layer: 'Camada 5',
    question: 'Quem modificou o sistema?',
  },
  abyss: {
    title: 'Abyss',
    layer: 'Camada 6',
    question: 'Mariana foi construída?',
  },
  primarch: {
    title: 'Primarch',
    layer: 'Camada 7',
    question: 'Mariana sabe que é observada?',
  },
  observer: {
    title: 'Observer',
    layer: 'Camada 8',
    question: 'Por que a máquina foi deixada?',
  },
  epilogue: {
    title: 'Epílogo',
    layer: 'Fim',
    question: 'O que você faz com o que sabe?',
  },
};

export const EndingIdSchema = z.enum([
  'disconnect',
  'observer',
  'merge',
  'null',
  'capture',
]);
export type EndingId = z.infer<typeof EndingIdSchema>;

export const AppIdSchema = z.enum([
  'terminal',
  'files',
  'code',
  'browser',
  'trace',
  'graph',
  'hex',
  'image-lab',
  'evidence',
  'vault',
  'orpheus',
  'forge',
  'packet',
  'memory',
  'settings',
]);
export type AppId = z.infer<typeof AppIdSchema>;

export const HintLevelSchema = z.enum([
  'conceptual',
  'directional',
  'operational',
]);
export type HintLevel = z.infer<typeof HintLevelSchema>;

export const EvidenceStateSchema = z.enum([
  'unseen',
  'observed',
  'related',
  'confirmed',
  'contradicted',
  'discarded',
]);
export type EvidenceState = z.infer<typeof EvidenceStateSchema>;

export const EvidenceKindSchema = z.enum([
  'evidence',
  'person',
  'system',
  'organization',
  'event',
  'hypothesis',
  'contradiction',
  'question',
]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const ValidatorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('file.exists'), path: z.string() }),
  z.object({
    type: z.literal('file.contains'),
    path: z.string(),
    text: z.string(),
  }),
  z.object({
    type: z.literal('flag.set'),
    flag: z.string(),
  }),
  z.object({
    type: z.literal('evidence.observed'),
    evidenceId: z.string(),
  }),
  z.object({
    type: z.literal('evidence.linked'),
    from: z.string(),
    to: z.string(),
  }),
  z.object({
    type: z.literal('command.output'),
    pattern: z.string(),
  }),
  z.object({
    type: z.literal('json.path'),
    path: z.string(),
    jsonPath: z.string(),
    equals: z.unknown().optional(),
    exists: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('custom'),
    id: z.string(),
  }),
]);
export type Validator = z.infer<typeof ValidatorSchema>;

export const RewardSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('unlock_flag'), flag: z.string() }),
  z.object({ type: z.literal('unlock_chapter'), chapter: ChapterIdSchema }),
  z.object({ type: z.literal('unlock_app'), app: AppIdSchema }),
  z.object({ type: z.literal('unlock_evidence'), evidenceId: z.string() }),
  z.object({ type: z.literal('narrative'), event: z.string() }),
  z.object({ type: z.literal('ending'), ending: EndingIdSchema }),
]);
export type Reward = z.infer<typeof RewardSchema>;

export const HintSchema = z.object({
  level: HintLevelSchema,
  text: z.string(),
  requiresEvidence: z.array(z.string()).optional(),
});
export type Hint = z.infer<typeof HintSchema>;

export const PuzzleDefinitionSchema = z.object({
  id: z.string(),
  chapter: ChapterIdSchema,
  title: z.string(),
  narrativeGoal: z.string(),
  main: z.boolean().default(true),
  optional: z.boolean().default(false),
  secret: z.boolean().default(false),
  prerequisites: z.array(z.string()).default([]),
  validators: z.array(ValidatorSchema),
  rewards: z.array(RewardSchema).default([]),
  evidenceUnlocks: z.array(z.string()).default([]),
  hintChain: z.array(HintSchema).default([]),
  description: z.string().optional(),
  /** Resposta aceita via `submit <id> <answer>` */
  answer: z.string().optional(),
  answerAliases: z.array(z.string()).optional(),
  cluePath: z.string().optional(),
});
export type PuzzleDefinition = z.infer<typeof PuzzleDefinitionSchema>;

export const EvidenceDefinitionSchema = z.object({
  id: z.string(),
  kind: EvidenceKindSchema,
  title: z.string(),
  summary: z.string(),
  chapter: ChapterIdSchema,
  body: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type EvidenceDefinition = z.infer<typeof EvidenceDefinitionSchema>;

export const VfsNodeSchema: z.ZodType<VfsNode> = z.lazy(() =>
  z.object({
    type: z.enum(['file', 'dir']),
    content: z.string().optional(),
    binaryBase64: z.string().optional(),
    hidden: z.boolean().optional(),
    guiHidden: z.boolean().optional(),
    mode: z.string().optional(),
    children: z.record(VfsNodeSchema).optional(),
  }),
);

export type VfsNode = {
  type: 'file' | 'dir';
  content?: string;
  binaryBase64?: string;
  hidden?: boolean;
  /** Shown in terminal but hidden from GUI Files app (or vice versa) */
  guiHidden?: boolean;
  mode?: string;
  children?: Record<string, VfsNode>;
};

export const ChapterPackageSchema = z.object({
  id: ChapterIdSchema,
  title: z.string(),
  intro: z.string(),
  musicTrack: z.string().optional(),
  vfsSeed: VfsNodeSchema,
  puzzles: z.array(PuzzleDefinitionSchema),
  evidence: z.array(EvidenceDefinitionSchema),
  websites: z
    .array(
      z.object({
        host: z.string(),
        title: z.string(),
        html: z.string(),
        headers: z.record(z.string()).optional(),
      }),
    )
    .default([]),
  logs: z
    .array(
      z.object({
        id: z.string(),
        source: z.string(),
        lines: z.array(z.string()),
      }),
    )
    .default([]),
});
export type ChapterPackage = z.infer<typeof ChapterPackageSchema>;

export const PlayerEvidenceSchema = z.object({
  id: z.string(),
  state: EvidenceStateSchema,
  notes: z.string().optional(),
});
export type PlayerEvidence = z.infer<typeof PlayerEvidenceSchema>;

export const EvidenceLinkSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
});
export type EvidenceLink = z.infer<typeof EvidenceLinkSchema>;

export const PuzzleStateSchema = z.object({
  id: z.string(),
  status: z.enum(['locked', 'available', 'completed']),
  hintsUsed: z.number().default(0),
  completedAt: z.string().optional(),
});
export type PuzzleState = z.infer<typeof PuzzleStateSchema>;

export const SaveGameSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  slot: z.number(),
  name: z.string(),
  contentVersion: z.string(),
  currentChapter: ChapterIdSchema,
  flags: z.record(z.boolean()).default({}),
  puzzles: z.record(PuzzleStateSchema).default({}),
  evidence: z.record(PlayerEvidenceSchema).default({}),
  links: z.array(EvidenceLinkSchema).default([]),
  unlockedApps: z.array(AppIdSchema).default([]),
  cwd: z.string().default('/home/null'),
  vfsSnapshot: VfsNodeSchema.optional(),
  ending: EndingIdSchema.optional(),
  /** ISO — quando o capítulo atual começou (timeout de captura). */
  chapterEnteredAt: z.string().optional(),
  narrativeLog: z.array(z.string()).default([]),
  windowLayout: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SaveGame = z.infer<typeof SaveGameSchema>;

export const TerminalExecRequestSchema = z.object({
  saveId: z.string(),
  command: z.string(),
});
export type TerminalExecRequest = z.infer<typeof TerminalExecRequestSchema>;

export const TerminalExecResponseSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  cwd: z.string(),
  exitCode: z.number(),
  events: z.array(z.string()).default([]),
  completedPuzzles: z.array(z.string()).default([]),
  unlockedEvidence: z.array(z.string()).default([]),
  newFlags: z.array(z.string()).default([]),
});
export type TerminalExecResponse = z.infer<typeof TerminalExecResponseSchema>;

export const GuestSessionSchema = z.object({
  playerId: z.string(),
  displayName: z.string(),
  token: z.string(),
});
export type GuestSession = z.infer<typeof GuestSessionSchema>;

export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,18}[a-z0-9])$/i;

export const RegisterRequestSchema = z.object({
  fullName: z.string().trim().min(2, 'nome muito curto').max(80, 'nome muito longo'),
  email: z.string().trim().toLowerCase().email('e-mail inválido'),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_RE, '3-20 caracteres: letras, números, ponto, hífen ou underscore'),
  password: z.string().min(8, 'senha precisa de 8+ caracteres').max(200),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'informe o usuário'),
  password: z.string().min(1, 'informe a senha'),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const CONTENT_VERSION = '1.0.0';

export const DEFAULT_UNLOCKED_APPS: AppId[] = [
  'terminal',
  'files',
  'browser',
  'evidence',
  'settings',
];

/** Apps liberados por marco de capítulo (além de rewards pontuais nos puzzles). */
export const CHAPTER_APP_UNLOCKS: Partial<Record<ChapterId, AppId[]>> = {
  prologue: ['terminal', 'files', 'browser', 'evidence', 'settings'],
  surface: ['code', 'hex', 'vault'],
  deep: ['trace', 'graph', 'forge'],
  dark: ['packet', 'image-lab'],
  charter: ['memory'],
  mariana: ['orpheus'],
  abyss: [],
  primarch: [],
  observer: [],
  epilogue: [],
};
