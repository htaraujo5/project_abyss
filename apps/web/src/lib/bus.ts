type Events = {
  /** executa um comando no terminal ativo */
  exec: { command: string };
  /** save foi atualizado por qualquer ferramenta */
  'save-updated': { source: string };
  /** foca uma evidência no Evidence Board */
  'focus-evidence': { id: string };
  /** som curto de UI */
  ui: { sound: 'click' | 'notify' | 'error' | 'open' };
};

type Handler<K extends keyof Events> = (payload: Events[K]) => void;
type AnyHandler = (payload: never) => void;

const handlers = new Map<keyof Events, Set<AnyHandler>>();

export function on<K extends keyof Events>(event: K, fn: Handler<K>): () => void {
  let set = handlers.get(event);
  if (!set) {
    set = new Set();
    handlers.set(event, set);
  }
  set.add(fn as AnyHandler);
  return () => {
    set?.delete(fn as AnyHandler);
  };
}

export function emit<K extends keyof Events>(event: K, payload: Events[K]): void {
  for (const fn of handlers.get(event) ?? []) {
    (fn as Handler<K>)(payload);
  }
}
