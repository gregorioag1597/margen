import { useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { useAuth } from '@/features/auth/auth-provider';
import { LoginPage, OnboardingPage, SignupPage } from '@/features/auth/pages';
import { useBusinesses } from '@/features/business/business-provider';
import { enterDemoMode, isDemoMode } from '@/lib/demo-mode';
import { AppLayout } from './app-layout';
import { FullScreenError, FullScreenLoader } from './screens';

function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/ingresar" replace />;
  return <Outlet />;
}

function RedirectIfAuthed() {
  const { session, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}

function RequireBusiness() {
  const { session } = useAuth();
  const { current, loading, error } = useBusinesses();
  if (loading) return <FullScreenLoader />;
  if (error) return <FullScreenError error={error} />;
  if (!current) return <OnboardingPage pending={session?.user.user_metadata?.pending_business} />;
  return <AppLayout />;
}

/** /demo: enlace para compartir que abre la demo pública. */
function EnterDemo() {
  useEffect(() => {
    if (!isDemoMode()) enterDemoMode();
  }, []);
  return isDemoMode() ? <Navigate to="/" replace /> : <FullScreenLoader />;
}

// Cada sección se descarga recién cuando se abre: la primera carga es más liviana.
export const router = createBrowserRouter([
  {
    HydrateFallback: FullScreenLoader,
    children: [
      { path: '/demo', element: <EnterDemo /> },
      {
        element: <RedirectIfAuthed />,
        children: [
          { path: '/ingresar', element: <LoginPage /> },
          { path: '/registro', element: <SignupPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <RequireBusiness />,
            children: [
              { index: true, lazy: async () => ({ Component: (await import('@/features/dashboard/dashboard-page')).DashboardPage }) },
              { path: 'movimientos', lazy: async () => ({ Component: (await import('@/features/movements/movements-page')).MovementsPage }) },
              { path: 'productos', lazy: async () => ({ Component: (await import('@/features/products/products-page')).ProductsPage }) },
              { path: 'productos/:productId', lazy: async () => ({ Component: (await import('@/features/products/product-detail-page')).ProductDetailPage }) },
              { path: 'insumos', lazy: async () => ({ Component: (await import('@/features/ingredients/ingredients-page')).IngredientsPage }) },
              { path: 'costos', lazy: async () => ({ Component: (await import('@/features/costs/costs-page')).CostsPage }) },
              { path: 'simulador', lazy: async () => ({ Component: (await import('@/features/simulator/simulator-page')).SimulatorPage }) },
              { path: 'configuracion', lazy: async () => ({ Component: (await import('@/features/settings/settings-page')).SettingsPage }) },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
