import { ArrowLeftRight, Calculator, ChevronRight, Home, Menu, Package, Settings, Wallet, Wheat } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Badge, Sheet } from '@/components/ui/surfaces';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { exitDemoMode, isDemoMode } from '@/lib/demo-mode';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { OfflineBanner } from './offline-banner';

/** En mobile la barra inferior muestra estos 4 + "Más" con el resto. */
const PRIMARY = [
  { to: '/', label: 'Resumen', icon: Home, end: true },
  { to: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight },
  { to: '/productos', label: 'Productos', icon: Package },
  { to: '/insumos', label: 'Insumos', icon: Wheat },
] as const;

const SECONDARY = [
  { to: '/costos', label: 'Costos', icon: Wallet, description: 'Fijos, de venta y mano de obra (planificado)' },
  { to: '/simulador', label: 'Simulador', icon: Calculator, description: '¿Qué pasa si cambio precios o costos?' },
  { to: '/configuracion', label: 'Configuración', icon: Settings, description: 'Tu negocio y tu cuenta' },
] as const;

const NAV = [...PRIMARY, ...SECONDARY];

/** Mobile: barra inferior + "Más". Desktop: barra lateral con todo. */
export function AppLayout() {
  const business = useCurrentBusiness();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const inSecondary = SECONDARY.some((n) => location.pathname.startsWith(n.to));

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
        <Logo className="mb-6 px-3" />
        <BusinessLabel name={business.name} isDemo={business.is_demo} className="mb-4 px-3" />
        <nav className="space-y-1" aria-label="Principal">
          {NAV.map(({ to, label, icon: Icon, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={'end' in rest}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-canvas hover:text-ink',
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Header mobile */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
          <div className="min-w-0">
            <Logo />
          </div>
          <div className="flex items-center gap-1">
            <BusinessLabel name={business.name} isDemo={business.is_demo} className="max-w-36 text-right" />
            <NavLink to="/configuracion" aria-label="Configuración" className="rounded-full p-2 text-muted hover:bg-canvas">
              <Settings className="size-5" />
            </NavLink>
          </div>
        </header>

        <OfflineBanner />

        {isDemoMode() && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-brand-900 px-4 py-2 text-center text-[13px] text-white">
            <span>Estás en la demo: los cambios no se guardan.</span>
            <button type="button" onClick={() => exitDemoMode('/registro')} className="font-semibold underline underline-offset-2">
              Crear mi cuenta gratis
            </button>
          </div>
        )}

        <main className="mx-auto w-full max-w-3xl px-4 pt-5 pb-[calc(160px+env(safe-area-inset-bottom))] md:px-8 md:pt-10 md:pb-16">
          <Outlet />
        </main>
      </div>

      {/* Nav inferior mobile */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {PRIMARY.map(({ to, label, icon: Icon, ...rest }) => (
          <NavLink
            key={to}
            to={to}
            end={'end' in rest}
            className={({ isActive }) =>
              cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-muted')
            }
          >
            <Icon className="size-[22px]" aria-hidden />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', inSecondary ? 'text-brand-700' : 'text-muted')}
        >
          <Menu className="size-[22px]" aria-hidden />
          Más
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Más">
        <ul className="space-y-2">
          {SECONDARY.map(({ to, label, icon: Icon, description }) => (
            <li key={to}>
              <Link to={to} onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-xl border border-line p-4 hover:bg-canvas">
                <Icon className="size-5 text-brand-600" aria-hidden />
                <span className="flex-1">
                  <span className="block font-medium">{label}</span>
                  <span className="block text-[13px] text-muted">{description}</span>
                </span>
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

function BusinessLabel({ name, isDemo, className }: { name: string; isDemo: boolean; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="truncate text-sm font-medium">{name}</p>
      {isDemo && <Badge tone="low">Datos de prueba</Badge>}
    </div>
  );
}
