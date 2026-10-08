import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Percent, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { AffixInput, Field, Input, Segmented, Select, Switch, Textarea } from '@/components/ui/form';
import { Banner, Card, EmptyState, ListSkeleton, MobileAction, Sheet } from '@/components/ui/surfaces';
import { dataErrorMessage, GLOSSARY } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { dec } from '@/domain/finance';
import { formatMoney, formatPercent } from '@/lib/format';
import { fractionToPercentInput, numberToInput } from '@/lib/number-input';
import { queryKeys } from '@/lib/query-keys';
import { deleteVariableCost, listProductOptions, listVariableCosts, saveVariableCost, setVariableCostActive } from './api';
import { ActiveToggle } from './fixed-costs-section';
import {
  toVariableCostPayload,
  VARIABLE_COST_CATEGORIES,
  variableCostFormSchema,
  type VariableCostFormValues,
  type VariableCostRow,
  type VariableKind,
} from './schemas';

/** "6,39 % · en el 70 % de las ventas · 2 productos" */
function describe(c: VariableCostRow, currency: string): string {
  const parts: string[] = [];
  const pct = dec(c.percent_of_sale);
  const amt = dec(c.amount_per_unit);
  if (pct.gt(0)) parts.push(`${formatPercent(pct)} del precio`);
  if (amt.gt(0)) parts.push(`${formatMoney(amt, currency)} por unidad`);
  const share = dec(c.share_of_sales);
  if (share.lt(1)) parts.push(`en el ${formatPercent(share)} de las ventas`);
  parts.push(c.applies_to === 'all' ? 'todos los productos' : `${c.variable_cost_products.length} producto${c.variable_cost_products.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

export function VariableCostsSection() {
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<VariableCostRow | 'new' | null>(null);
  const costs = useQuery({ queryKey: queryKeys.variableCosts(business.id), queryFn: () => listVariableCosts(business.id) });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setVariableCostActive(id, active),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.variableCosts(business.id) }),
  });

  const addButton = <Button size="lg" block onClick={() => setEditing('new')}><Plus /> Agregar costo de venta</Button>;

  return (
    <>
      <p className="mb-4 text-[13px] leading-snug text-muted">{GLOSSARY.variableCosts}</p>

      {costs.isPending ? (
        <ListSkeleton />
      ) : costs.isError ? (
        <Banner tone="warning">{dataErrorMessage(costs.error)}</Banner>
      ) : costs.data.length === 0 ? (
        <EmptyState icon={<Percent />} title="Sin costos de venta" action={<div className="hidden md:block">{addButton}</div>}>
          Por ejemplo: Mercado Pago 6,39 %, MercadoLibre 15 %, Ingresos Brutos o una bolsa de $300 por venta.
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
                      <p className="text-[13px] leading-snug text-muted">{describe(c, business.currency)}{!c.is_active && ' · pausado'}</p>
                    </div>
                    <ChevronRight className="size-4 text-muted" aria-hidden />
                  </button>
                  <ActiveToggle active={c.is_active} onChange={(active) => toggle.mutate({ id: c.id, active })} label={c.name} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 hidden md:block md:w-72">{costs.data?.length ? addButton : null}</div>
      <MobileAction>{addButton}</MobileAction>

      <VariableCostSheet key={editing === 'new' ? 'new' : editing?.id ?? 'closed'} cost={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </>
  );
}

function kindOf(c: VariableCostRow): VariableKind {
  const pct = dec(c.percent_of_sale).gt(0);
  const amt = dec(c.amount_per_unit).gt(0);
  return pct && amt ? 'both' : amt ? 'amount' : 'percent';
}

function VariableCostSheet({ cost, open, onClose }: { cost: VariableCostRow | null; open: boolean; onClose: () => void }) {
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const products = useQuery({ queryKey: queryKeys.productOptions(business.id), queryFn: () => listProductOptions(business.id), enabled: open });

  const form = useForm<VariableCostFormValues>({
    resolver: zodResolver(variableCostFormSchema),
    defaultValues: cost
      ? {
          name: cost.name,
          category: cost.category,
          kind: kindOf(cost),
          percent: dec(cost.percent_of_sale).gt(0) ? fractionToPercentInput(cost.percent_of_sale) : '',
          amount: dec(cost.amount_per_unit).gt(0) ? numberToInput(cost.amount_per_unit) : '',
          appliesTo: cost.applies_to,
          productIds: cost.variable_cost_products.map((p) => p.product_id),
          allSales: dec(cost.share_of_sales).eq(1),
          sharePercent: dec(cost.share_of_sales).lt(1) ? fractionToPercentInput(cost.share_of_sales) : '',
          notes: cost.notes ?? '',
        }
      : { name: '', category: 'payment_fee', kind: 'percent', percent: '', amount: '', appliesTo: 'all', productIds: [], allSales: true, sharePercent: '', notes: '' },
  });
  const [kind, appliesTo, allSales] = useWatch({ control: form.control, name: ['kind', 'appliesTo', 'allSales'] });
  const errors = form.formState.errors;
  const done = async () => { await queryClient.invalidateQueries({ queryKey: queryKeys.variableCosts(business.id) }); onClose(); };

  const save = useMutation({
    mutationFn: (v: VariableCostFormValues) => saveVariableCost(business.id, cost?.id ?? null, toVariableCostPayload(v)),
    onSuccess: done,
    onError: (e) => setServerError(dataErrorMessage(e)),
  });
  const remove = useMutation({ mutationFn: () => deleteVariableCost(cost!.id), onSuccess: done, onError: (e) => setServerError(dataErrorMessage(e)) });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={cost ? 'Editar costo de venta' : 'Nuevo costo de venta'}
      footer={<Button size="lg" block loading={save.isPending} onClick={form.handleSubmit((v) => { setServerError(null); save.mutate(v); })}>Guardar</Button>}
    >
      <form className="space-y-5" noValidate onSubmit={(e) => e.preventDefault()}>
        {serverError && <Banner tone="warning">{serverError}</Banner>}
        <Field label="Nombre" error={errors.name?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} placeholder="Ej.: Mercado Pago" aria-invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <Field label="Tipo">
          {(id) => (
            <Select id={id} {...form.register('category')}>
              {VARIABLE_COST_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          )}
        </Field>

        <div className="space-y-3">
          <p className="text-sm font-medium">¿Cómo se cobra?</p>
          <Controller
            control={form.control}
            name="kind"
            render={({ field }) => (
              <Segmented<VariableKind>
                ariaLabel="Cómo se cobra"
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: 'percent', label: '% del precio' },
                  { value: 'amount', label: '$ por unidad' },
                  { value: 'both', label: 'Ambos' },
                ]}
              />
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            {kind !== 'amount' && (
              <Field label="Porcentaje" error={errors.percent?.message}>
                {(id, d) => <AffixInput id={id} aria-describedby={d} suffix="%" placeholder="6,39" aria-invalid={!!errors.percent} {...form.register('percent')} />}
              </Field>
            )}
            {kind !== 'percent' && (
              <Field label="Monto por unidad" error={errors.amount?.message}>
                {(id, d) => <AffixInput id={id} aria-describedby={d} prefix="$" placeholder="300" aria-invalid={!!errors.amount} {...form.register('amount')} />}
              </Field>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">¿A qué productos se aplica?</p>
          <Controller
            control={form.control}
            name="appliesTo"
            render={({ field }) => (
              <Segmented<'all' | 'selected'>
                ariaLabel="A qué productos se aplica"
                value={field.value}
                onChange={field.onChange}
                options={[{ value: 'all', label: 'A todos' }, { value: 'selected', label: 'A algunos' }]}
              />
            )}
          />
          {appliesTo === 'selected' && (
            <Controller
              control={form.control}
              name="productIds"
              render={({ field }) => (
                <div>
                  {products.isPending ? (
                    <p className="text-sm text-muted">Cargando productos…</p>
                  ) : (products.data ?? []).length === 0 ? (
                    <Banner>Todavía no tenés productos. Podés dejarlo en "A todos" y cambiarlo después.</Banner>
                  ) : (
                    <ul className="divide-y divide-line rounded-xl border border-line">
                      {products.data!.map((p) => {
                        const checked = field.value.includes(p.id);
                        return (
                          <li key={p.id}>
                            <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                              <input
                                type="checkbox"
                                className="size-5 accent-brand-600"
                                checked={checked}
                                onChange={() => field.onChange(checked ? field.value.filter((x) => x !== p.id) : [...field.value, p.id])}
                              />
                              <span className="text-sm">{p.name}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {errors.productIds?.message && <p role="alert" className="mt-1.5 text-[13px] font-medium text-negative">{errors.productIds.message}</p>}
                </div>
              )}
            />
          )}
        </div>

        <div className="space-y-3">
          <Controller
            control={form.control}
            name="allSales"
            render={({ field }) => (
              <Switch checked={field.value} onChange={field.onChange} label="Se aplica a todas las ventas" description={GLOSSARY.shareOfSales} />
            )}
          />
          {!allSales && (
            <Field label="¿En qué parte de las ventas?" hint="Ej.: si el 60 % de tus ventas pasa por MercadoLibre, poné 60." error={errors.sharePercent?.message}>
              {(id, d) => <AffixInput id={id} aria-describedby={d} suffix="%" placeholder="60" aria-invalid={!!errors.sharePercent} {...form.register('sharePercent')} />}
            </Field>
          )}
        </div>

        <Field label="Notas (opcional)" error={errors.notes?.message}>
          {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} {...form.register('notes')} />}
        </Field>

        {cost && (
          <div className="border-t border-line pt-4">
            <Button variant="danger" size="sm" loading={remove.isPending} onClick={() => { if (window.confirm(`¿Eliminar "${cost.name}"?`)) remove.mutate(); }}>
              <Trash2 /> Eliminar
            </Button>
          </div>
        )}
      </form>
    </Sheet>
  );
}
