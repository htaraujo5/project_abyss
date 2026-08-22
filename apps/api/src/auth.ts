import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import type { GuestSession, RegisterRequest } from '@abyss/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

export type UserAccount = {
  id: string;
  username: string;
  displayName: string;
  /** nome informado no cadastro (perícia registra quem operou a máquina) */
  fullName?: string;
  email?: string;
  contact?: string;
  salt: string;
  hash: string;
  createdAt: string;
};

let users: UserAccount[] = [];

async function ensure() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    users = JSON.parse(await readFile(USERS_FILE, 'utf8')) as UserAccount[];
  } catch {
    users = [];
    await writeFile(USERS_FILE, '[]');
  }
}

async function persist() {
  await writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString('hex');
}

export async function initAuth() {
  await ensure();
}

export async function registerUser(input: RegisterRequest): Promise<GuestSession> {
  await ensure();
  const u = input.username;
  const email = input.email;
  if (users.some((x) => x.username === u)) throw new Error('usuário já existe');
  if (users.some((x) => x.email === email)) throw new Error('e-mail já cadastrado');
  const salt = randomBytes(16).toString('hex');
  const account: UserAccount = {
    id: nanoid(12),
    username: u,
    displayName: input.fullName.split(/\s+/)[0] || u,
    fullName: input.fullName,
    email,
    salt,
    hash: hashPassword(input.password, salt),
    createdAt: new Date().toISOString(),
  };
  users.push(account);
  await persist();
  return {
    playerId: account.id,
    displayName: account.displayName,
    token: issueToken(account.id),
  };
}

export async function loginUser(username: string, password: string): Promise<GuestSession> {
  await ensure();
  const u = username.trim().toLowerCase();
  const account = users.find((x) => x.username === u);
  if (!account) throw new Error('credenciais inválidas');
  const hash = hashPassword(password, account.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(account.hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('credenciais inválidas');
  }
  return {
    playerId: account.id,
    displayName: account.displayName,
    token: issueToken(account.id),
  };
}

const tokens = new Map<string, string>(); // token -> playerId

function issueToken(playerId: string): string {
  const token = createHash('sha256').update(playerId + randomBytes(16)).digest('hex');
  tokens.set(token, playerId);
  return token;
}

export function resolveAccountToken(token: string | undefined): string | null {
  if (!token) return null;
  return tokens.get(token) ?? null;
}

export function rememberSessionToken(token: string, playerId: string) {
  tokens.set(token, playerId);
}
