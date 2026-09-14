import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
}

/**
 * Small data-loading hook. `fetcher` is re-run whenever `deps` change; while a
 * background refresh runs the previous data stays visible (`refreshing`).
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[], opts: { refreshMs?: number; enabled?: boolean } = {}): AsyncState<T> {
  const enabled = opts.enabled ?? true;
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const hasData = useRef(false);
  const lastKey = useRef<string | null>(null);
  const depsKey = JSON.stringify(deps);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    // A change in deps is a fresh query (clear stale data); a reload/interval tick is a background refresh.
    const fresh = lastKey.current !== depsKey;
    lastKey.current = depsKey;
    if (fresh) {
      hasData.current = false;
      setDataState(null);
      setError(null);
    }
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    let cancelled = false;
    fetcherRef
      .current()
      .then((d) => {
        if (cancelled || id !== seq.current) return;
        hasData.current = true;
        setDataState(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled || id !== seq.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (cancelled || id !== seq.current) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick, enabled, depsKey]);

  useEffect(() => {
    if (!opts.refreshMs || !enabled) return;
    const h = setInterval(() => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1);
    }, opts.refreshMs);
    return () => clearInterval(h);
  }, [opts.refreshMs, enabled]);

  const setData = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | null) => T | null)(prev) : updater));
  }, []);

  return { data, error, loading, refreshing, reload, setData };
}

function readStored<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? initial : (JSON.parse(raw) as T);
  } catch {
    return initial;
  }
}

/**
 * Local-storage backed state. The key may change at runtime (several callers scope it by
 * property id), so the stored value is re-read whenever it does; otherwise switching
 * property would keep showing, and submitting, the previous property's setting.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, initial));
  const initialRef = useRef(initial);
  const firstKey = useRef(key);
  useEffect(() => {
    if (key === firstKey.current) return; // already loaded by the initialiser
    firstKey.current = key;
    setValue(readStored(key, initialRef.current));
  }, [key]);
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [key],
  );
  return [value, set];
}

/** Tracks an in-flight action; returns [busy, run]. */
export function useBusy(): [boolean, <T>(fn: () => Promise<T>) => Promise<T | undefined>] {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);
  return [busy, run];
}
