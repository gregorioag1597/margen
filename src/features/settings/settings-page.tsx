import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, FlaskConical, LogOut, Plus, Store } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Badge, Banner, Card, PageHeader } from '@/components/ui/surfaces';
import { dataErrorMessage } from '@/copy/messages';
import { signOut } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-provider';
import { createDemoBusiness, type Business } from '@/features/business/api';
import { useBusinesses, useCurrentBusiness } from '@/features/business/business-provider';
import { BusinessSheet } from '@/features/business/business-sheet';
import { businessTypeLabel } from '@/features/business/business-switcher';
import { exitDemoMode, isDemoMode } from '@/lib/demo-mode';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  return isDemoMode() ? <DemoSettings /> : <AccountSettings />;
}

function DemoSettings() {
  return (
    <>
      <PageHeader title="Configuración" />
      <div className="space-y-6">
        <Card className="space-y-4 p-5">
          <h2 className="flex items-center gap-2 font-semibold"><FlaskConical className="size-5 text-brand-600" /> Estás usando la demo</h2>
          <p className="text-sm text-muted">
            Todo lo que cambies acá queda solo en esta pestaña y se borra al cerrarla. Para cargar tu negocio real, creá una cuenta gratis.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => exitDemoMode('/registro')}>Crear mi cuenta</Button>
            <Button variant="outline" onClick={() => exitDemoMode('/ingresar')}><LogOut /> Salir de la demo</Button>
          </div>
        </Card>
        <BusinessesCard />
      </div>
    </>
  );
}

function AccountSettings() {
  const { businesses, setCurrentId } = useBusinesses();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);

  const demo = useMutation({
    mutationFn: createDemoBusiness,
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['businesses'] });
      setCurrentId(id);
      navigate('/');
    },
    onError: (e) => setMessage(dataErrorMessage(e)),
  });

  const logout = async () => {
    await signOut();
    queryClient.clear();
    navigate('/ingresar', { replace: true });
  };

  return (
    <>
      <PageHeader title="Configuración" />

      <div className="space-y-6">
        <BusinessesCard />

        {!businesses.some((b) => b.is_demo) && (
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><FlaskConical className="size-5 text-brand-600" /> Probar con datos de ejemplo</h2>
            <p className="mt-1 text-sm text-muted">
              Creamos una "Pastelería Demo" aparte, con insumos, costos y productos cargados. Tus datos reales no se tocan.
            </p>
            {message && <div className="mt-3"><Banner tone="warning">{message}</Banner></div>}
            <Button variant="secondary" className="mt-4" loading={demo.isPending} onClick={() => { setMessage(null); demo.mutate(); }}>
              Crear negocio demo
            </Button>
          </Card>
        )}

        <Card className="flex items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-sm text-muted">Sesión iniciada como</p>
            <p className="truncate font-medium">{session?.user.email}</p>
          </div>
          <Button variant="outline" onClick={logout}><LogOut /> Cerrar sesión</Button>
        </Card>
      </div>
    </>
  );
}

/** Lista de negocios: cambiar, editar, agregar y eliminar. Cada uno, siempre por separado. */
function BusinessesCard() {
  const current = useCurrentBusiness();
  const { businesses, setCurrentId } = useBusinesses();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Business | 'new' | null>(null);

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Tus negocios</h2>
        <Button variant="secondary" size="sm" onClick={() => setEditing('new')}><Plus /> Agregar negocio</Button>
      </div>
      <p className="mb-3 text-[13px] text-muted">Cada negocio tiene sus propios datos. La app muestra uno por vez: el que elijas.</p>

      <ul className="space-y-2">
        {businesses.map((b) => {
          const active = b.id === current.id;
          return (
            <li key={b.id} className={cn('flex items-center gap-3 rounded-xl border p-3', active ? 'border-brand-500 bg-brand-50/60' : 'border-line')}>
              <Store className="size-5 shrink-0 text-brand-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="truncate font-medium">{b.name}</span>
                  {b.is_demo && <Badge tone="low">Prueba</Badge>}
                </p>
                <p className="text-[13px] text-muted">{businessTypeLabel(b.business_type)} · {b.currency}</p>
              </div>
              {active ? (
                <span className="flex items-center gap-1 text-[13px] font-medium text-brand-700"><Check className="size-4" /> Activo</span>
              ) : (
                <Button variant="outline" size="sm" onClick={() => { setCurrentId(b.id); navigate('/'); }}>Usar</Button>
              )}
              <button type="button" onClick={() => setEditing(b)} aria-label={`Editar ${b.name}`} className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink">
                <ChevronRight className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>

      {editing && (
        <BusinessSheet
          key={editing === 'new' ? 'new' : editing.id}
          business={editing === 'new' ? null : editing}
          open
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
