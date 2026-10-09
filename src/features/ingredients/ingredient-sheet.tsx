import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, History, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { AffixInput, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Banner, Card, Sheet } from '@/components/ui/surfaces';
import { dataErrorMessage, GLOSSARY } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { useBusinessModel } from '@/features/business/use-business-model';
import { dec } from '@/domain/finance';
import { formatDate, formatMoney, formatNumber, formatPercent, formatUnitCost, PURCHASE_UNITS, UNIT_LABELS } from '@/lib/format';
import { fractionToPercentInput, numberToInput } from '@/lib/number-input';
import {
  createIngredient,
  deleteIngredient,
  listIngredientPriceHistory,
  setIngredientArchived,
  updateIngredient,
} from './api';
import { invalidateBusinessData, queryKeys } from '@/lib/query-keys';
import { ImpactPreview, ImpactReport } from './price-impact';
import { previewIngredientImpact, type ImpactView } from './price-impact-model';
import { ingredientFormSchema, toIngredientPayload, type IngredientFormValues, type IngredientRow } from './schemas';
import { getUnitCostView } from './unit-cost';

interface Props {
  ingredient: IngredientRow | null;
  open: boolean;
  usedIn: number;
  onClose: () => void;
}

export function IngredientSheet({ ingredient, open, usedIn, onClose }: Props) {
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const [serverError, setServerError] = useState<string | null>(null);
  const isNew = ingredient === null;

  const form = useForm<IngredientFormValues>({
    resolver: zodResolver(ingredientFormSchema),
    defaultValues: ingredient
      ? {
          name: ingredient.name,
          supplier: ingredient.supplier ?? '',
          purchaseUnit: ingredient.purchase_unit,
          purchaseQty: numberToInput(ingredient.purchase_qty),
          purchasePrice: numberToInput(ingredient.purchase_price),
          wastePercent: Number(ingredient.waste_pct) > 0 ? fractionToPercentInput(ingredient.waste_pct) : '',
          notes: ingredient.notes ?? '',
        }
      : { name: '', supplier: '', purchaseUnit: 'kg', purchaseQty: '1', purchasePrice: '', wastePercent: '', notes: '' },
  });
  const [qty, unit, price, wastePercent] = useWatch({
    control: form.control,
    name: ['purchaseQty', 'purchaseUnit', 'purchasePrice', 'wastePercent'],
  });
  const preview = getUnitCostView(qty, unit, price, wastePercent, true);
  const originalWaste = ingredient && Number(ingredient.waste_pct) > 0 ? fractionToPercentInput(ingredient.waste_pct) : '';
  const errors = form.formState.errors;

  // Cambiar un insumo recalcula productos: se recarga todo lo del negocio.
  const invalidate = () => invalidateBusinessData(queryClient, business.id);

  // Impacto en productos mientras se edita (antes de guardar).
  const { snapshot } = useBusinessModel();
  const [report, setReport] = useState<ImpactView | null>(null);
  const pendingImpact = useRef<ImpactView | null>(null);
  const costChanged =
    !isNew &&
    (numberToInput(ingredient.purchase_price) !== price ||
      numberToInput(ingredient.purchase_qty) !== qty ||
      ingredient.purchase_unit !== unit ||
      originalWaste !== wastePercent.trim());
  const impactView =
    costChanged && snapshot && preview
      ? previewIngredientImpact(snapshot, ingredient.id, { purchaseQty: qty, purchaseUnit: unit, purchasePrice: price, wastePercent })
      : null;
  const hasImpact = Boolean(impactView && impactView.affectedCount > 0 && impactView.direction !== 'none');

  const save = useMutation({
    mutationFn: async (values: IngredientFormValues) => {
      const payload = toIngredientPayload(values);
      if (isNew) await createIngredient(business.id, payload);
      else await updateIngredient(ingredient.id, payload);
    },
    onSuccess: async () => {
      await invalidate();
      if (ingredient) await queryClient.invalidateQueries({ queryKey: queryKeys.ingredientHistory(ingredient.id) });
      // Si el cambio afecta productos, mostramos el informe en lugar de cerrar.
      if (pendingImpact.current) setReport(pendingImpact.current);
      else onClose();
    },
    onError: (e) => setServerError(dataErrorMessage(e)),
  });

  const archive = useMutation({
    mutationFn: () => setIngredientArchived(ingredient!.id, !ingredient!.archived_at),
    onSuccess: async () => { await invalidate(); onClose(); },
    onError: (e) => setServerError(dataErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => deleteIngredient(ingredient!.id),
    onSuccess: async () => { await invalidate(); onClose(); },
    onError: (e) => setServerError(dataErrorMessage(e)),
  });

  if (report && ingredient) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Impacto del cambio"
        footer={<Button size="lg" block variant="outline" onClick={onClose}>Listo</Button>}
      >
        <ImpactReport view={report} ingredientName={form.getValues('name')} currency={business.currency} />
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isNew ? 'Nuevo insumo' : ingredient.name}
      footer={
        tab === 'form' && (
          <Button
            size="lg"
            block
            loading={save.isPending}
            onClick={form.handleSubmit((v) => {
              setServerError(null);
              pendingImpact.current = hasImpact ? impactView : null;
              save.mutate(v);
            })}
          >
            {isNew ? 'Guardar insumo' : hasImpact ? 'Guardar y ver impacto' : 'Guardar cambios'}
          </Button>
        )
      }
    >
      {!isNew && (
        <div className="mb-5 flex gap-1 rounded-xl bg-canvas p-1" role="tablist">
          {(['form', 'history'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              type="button"
              onClick={() => setTab(t)}
              className={`h-10 flex-1 rounded-lg text-sm font-medium ${tab === t ? 'bg-surface shadow-sm' : 'text-muted'}`}
            >
              {t === 'form' ? 'Datos' : 'Historial de precios'}
            </button>
          ))}
        </div>
      )}

      {tab === 'history' && ingredient ? (
        <PriceHistory ingredientId={ingredient.id} currency={business.currency} />
      ) : (
        <form className="space-y-4" noValidate onSubmit={(e) => e.preventDefault()}>
          {serverError && <Banner tone="warning">{serverError}</Banner>}

          <Field label="Nombre" error={errors.name?.message}>
            {(id, d) => <Input id={id} aria-describedby={d} placeholder="Ej.: Chocolate semiamargo" aria-invalid={!!errors.name} {...form.register('name')} />}
          </Field>

          <div className="grid grid-cols-[1fr_1.2fr] gap-3">
            <Field label="Cantidad comprada" error={errors.purchaseQty?.message}>
              {(id, d) => <AffixInput id={id} aria-describedby={d} aria-invalid={!!errors.purchaseQty} {...form.register('purchaseQty')} />}
            </Field>
            <Field label="Unidad">
              {(id) => (
                <Select id={id} {...form.register('purchaseUnit')}>
                  {PURCHASE_UNITS.map((u) => <option key={u} value={u}>{UNIT_LABELS[u].plural}</option>)}
                </Select>
              )}
            </Field>
          </div>

          <Field label="Precio que pagaste" error={errors.purchasePrice?.message}>
            {(id, d) => <AffixInput id={id} aria-describedby={d} prefix="$" placeholder="18.000" aria-invalid={!!errors.purchasePrice} {...form.register('purchasePrice')} />}
          </Field>

          <Card className="bg-brand-50/60 p-4" aria-live="polite">
            <p className="text-[13px] text-muted">Cuánto te cuesta</p>
            {preview ? (
              <p className="mt-0.5 text-xl font-semibold tabular">
                {formatUnitCost(preview.perBase, business.currency)}
                <span className="text-sm font-normal text-muted"> por {UNIT_LABELS[preview.baseUnit].singular}</span>
                {preview.perPurchaseUnit && (
                  <span className="block text-sm font-normal text-muted">
                    {formatMoney(preview.perPurchaseUnit, business.currency)} por {UNIT_LABELS[preview.purchaseUnit].singular}
                  </span>
                )}
                {preview.usablePerBase && (
                  <span className="mt-1 block text-sm font-medium text-low">
                    Con {formatPercent(preview.waste, 1)} de merma: {formatUnitCost(preview.usablePerBase, business.currency)} por{' '}
                    {UNIT_LABELS[preview.baseUnit].singular} usable
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-muted">Completá cantidad y precio.</p>
            )}
          </Card>

          <Field label="Merma (opcional)" hint={GLOSSARY.waste} error={errors.wastePercent?.message}>
            {(id, d) => <AffixInput id={id} aria-describedby={d} suffix="%" placeholder="0" aria-invalid={!!errors.wastePercent} {...form.register('wastePercent')} />}
          </Field>

          {costChanged && preview && (
            hasImpact && impactView ? (
              <ImpactPreview view={impactView} currency={business.currency} />
            ) : (
              <Banner>El precio anterior queda guardado en el historial.</Banner>
            )
          )}
          {!isNew && usedIn > 0 && ingredient.purchase_unit !== unit && (
            <Banner tone="warning">Este insumo se usa en productos, así que solo podés cambiar a una unidad del mismo tipo (por ejemplo, de kilos a gramos).</Banner>
          )}

          <Field label="Proveedor (opcional)" error={errors.supplier?.message}>
            {(id, d) => <Input id={id} aria-describedby={d} {...form.register('supplier')} />}
          </Field>
          <Field label="Notas (opcional)" error={errors.notes?.message}>
            {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} {...form.register('notes')} />}
          </Field>

          {!isNew && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="outline" size="sm" loading={archive.isPending} onClick={() => archive.mutate()}>
                {ingredient.archived_at ? <><ArchiveRestore /> Restaurar</> : <><Archive /> Archivar</>}
              </Button>
              {usedIn === 0 && (
                <Button variant="danger" size="sm" loading={remove.isPending} onClick={() => { if (window.confirm(`¿Eliminar "${ingredient.name}" y su historial? No se puede deshacer.`)) remove.mutate(); }}>
                  <Trash2 /> Eliminar
                </Button>
              )}
            </div>
          )}
          <p className="text-[12px] text-muted">{GLOSSARY.unitCost}</p>
        </form>
      )}
    </Sheet>
  );
}

function PriceHistory({ ingredientId, currency }: { ingredientId: string; currency: string }) {
  const history = useQuery({ queryKey: queryKeys.ingredientHistory(ingredientId), queryFn: () => listIngredientPriceHistory(ingredientId) });

  if (history.isPending) return <p className="text-sm text-muted">Cargando…</p>;
  if (history.isError) return <Banner tone="warning">{dataErrorMessage(history.error)}</Banner>;
  if (history.data.length === 0) return <p className="text-sm text-muted">Sin cambios de precio todavía.</p>;

  const rows = history.data.map((h, i) => {
    const view = getUnitCostView(h.purchase_qty, h.purchase_unit, h.purchase_price);
    const prev = history.data[i + 1];
    const prevView = prev ? getUnitCostView(prev.purchase_qty, prev.purchase_unit, prev.purchase_price) : null;
    const change = view && prevView && !prevView.perBase.isZero() ? view.perBase.minus(prevView.perBase).div(prevView.perBase) : null;
    return { h, view, change };
  });

  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-sm text-muted"><History className="size-4" /> Cada cambio de precio queda registrado.</p>
      <ol className="divide-y divide-line rounded-xl border border-line">
        {rows.map(({ h, view, change }) => (
          <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-medium tabular">{formatMoney(h.purchase_price, currency)}</p>
              <p className="text-[13px] text-muted">
                {formatNumber(h.purchase_qty)} {UNIT_LABELS[h.purchase_unit].short} · {formatDate(h.effective_at)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm tabular">{view ? `${formatUnitCost(view.perBase, currency)}/${UNIT_LABELS[view.baseUnit].short}` : '—'}</p>
              {change && !change.isZero() && (
                <p className={`text-[13px] font-medium tabular ${change.gt(0) ? 'text-negative' : 'text-healthy'}`}>
                  {change.gt(0) ? '+' : ''}{formatPercent(change, 1)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {rows.length >= 2 && (() => {
        const first = rows[rows.length - 1]!.view;
        const last = rows[0]!.view;
        if (!first || !last || first.perBase.isZero()) return null;
        const total = last.perBase.minus(first.perBase).div(first.perBase);
        return (
          <p className="mt-3 text-sm text-muted">
            Desde el primer registro: <span className="font-medium text-ink">{total.gte(dec(0)) ? '+' : ''}{formatPercent(total, 1)}</span>
          </p>
        );
      })()}
    </div>
  );
}
