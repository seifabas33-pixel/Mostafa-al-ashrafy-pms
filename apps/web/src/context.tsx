import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, errorMessage } from './api';
import type { Me, Property } from './types';

/* ---------- Toasts ---------- */

export type ToastKind = 'info' | 'success' | 'error';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind) => void;
  error: (err: unknown) => void;
  dismiss: (id: number) => void;
  /** Run an async action, toasting the error (and an optional success message). Resolves to undefined on failure. */
  run: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>;
}

const ToastContext = createContext<ToastApi | null>(null);
let toastSeq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = toastSeq++;
      setToasts((t) => [...t.slice(-4), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000);
    },
    [dismiss],
  );
  const error = useCallback((err: unknown) => push(errorMessage(err), 'error'), [push]);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string) => {
      try {
        const r = await fn();
        if (success) push(success, 'success');
        return r;
      } catch (e) {
        error(e);
        return undefined;
      }
    },
    [push, error],
  );
  const value = useMemo(() => ({ toasts, push, error, dismiss, run }), [toasts, push, error, dismiss, run]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

/* ---------- Session / active property ---------- */

const PROPERTY_STORAGE = 'pms.propertyId';

interface Session {
  me: Me | null;
  loading: boolean;
  error: string | null;
  property: Property | null;
  properties: Property[];
  setPropertyId: (id: string) => void;
  reload: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [propertyId, setPropertyIdState] = useState<string>(() => {
    try {
      return localStorage.getItem(PROPERTY_STORAGE) ?? '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Me>('/api/me')
      .then((m) => {
        if (cancelled) return;
        setMe(m);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setMe(null);
        setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const properties = useMemo(() => {
    const list = me?.properties ? [...me.properties] : [];
    // Hurghada resort first: it carries the richest seeded data.
    return list.sort((a, b) => a.code.localeCompare(b.code)).sort((a, b) => Number(b.code === 'HRG') - Number(a.code === 'HRG'));
  }, [me]);

  const property = useMemo(() => properties.find((p) => p.id === propertyId) ?? properties[0] ?? null, [properties, propertyId]);

  const setPropertyId = useCallback((id: string) => {
    setPropertyIdState(id);
    try {
      localStorage.setItem(PROPERTY_STORAGE, id);
    } catch {
      /* ignore */
    }
  }, []);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const value = useMemo<Session>(() => ({ me, loading, error, property, properties, setPropertyId, reload }), [me, loading, error, property, properties, setPropertyId, reload]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}

/** Active property; pages under the property layout can assume it exists. */
export function useProperty(): Property {
  const { property } = useSession();
  if (!property) throw new Error('No active property');
  return property;
}
