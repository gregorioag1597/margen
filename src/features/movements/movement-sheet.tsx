import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { AffixInput, Field, Input, Segmented, Select, Textarea } from '@/components/ui/form';
import { Banner, Sheet } from '@/components/ui/surfaces';
import { dataErrorMessage } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { listProductOptions } from '@/features/costs/api';
import { todayISO } from '@/domain/finance';
import { numberToInput } from '@/lib/number-input';
import { invalidateBusinessData, queryKeys } from '@/lib/query-keys';
import { deleteMovement, saveMovement } from './api';
import {
  categoriesFor,
  movementFormSchema,
  PAYMENT_METHODS,
  toMovementPayload,
  type MovementFormValues,
  type MovementKind,
  type MovementRow,
} from './schemas';

interface Props {
  movement: MovementRow | null;
  /** Tipo inicial al crear (desde la pestaña Ingresos/Egresos). */
  initialKind: MovementKind;
  open: boolean;
  onClose: () => void;
}

export function MovementSheet({ movement, initialKind, open, onClose }: Props) {
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const isNew = movement === null;

  const products = useQuery({ queryKey: queryKeys.productOptions(business.id), queryFn: () => listProductOptions(business.id), enabled: open });

  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementFormSchema),
    defaultValues: movement
      ? {
          kind: movement.kind,
          occurredOn: movement.occurred_on,
          concept: movement.concept,
          category: movement.category,
          amount: numberToInput(movement.amount),
          productId: movement.product_id ?? '',
          paymentMethod: movement.payment_method ?? '',
          supplier: movement.supplier ?? '',
          notes: movement.notes ?? '',
        }
      : {
          kind: initialKind,
          occurredOn: todayISO(),
          concept: '',
          category: initialKind === 'income' ? 'sale' : '',
          amount: '',
          productId: '',
          paymentMethod: '',
          supplier: '',
          notes: '',
        },
  });
  const kind = useWatch({ control: form.control, name: 'kind' });
  const errors = form.formState.errors;
  const income = kind === 'income';

  const done = async () => { await invalidateBusinessData(queryClient, business.id); onClose(); };
  const save = useMutation({
    mutationFn: (v: MovementFormValues) => saveMovement(business.id, movement?.id ?? null, toMovementPayload(v)),
    onSuccess: done,
    onError: (e) => setServerError(dataErrorMessage(e)),
  });
  const remove = useMutation({ mutationFn: () => deleteMovement(movement!.id), onSuccess: done, onError: (e) => setServerError(dataErrorMessage(e)) });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isNew ? (income ? 'Nuevo ingreso' : 'Nuevo egreso') : income ? 'Editar ingreso' : 'Editar egreso'}
      footer={
        <Button size="lg" block loading={save.isPending} onClick={form.handleSubmit((v) => { setServerError(null); save.mutate(v); })}>
          {income ? 'Guardar ingreso' : 'Guardar egreso'}
        </Button>
      }
    >
      <form className="space-y-4" noValidate onSubmit={(e) => e.preventDefault()}>
        {serverError && <Banner tone="warning">{serverError}</Banner>}

        {isNew && (
          <Controller
            control={form.control}
            name="kind"
            render={({ field }) => (
              <Segmented<MovementKind>
                ariaLabel="Tipo de movimiento"
                value={field.value}
                onChange={(k) => {
                  field.onChange(k);
                  form.setValue('category', k === 'income' ? 'sale' : '');
                }}
                options={[{ value: 'income', label: 'Entró plata' }, { value: 'expense', label: 'Salió plata' }]}
              />
            )}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Importe" error={errors.amount?.message}>
            {(id, d) => <AffixInput id={id} aria-describedby={d} prefix="$" placeholder="25.000" aria-invalid={!!errors.amount} {...form.register('amount')} />}
          </Field>
          <Field label="Fecha" error={errors.occurredOn?.message}>
            {(id, d) => <Input id={id} aria-describedby={d} type="date" max={todayISO()} {...form.register('occurredOn')} />}
          </Field>
        </div>

        <Field label="Concepto" error={errors.concept?.message}>
          {(id, d) => (
            <Input id={id} aria-describedby={d} placeholder={income ? 'Ej.: Ventas del sábado' : 'Ej.: Compra de chocolate'} aria-invalid={!!errors.concept} {...form.register('concept')} />
          )}
        </Field>

        <Field label="Categoría" error={errors.category?.message}>
          {(id, d) => (
            <Select id={id} aria-describedby={d} aria-invalid={!!errors.category} {...form.register('category')}>
              {!income && <option value="" disabled>Elegí una</option>}
              {categoriesFor(kind).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          )}
        </Field>

        {income ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Medio de pago (opcional)">
              {(id) => (
                <Select id={id} {...form.register('paymentMethod')}>
                  <option value="">—</option>
                  {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Producto (opcional)">
              {(id) => (
                <Select id={id} {...form.register('productId')}>
                  <option value="">—</option>
                  {(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              )}
            </Field>
          </div>
        ) : (
          <Field label="Proveedor (opcional)" error={errors.supplier?.message}>
            {(id, d) => <Input id={id} aria-describedby={d} {...form.register('supplier')} />}
          </Field>
        )}

        <Field label="Notas (opcional)" error={errors.notes?.message}>
          {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} {...form.register('notes')} />}
        </Field>

        {!income && isNew && (
          <p className="text-[12px] leading-snug text-muted">
            Registrá acá lo que pagaste de verdad. Los costos fijos que cargaste en Costos son tu plan: no se suman solos como egresos.
          </p>
        )}

        {!isNew && (
          <div className="border-t border-line pt-4">
            <Button
              variant="danger"
              size="sm"
              loading={remove.isPending}
              onClick={() => { if (window.confirm(`¿Eliminar "${movement.concept}"?`)) remove.mutate(); }}
            >
              <Trash2 /> Eliminar
            </Button>
          </div>
        )}
      </form>
    </Sheet>
  );
}
