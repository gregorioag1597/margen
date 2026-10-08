import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { listBusinesses, type Business } from './api';

const STORAGE_KEY = 'margen.currentBusinessId';

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

interface BusinessState {
  businesses: Business[];
  current: Business | null;
  setCurrentId: (id: string) => void;
  loading: boolean;
  error: unknown;
}

const BusinessContext = createContext<BusinessState | null>(null);

export const businessesQueryKey = (userId: string | undefined) => ['businesses', userId] as const;

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [storedId, setStoredId] = useState<string | null>(readStoredId);

  const query = useQuery({
    queryKey: businessesQueryKey(userId),
    queryFn: listBusinesses,
    enabled: Boolean(userId),
  });

  const businesses = useMemo(() => query.data ?? [], [query.data]);
  // Por defecto: el último elegido; si no, el primer negocio real (no demo).
  const current =
    businesses.find((b) => b.id === storedId) ?? businesses.find((b) => !b.is_demo) ?? businesses[0] ?? null;

  const setCurrentId = useCallback((id: string) => {
    setStoredId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Sin almacenamiento: la elección dura solo esta sesión.
    }
  }, []);

  return (
    <BusinessContext.Provider
      value={{ businesses, current, setCurrentId, loading: query.isPending && Boolean(userId), error: query.error }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusinesses(): BusinessState {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusinesses fuera de BusinessProvider');
  return ctx;
}

/** Negocio activo. Solo usar dentro de rutas protegidas por RequireBusiness. */
export function useCurrentBusiness(): Business {
  const { current } = useBusinesses();
  if (!current) throw new Error('No hay negocio activo');
  return current;
}
