import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus, Receipt, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { AffixInput, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, Banner, Card, EmptyState, ListSkeleton, MobileAction, Sheet } from '@/components/ui/surfaces';
import { dataErrorMessage, GLOSSARY } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { dec, sum } from '@/domain/finance';
import { formatMoney } from '@/lib/format';
import { numberToInput } from '@/lib/number-input';
import { queryKeys } from '@/lib/query-keys';
import { deleteFixedCost, listFixedCosts, saveFixedCost, setFixedCostActive } from './api';
import { FIXED_COST_CATEGORIES, fixedCostFormSchema, toFixedCostPayload, type FixedCostFormValues, type FixedCostRow } from './schemas';

const categoryLabel = (c: FixedCostRow['category']) => FIXED_COST_CATEGORIES.find((x) => x.value === c)?.label ?? c;

export function FixedCostsSection() {
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<FixedCostRow | 'new' | null>(null);
  const costs = useQuery({ queryKey: queryKeys.fixedCosts(business.id), queryFn: () => listFixedCosts(business.id) });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setFixedCostActive(id, active),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.fixedCosts(business.id) }),
  });

  const total = sum((costs.data ?? []).filter((c) => c.is_active).map((c) => dec(c.monthly_amount)));
  const addButton = <Button size="lg" block onClick={() => setEditing('new')}><Plus /> Agregar costo fijo</Button>;

  return (
    <>
      <Card className="mb-4 p-5">
        <p className="text-sm text-muted">Costos fijos mensuales</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight tabular">{formatMoney(total, business.currency)}</p>
        <p className="mt-2 text-[13px] leading-snug text-muted">{GLOSSARY.fixedCosts}</p>
      </Card>

      {costs.isPending ? (
        <ListSkeleton />
      ) : costs.isError ? (
        <Banner tone="warning">{dataErrorMessage(costs.error)}</Banner>
      ) : costs.data.length === 0 ? (
        <EmptyState icon={<Receipt />} title="Sin costos fijos" action={<div className="hidden md:block">{addButton}</div>}>
          Sumá alquiler, contador, internet, publicidad… Lo que pagás todos los meses.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {costs.data.map((c) => (
            <li key={c.id}>
              <Card className={c.is_active ? '' : 'opacity-60'}>
                <div className="flex items-center gap-3 p-4">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setEditing(c)}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-[13px] text-muted">{categoryLabel(c.category)}{!c.is_active && ' · pausado'}</p>
                    </div>
                    <p className="font-semibold tabular">{formatMoney(c.monthly_amount, business.currency)}</p>
                    <ChevronRight className="size-4 text-muted" aria-hidden />
                  </button>
                  <ActiveToggle active={c.is_active} onChange={(active) => toggle.mutate({ id: c.id, active })} label={c.name} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 hidden md:block md:w-64">{costs.data?.length ? addButton : null}</div>
      <MobileAction>{addButton}</MobileAction>

      <FixedCostSheet key={editing === 'new' ? 'new' : editing?.id ?? 'closed'} cost={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </>
  );
}

export function ActiveToggle({ active, onChange, label }: { active: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${active ? 'Pausar' : 'Activar'} ${label}`}
      onClick={() => onChange(!active)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${active ? 'bg-brand-600' : 'bg-line'}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function FixedCostSheet({ cost, open, onClose }: { cost: FixedCostRow | null; open: boolean; onClose: () => void }) {
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FixedCostFormValues>({
    resolver: zodResolver(fixedCostFormSchema),
    defaultValues: cost
      ? { name: cost.name, category: cost.category, monthlyAmount: numberToInput(cost.monthly_amount), notes: cost.notes ?? '' }
      : { name: '', category: 'rent', monthlyAmount: '', notes: '' },
  });
  const errors = form.formState.errors;
  const done = async () => { await queryClient.invalidateQueries({ queryKey: queryKeys.fixedCosts(business.id) }); onClose(); };

  const save = useMutation({
    mutationFn: (v: FixedCostFormValues) => saveFixedCost(business.id, cost?.id ?? null, toFixedCostPayload(v)),
    onSuccess: done,
    onError: (e) => setServerError(dataErrorMessage(e)),
  });
  const remove = useMutation({ mutationFn: () => deleteFixedCost(cost!.id), onSuccess: done, onError: (e) => setServerError(dataErrorMessage(e)) });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={cost ? 'Editar costo fijo' : 'Nuevo costo fijo'}
      footer={<Button size="lg" block loading={save.isPending} onClick={form.handleSubmit((v) => { setServerError(null); save.mutate(v); })}>Guardar</Button>}
    >
      <form className="space-y-4" noValidate onSubmit={(e) => e.preventDefault()}>
        {serverError && <Banner tone="warning">{serverError}</Banner>}
        <Field label="Nombre" error={errors.name?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} placeholder="Ej.: Alquiler del local" aria-invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <Field label="Categoría">
          {(id) => (
            <Select id={id} {...form.register('category')}>
              {FIXED_COST_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Importe mensual" error={errors.monthlyAmount?.message}>
          {(id, d) => <AffixInput id={id} aria-describedby={d} prefix="$" placeholder="450.000" aria-invalid={!!errors.monthlyAmount} {...form.register('monthlyAmount')} />}
        </Field>
        {form.watch('category') === 'salaries' && (
          <Banner>Si ese sueldo es de quien hace los productos y además cargás mano de obra en cada producto, podrías estar contándolo dos veces.</Banner>
        )}
        <Field label="Notas (opcional)" error={errors.notes?.message}>
          {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} {...form.register('notes')} />}
        </Field>
        {cost && (
          <div className="border-t border-line pt-4">
            <Button variant="danger" size="sm" loading={remove.isPending} onClick={() => { if (window.confirm(`¿Eliminar "${cost.name}"?`)) remove.mutate(); }}>
              <Trash2 /> Eliminar
            </Button>
            {!cost.is_active && <span className="ml-3"><Badge>Pausado</Badge></span>}
          </div>
        )}
      </form>
    </Sheet>
  );
}
