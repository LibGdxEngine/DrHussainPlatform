const pending = new Map<string, Promise<unknown>>();
const loaderIds = new WeakMap<object, number>();
let nextLoaderId = 0;

/** A stable key part for a loader function, so two loaders never share a request. */
export function loaderKey(loader: object): string {
  let id = loaderIds.get(loader);
  if (id === undefined) loaderIds.set(loader, (id = ++nextLoaderId));
  return `loader${id}`;
}

/**
 * Runs `start` unless the same key is already running, in which case both callers share one request.
 * React strict mode runs every effect twice in development; without this each run would reach the
 * server and the audit log would record every view twice. Once the request settles the key is free,
 * so a later reload fetches again.
 */
export function inFlight<T>(key: string, start: () => Promise<T>): Promise<T> {
  const running = pending.get(key) as Promise<T> | undefined;
  if (running) return running;
  const request = start();
  pending.set(key, request);
  const clear = () => {
    if (pending.get(key) === request) pending.delete(key);
  };
  request.then(clear, clear);
  return request;
}
