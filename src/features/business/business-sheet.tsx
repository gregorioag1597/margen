import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input, Segmented, Select } from '@/components/ui/form';
import { Banner, Sheet } from '@/components/ui/surfaces';
import { dataErrorMessage, GLOSSARY } from '@/copy/messages';
import { createBusiness, deleteBusiness, updateBusiness, type Business } from './api';
import { useBusinesses } from './business-provider';
import { BUSINESS_TYPES, CURRENCIES, type BusinessType } from './constants';

const schema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre.').max(120),
  businessType: z.enum(BUSINESS_TYPES.map((t) => t.value) as [BusinessType, ...BusinessType[]], 'Elegí un tipo de negocio.'),
  currency: z.string().length(3),
  pricesIncludeTaxes: z.enum(['yes', 'no', 'unknown']),
});
type Values = z.infer<typeof schema>;

const taxToForm = (v: boolean | null): Values['pricesIncludeTaxes'] => (v === null ? 'unknown' : v ? 'yes' : 'no');
const taxFromForm = (v: Values['pricesIncludeTaxes']) => (v === 'unknown' ? null : v === 'yes');

/** Normaliza para comparar el nombre al confirmar la eliminación (sin espacios extra ni mayúsculas). */
export const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');

/** Alta, edición y eliminación de un negocio. Cada negocio tiene sus datos totalmente separados. */
export function BusinessSheet({ business, open, onClose }: { business: Business | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { businesses, current, setCurrentId } = useBusinesses();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const isNew = business === null;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: business
      ? { name: business.name, businessType: business.business_type, currency: business.currency, pricesIncludeTaxes: taxToForm(business.prices_include_taxes) }
      : { name: '', businessType: undefined as unknown as BusinessType, currency: current?.currency ?? 'ARS', pricesIncludeTaxes: 'unknown' },
  });
  const errors = form.formState.errors;
  const refreshList = () => queryClient.invalidateQueries({ queryKey: ['businesses'] });

  const save = useMutation({
    mutationFn: async (v: Values) => {
      if (isNew) {
        return createBusiness({ name: v.name, businessType: v.businessType, currency: v.currency, pricesIncludeTaxes: taxFromForm(v.pricesIncludeTaxes) });
      }
      await updateBusiness(business.id, {
        name: v.name,
        business_type: v.businessType,
        currency: v.currency,
        prices_include_taxes: taxFromForm(v.pricesIncludeTaxes),
      });
      return business.id;
    },
    onSuccess: async (id) => {
      await refreshList();
      onClose();
      if (isNew) {
        // El negocio nuevo queda activo y se empieza por los "Primeros pasos".
        setCurrentId(id);
        navigate('/');
      }
    },
    onError: (e) => setServerError(dataErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => deleteBusiness(business!.id),
    onSuccess: async () => {
      const deletedId = business!.id;
      // Si era el activo, pasamos a otro de tus negocios (o al alta de uno nuevo si no queda ninguno).
      if (current?.id === deletedId) {
        const next = businesses.find((b) => b.id !== deletedId);
        if (next) setCurrentId(next.id);
      }
      queryClient.removeQueries({ predicate: (q) => q.queryKey[1] === deletedId });
      await refreshList();
      onClose();
      navigate('/');
    },
    onError: (e) => setServerError(dataErrorMessage(e)),
  });

  if (confirming && business) {
    const matches = sameName(confirmText, business.name);
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Eliminar negocio"
        footer={
          <div className="space-y-2">
            <Button variant="danger" size="lg" block disabled={!matches} loading={remove.isPending} onClick={() => { setServerError(null); remove.mutate(); }}>
              <Trash2 /> Eliminar para siempre
            </Button>
            <Button variant="ghost" size="lg" block onClick={() => { setConfirming(false); setConfirmText(''); }}>Cancelar</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {serverError && <Banner tone="warning">{serverError}</Banner>}
          <Banner tone="warning">
            Vas a borrar <strong>{business.name}</strong> con <strong>todos</strong> sus datos: insumos, productos, costos, movimientos e historiales.
            No se puede deshacer. Tus otros negocios no se tocan.
          </Banner>
          <Field label={`Para confirmar, escribí "${business.name}"`}>
            {(id) => <Input id={id} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />}
          </Field>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isNew ? 'Nuevo negocio' : 'Editar negocio'}
      footer={
        <Button size="lg" block loading={save.isPending} onClick={form.handleSubmit((v) => { setServerError(null); save.mutate(v); })}>
          {isNew ? 'Crear negocio' : 'Guardar cambios'}
        </Button>
      }
    >
      <form className="space-y-4" noValidate onSubmit={(e) => e.preventDefault()}>
        {serverError && <Banner tone="warning">{serverError}</Banner>}
        {isNew && <Banner>Cada negocio tiene sus propios insumos, productos, costos y movimientos. Nunca se mezclan.</Banner>}
        <Field label="Nombre del negocio" error={errors.name?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} placeholder="Ej.: Hamburguesería del centro" aria-invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de negocio" error={errors.businessType?.message}>
            {(id, d) => (
              <Select id={id} aria-describedby={d} defaultValue={business?.business_type ?? ''} aria-invalid={!!errors.businessType} {...form.register('businessType')}>
                <option value="" disabled>Elegí una opción</option>
                {BUSINESS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Moneda principal">
            {(id) => (
              <Select id={id} {...form.register('currency')}>
                {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">¿Tus precios incluyen impuestos?</p>
          <Controller
            control={form.control}
            name="pricesIncludeTaxes"
            render={({ field }) => (
              <Segmented
                ariaLabel="¿Tus precios incluyen impuestos?"
                value={field.value}
                onChange={field.onChange}
                options={[{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'No sé' }]}
              />
            )}
          />
          <p className="text-[13px] text-muted">{GLOSSARY.pricesIncludeTaxes}</p>
        </div>

        {!isNew && (
          <div className="border-t border-line pt-4">
            <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
              <Trash2 /> Eliminar este negocio
            </Button>
          </div>
        )}
      </form>
    </Sheet>
  );
}
