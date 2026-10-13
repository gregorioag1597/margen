import { Check, ChevronsUpDown, Plus, Store } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Badge, Sheet } from '@/components/ui/surfaces';
import { cn } from '@/lib/utils';
import { BUSINESS_TYPES } from './constants';
import { useBusinesses, useCurrentBusiness } from './business-provider';
import { BusinessSheet } from './business-sheet';

export const businessTypeLabel = (value: string) => BUSINESS_TYPES.find((t) => t.value === value)?.label ?? value;

/**
 * Nombre del negocio activo; al tocarlo se elige otro o se agrega uno nuevo.
 * Cada negocio se ve siempre por separado.
 */
export function BusinessSwitcher({ className, align = 'left' }: { className?: string; align?: 'left' | 'right' }) {
  const business = useCurrentBusiness();
  const { businesses, setCurrentId } = useBusinesses();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const choose = (id: string) => {
    setOpen(false);
    if (id !== business.id) {
      setCurrentId(id);
      navigate('/');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Negocio: ${business.name}. Cambiar de negocio`}
        className={cn('flex min-w-0 items-center gap-1.5 rounded-xl px-2 py-1 hover:bg-canvas', align === 'right' && 'flex-row-reverse text-right', className)}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{business.name}</span>
          {business.is_demo && <Badge tone="low">Datos de prueba</Badge>}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Tus negocios"
        footer={
          <Button size="lg" block variant="secondary" onClick={() => { setOpen(false); setCreating(true); }}>
            <Plus /> Agregar negocio
          </Button>
        }
      >
        <ul className="space-y-2" aria-label="Elegí un negocio">
          {businesses.map((b) => {
            const active = b.id === business.id;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => choose(b.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border p-4 text-left',
                    active ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-canvas',
                  )}
                >
                  <Store className="size-5 shrink-0 text-brand-600" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{b.name}</span>
                    <span className="block text-[13px] text-muted">
                      {businessTypeLabel(b.business_type)} · {b.currency}
                    </span>
                  </span>
                  {b.is_demo && <Badge tone="low">Prueba</Badge>}
                  {active && <Check className="size-5 text-brand-600" aria-label="Activo" />}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>

      {creating && <BusinessSheet business={null} open onClose={() => setCreating(false)} />}
    </>
  );
}
