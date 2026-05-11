const locks = new Map<string, Map<string, Promise<unknown>>>();

function namespace(name: string): Map<string, Promise<unknown>> {
  let n = locks.get(name);
  if (!n) {
    n = new Map();
    locks.set(name, n);
  }
  return n;
}

export function createKeyLock(name: string) {
  const map = namespace(name);
  return function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = map.get(key) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    map.set(
      key,
      next.catch(() => {}),
    );
    return next;
  };
}
