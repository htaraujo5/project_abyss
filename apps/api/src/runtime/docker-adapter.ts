/**
 * Docker Unix adapter stub — same interface as VfsShell for future real containers.
 * Activated when ABYSS_SANDBOX=docker and Docker is available.
 */
export type SandboxAdapter = {
  exec(command: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    cwd: string;
    events: string[];
  }>;
  snapshot(): unknown;
  restore(snapshot: unknown, cwd?: string): void;
};

export class DockerUnixAdapter implements SandboxAdapter {
  constructor(private readonly _sessionId: string) {}

  async exec(command: string) {
    return {
      stdout: '',
      stderr:
        'Docker adapter não ativo neste ambiente. Use ABYSS_SANDBOX=vfs (padrão).\n' +
        `Comando ignorado: ${command}\n`,
      exitCode: 1,
      cwd: '/home/null',
      events: [],
    };
  }

  snapshot() {
    return null;
  }

  restore() {
    /* no-op */
  }
}

export function sandboxMode(): 'vfs' | 'docker' {
  return process.env.ABYSS_SANDBOX === 'docker' ? 'docker' : 'vfs';
}
