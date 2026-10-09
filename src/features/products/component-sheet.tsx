import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { AffixInput, Field, Input, Segmented, Select } from '@/components/ui/form';
import { Banner, Card, Sheet } from '@/components/ui/surfaces';
import { dataErrorMessage, GLOSSARY } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import {
  buildCostLookup,
  calculateComponentCost,
  dec,
  unitFamily,
  type BusinessSnapshot,
  type ProductComponent,
  type UnitFamily,
} from '@/domain/finance';
import type { IngredientRow } from '@/features/ingredients/schemas';
import { BASE_UNIT_BY_UNIT, formatMoney, formatNumber, UNIT_LABELS, UNITS_BY_FAMILY } from '@/lib/format';
import { numberToInput, parseLocaleNumber } from '@/lib/number-input';
import { invalidateBusinessData } from '@/lib/query-keys';
import { deleteComponent, saveComponent } from './api';
import {
  componentFormSchema,
  defaultBasisFor,
  toComponentPayload,
  type ComponentFormValues,
  type ComponentKind,
  type ComponentRow,
} from './schemas';


const KIND_OPTIONS: { value: ComponentKind; label: string }[] = [
  { value: 'ingredient', label: 'Insumo' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'labor', label: 'Trabajo' },
  { value: 'other', label: 'Otro' },
];

interface Props {
  productId: string;
  component: ComponentRow | null;
  nextPosition: number;
  ingredients: IngredientRow[];
  laborRateId: string | null;
  snapshot: BusinessSnapshot;
  /** Unidades que rinde la tanda del producto (1 = receta por unidad). */
  batchYield: string;
  open: boolean;
  onClose: () => void;
}

export function ComponentSheet({ productId, component, nextPosition, ingredients, laborRateId, snapshot, batchYield, open, onClose }: Props) {
  const byBatch = Number(batchYield) !== 1;
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ComponentFormValues>({
    resolver: zodResolver(componentFormSchema),
    defaultValues: component
      ? {
          kind: component.kind,
          ingredientId: component.ingredient_id ?? '',
          quantity: numberToInput(component.quantity),
          unit: component.unit ?? 'g',
          label: component.label ?? '',
          amount: numberToInput(component.fixed_amount),
          basis: component.basis,
        }
      : { kind: 'ingredient', ingredientId: '', quantity: '', unit: 'g', label: '', amount: '', basis: defaultBasisFor('ingredient') },
  });
  const values = useWatch({ control: form.control });
  const errors = form.formState.errors;
  const kind = values.kind ?? 'ingredient';

  const selectedIngredient = ingredients.find((i) => i.id === values.ingredientId);
  const family: UnitFamily = kind === 'labor' ? 'time' : selectedIngredient ? unitFamily(selectedIngredient.purchase_unit) : 'mass';
  // Insumos disponibles: activos + el que ya usa este componente (aunque esté archivado).
  const options = ingredients.filter((i) => !i.archived_at || i.id === component?.ingredient_id);

  const preview = previewCost(values as ComponentFormValues, laborRateId, snapshot, batchYield);

  const done = async () => { await invalidateBusinessData(queryClient, business.id); onClose(); };
  const save = useMutation({
    mutationFn: (v: ComponentFormValues) =>
      saveComponent(business.id, productId, component?.id ?? null, toComponentPayload(v, laborRateId), component?.position ?? nextPosition),
    onSuccess: done,
    onError: (e) => setServerError(dataErrorMessage(e)),
  });
  const remove = useMutation({ mutationFn: () => deleteComponent(component!.id), onSuccess: done, onError: (e) => setServerError(dataErrorMessage(e)) });

  const needsLaborRate = kind === 'labor' && !laborRateId;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={component ? 'Editar componente' : 'Agregar al producto'}
      footer={
        <Button size="lg" block disabled={needsLaborRate} loading={save.isPending} onClick={form.handleSubmit((v) => { setServerError(null); save.mutate(v); })}>
          Guardar
        </Button>
      }
    >
      <form className="space-y-4" noValidate onSubmit={(e) => e.preventDefault()}>
        {serverError && <Banner tone="warning">{serverError}</Banner>}

        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <Segmented<ComponentKind>
              ariaLabel="Tipo de componente"
              value={field.value}
              options={KIND_OPTIONS}
              onChange={(k) => {
                field.onChange(k);
                if (k === 'labor') form.setValue('unit', 'min');
                else form.setValue('unit', selectedIngredient ? BASE_UNIT_BY_UNIT[selectedIngredient.purchase_unit] : 'g');
                if (!component) form.setValue('basis', defaultBasisFor(k));
              }}
            />
          )}
        />

        {(kind === 'ingredient' || kind === 'packaging') && (
          options.length === 0 ? (
            <Banner>
              Primero cargá tus insumos (también las cajas y etiquetas) en <Link className="font-medium underline" to="/insumos">Mis insumos</Link>.
            </Banner>
          ) : (
            <Field label={kind === 'packaging' ? 'Packaging' : 'Insumo'} error={errors.ingredientId?.message}>
              {(id, d) => (
                <Select
                  id={id}
                  aria-describedby={d}
                  aria-invalid={!!errors.ingredientId}
                  {...form.register('ingredientId', {
                    onChange: (e) => {
                      const ing = ingredients.find((i) => i.id === e.target.value);
                      if (ing) form.setValue('unit', BASE_UNIT_BY_UNIT[ing.purchase_unit]);
                    },
                  })}
                >
                  <option value="" disabled>Elegí uno</option>
                  {options.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </Select>
              )}
            </Field>
          )
        )}

        {kind === 'labor' && needsLaborRate && (
          <Banner tone="warning">
            Primero definí cuánto vale una hora de trabajo en <Link className="font-medium underline" to="/costos?tab=mano-de-obra">Costos → Mano de obra</Link>.
          </Banner>
        )}

        {kind !== 'other' ? (
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <Field label={kind === 'labor' ? 'Tiempo que lleva' : 'Cantidad que usa'} error={errors.quantity?.message}>
              {(id, d) => <AffixInput id={id} aria-describedby={d} placeholder={kind === 'labor' ? '8' : '80'} aria-invalid={!!errors.quantity} {...form.register('quantity')} />}
            </Field>
            <Field label="Unidad">
              {(id) => (
                <Select id={id} {...form.register('unit')}>
                  {UNITS_BY_FAMILY[family].map((u) => <option key={u} value={u}>{UNIT_LABELS[u].plural}</option>)}
                </Select>
              )}
            </Field>
          </div>
        ) : (
          <>
            <Field label="Descripción" error={errors.label?.message}>
              {(id, d) => <Input id={id} aria-describedby={d} placeholder="Ej.: Envío al local" aria-invalid={!!errors.label} {...form.register('label')} />}
            </Field>
            <Field label="Costo" error={errors.amount?.message}>
              {(id, d) => <AffixInput id={id} aria-describedby={d} prefix="$" aria-invalid={!!errors.amount} {...form.register('amount')} />}
            </Field>
          </>
        )}

        {byBatch && (
          <div className="space-y-2">
            <p className="text-sm font-medium">¿Esa cantidad es para…?</p>
            <Controller
              control={form.control}
              name="basis"
              render={({ field }) => (
                <Segmented<'batch' | 'unit'>
                  ariaLabel="La cantidad es para"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 'batch', label: `Toda la tanda (${formatNumber(batchYield)} u.)` },
                    { value: 'unit', label: 'Cada unidad' },
                  ]}
                />
              )}
            />
            <p className="text-[12px] text-muted">{GLOSSARY.basis}</p>
          </div>
        )}

        <Card className="bg-brand-50/60 p-4" aria-live="polite">
          <p className="text-[13px] text-muted">Le suma a cada unidad</p>
          <p className="mt-0.5 text-xl font-semibold tabular">{preview ? formatMoney(preview.cost, business.currency) : '—'}</p>
          {preview && preview.basis === 'batch' && byBatch && (
            <p className="text-[13px] text-muted">En toda la tanda: {formatMoney(preview.amount, business.currency)}</p>
          )}
        </Card>

        {component && (
          <div className="border-t border-line pt-4">
            <Button variant="danger" size="sm" loading={remove.isPending} onClick={() => remove.mutate()}>
              <Trash2 /> Quitar del producto
            </Button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

/** Costo del componente con los datos del formulario, usando el motor. */
function previewCost(v: Partial<ComponentFormValues>, laborRateId: string | null, snapshot: BusinessSnapshot, batchYield: string) {
  const qty = parseLocaleNumber(v.quantity ?? '');
  const basis = v.basis ?? 'batch';
  let component: ProductComponent | null = null;
  if ((v.kind === 'ingredient' || v.kind === 'packaging') && v.ingredientId && qty && v.unit) {
    component = { id: 'preview', kind: v.kind, ingredientId: v.ingredientId, quantity: qty, unit: v.unit, basis };
  } else if (v.kind === 'labor' && laborRateId && qty && v.unit) {
    component = { id: 'preview', kind: 'labor', laborRateId, quantity: qty, unit: v.unit, basis };
  } else if (v.kind === 'other') {
    const amount = parseLocaleNumber(v.amount ?? '');
    if (amount) component = { id: 'preview', kind: 'other', label: v.label ?? '', amount, basis };
  }
  if (!component) return null;
  const result = calculateComponentCost(component, buildCostLookup(snapshot.ingredients, snapshot.laborRates), dec(batchYield));
  return result.ok ? result.value : null;
}
