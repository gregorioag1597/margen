import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isDemoMode } from '@/lib/demo-mode';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
}

/** Sesión ficticia de la demo pública: nunca llega a Supabase. */
const DEMO_SESSION = {
  user: { id: 'demo-user', email: 'demo@margen.app', user_metadata: {} },
} as unknown as Session;

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const demo = isDemoMode();
  const [state, setState] = useState<AuthState>(demo ? { session: DEMO_SESSION, loading: false } : { session: null, loading: true });

  useEffect(() => {
    if (demo) return;
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, [demo]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
