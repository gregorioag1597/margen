import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from '@/app/router';
import { SetupScreen } from '@/app/screens';
import { AuthProvider } from '@/features/auth/auth-provider';
import { BusinessProvider } from '@/features/business/business-provider';
import { isDemoMode } from '@/lib/demo-mode';
import { isSupabaseConfigured } from '@/lib/supabase';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

// La demo pública funciona aunque falte la configuración de Supabase.
const canRun = isSupabaseConfigured || isDemoMode();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {canRun ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BusinessProvider>
            <RouterProvider router={router} />
          </BusinessProvider>
        </AuthProvider>
      </QueryClientProvider>
    ) : (
      <SetupScreen />
    )}
  </StrictMode>,
);
