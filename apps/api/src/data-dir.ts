import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Diretório persistente de usuários / saves / sessões.
 * Em Docker: monte um volume em ABYSS_DATA_DIR (ex.: /app/apps/data).
 * Sem env, cai no apps/data relativo ao pacote api.
 */
export function dataDir(): string {
  if (process.env.ABYSS_DATA_DIR?.trim()) {
    return path.resolve(process.env.ABYSS_DATA_DIR.trim());
  }
  return path.resolve(__dirname, '../../data');
}
