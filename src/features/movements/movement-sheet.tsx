import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, ShoppingBasket, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { AffixInput, Field, Input, Segmented, Select, Textarea } from '@/components/ui/form';
import { Banner, Card, Sheet } from '@/components/ui/surfaces';
import { dataErrorMessage } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { useBusinessModel } from '@/features/business/use-business-model';
import { listProductOptions } from '@/features/costs/api';
import { listIngredients, updateIngredientPrice } from '@/features/ingredients/api';
import { ImpactPreview, ImpactReport } from '@/features/ingredients/price-impact';
import { previewIngredientImpact, type ImpactView } from '@/features/ingredients/price-impact-model';
import type { IngredientRow } from '@/features/ingredients/schemas';
import { dec, priceForPresentation, todayISO, unitFamily, type Dec } from '@/domain/finance';
import { BASE_UNIT_BY_UNIT, formatMoney, formatPercent, UNIT_LABELS, UNITS_BY_FAMILY } from '@/lib/format';
import { numberToInput, parseLocaleNumber } from '@/lib/number-input';
import { invalidateBusinessData, queryKeys } from '@/lib/query-keys';
import { deleteMovement, saveMovement } from './api';
import {
  categoriesFor,
  isPurchase,
  movementFormSchema,
  PAYMENT_METHODS,
  PURCHASE_CATEGORIES,
  toMovementPayload,
  type MovementFormValues,
  type MovementKind,
  type MovementRow,
} from './schemas';

interface Props {
  movement: MovementRow | null;
  /** Tipo inicial al crear (desde la pestaña Ingresos/Egresos). */
  initialKind: MovementKind;
  /** Valores precargados (ej. "Registrar pago" desde un costo fijo). */
  prefill?: Partial<MovementFormValues>;
  /** Texto que explica el vínculo precargado (ej. "Pago de: Alquiler · planificado $450.000"). */
  linkNote?: string;
  open: boolean;
  onClose: () => void;
}

/** Revisión después de guardar una compra cuyo precio difiere del insumo. */
interface PurchaseReview {
  ingredient: IngredientRow;
  newPrice: Dec;
  oldPrice: Dec;
  impact: ImpactView | null;
}

const EMPTY: MovementFormValues = {
  kind: 'income', occurredOn: '', concept: '', category: '', amount: '', productId: '', paymentMethod: '',
  supplier: '', notes: '', fixedCostId: '', purchaseIngredientId: '', purchaseQty: '', purchaseUnit: 'kg',
};

export function MovementSheet({ movement, initialKind, prefill, linkNote, open, onClose }: Props) {
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const { snapshot } = useBusinessModel();
  const [serverError, setServerError] = useState<string | null>(null);
  const [review, setReview] = useState<PurchaseReview | null>(null);
  const [report, setReport] = useState<ImpactView | null>(null);
  const isNew = movement === null;

  const products = useQuery({ queryKey: queryKeys.productOptions(business.id), queryFn: () => listProductOptions(business.id), enabled: open });
  const ingredients = useQuery({ queryKey: queryKeys.ingredients(business.id), queryFn: () => listIngredients(business.id), enabled: open });

  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementFormSchema),
    defaultValues: movement
      ? {
          ...EMPTY,
          kind: movement.kind,
          occurredOn: movement.occurred_on,
          concept: movement.concept,
          category: movement.category,
          amount: numberToInput(movement.amount),
          productId: movement.product_id ?? '',
          paymentMethod: movement.payment_method ?? '',
          supplier: movement.supplier ?? '',
          notes: movement.notes ?? '',
          fixedCostId: movement.fixed_cost_id ?? '',
          purchaseIngredientId: movement.ingredient_id ?? '',
          purchaseQty: numberToInput(movement.ingredient_qty),
          purchaseUnit: movement.ingredient_unit ?? 'kg',
        }
      : { ...EMPTY, kind: initialKind, occurredOn: todayISO(), category: initialKind === 'income' ? 'sale' : '', ...prefill },
  });
  const [kind, category, purchaseIngredientId] = useWatch({ control: form.control, name: ['kind', 'category', 'purchaseIngredientId'] });
  const errors = form.formState.errors;
  const income = kind === 'income';
  const canBePurchase = !income && PURCHASE_CATEGORIES.includes(category);
  const purchasedIngredient = ingredients.data?.find((i) => i.id === purchaseIngredientId);

  const refresh = () => invalidateBusinessData(queryClient, business.id);

  /** Si la compra salió a otro precio que el del insumo, preparamos la revisión. */
  function buildReview(v: MovementFormValues): PurchaseReview | null {
    if (!isPurchase(v) || !snapshot) return null;
    const ingredient = ingredients.data?.find((i) => i.id === v.purchaseIngredientId);
    const qty = parseLocaleNumber(v.purchaseQty);
    const amount = parseLocaleNumber(v.amount);
    if (!ingredient || !qty || !amount) return null;
    const newPrice = priceForPresentation(amount, { qty, unit: v.purchaseUnit }, { qty: ingredient.purchase_qty, unit: ingredient.purchase_unit });
    if (!newPrice.ok || newPrice.value.eq(dec(ingredient.purchase_price))) return null;
    const impact = previewIngredientImpact(snapshot, ingredient.id, {
      purchaseQty: ingredient.purchase_qty,
      purchaseUnit: ingredient.purchase_unit,
      purchasePrice: newPrice.value.toString(),
    });
    return { ingredient, newPrice: newPrice.value, oldPrice: dec(ingredient.purchase_price), impact };
  }

  const save = useMutation({
    mutationFn: async (v: MovementFormValues) => {
      await saveMovement(business.id, movement?.id ?? null, toMovementPayload(v));
      return v;
    },
    onSuccess: async (v) => {
      // La revisión se calcula con los datos de ANTES de recargar.
      const nextReview = buildReview(v);
      await refresh();
      if (nextReview) setReview(nextReview);
      else onClose();
    },
    onError: (e) => setServerError(dataErrorMessage(e)),
  });

  const updatePrice = useMutation({
    mutationFn: (r: PurchaseReview) =>
      updateIngredientPrice(r.ingredient.id, {
        purchase_price: r.newPrice.toString(),
        purchase_qty: r.ingredient.purchase_qty,
        purchase_unit: r.ingredient.purchase_unit,
      }),
    onSuccess: async (_, r) => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: queryKeys.ingredientHistory(r.ingredient.id) });
      if (r.impact && r.impact.affectedCount > 0) {
        setReview(null);
        setReport(r.impact);
      } else onClose();
    },
    onError: (e) => setServerError(dataErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => deleteMovement(movement!.id),
    onSuccess: async () => { await refresh(); onClose(); },
    onError: (e) => setServerError(dataErrorMessage(e)),
  });

  // ---------------------------------------------------------------- Pasos posteriores a guardar

  if (report && review === null) {
    return (
      <Sheet open={open} onClose={onClose} title="Impacto del cambio" footer={<Button size="lg" block variant="outline" onClick={onClose}>Listo</Button>}>
        <ImpactReport view={report} ingredientName={purchasedIngredient?.name ?? 'el insumo'} currency={business.currency} />
      </Sheet>
    );
  }

  if (review) {
    const unitLabel = `${numberToInput(review.ingredient.purchase_qty)} ${UNIT_LABELS[review.ingredient.purchase_unit].short}`;
    const change = review.newPrice.minus(review.oldPrice).div(review.oldPrice.isZero() ? 1 : review.oldPrice);
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Compra registrada"
        footer={
          <div className="space-y-2">
            <Button size="lg" block loading={updatePrice.isPending} onClick={() => { setServerError(null); updatePrice.mutate(review); }}>
              Actualizar el precio de {review.ingredient.name}
            </Button>
            <Button size="lg" block variant="ghost" onClick={onClose}>Dejar el precio como está</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {serverError && <Banner tone="warning">{serverError}</Banner>}
          <Banner>Guardamos el egreso.</Banner>
          <Card className="p-4">
            <p className="flex items-center gap-2 font-medium"><ShoppingBasket className="size-4 text-brand-600" /> {review.ingredient.name}</p>
            <p className="mt-2 text-sm">
              Esta compra salió <strong className="tabular">{formatMoney(review.newPrice, business.currency)}</strong> por {unitLabel}. Tenías cargado{' '}
              <strong className="tabular">{formatMoney(review.oldPrice, business.currency)}</strong>{' '}
              <span className={change.gt(0) ? 'text-negative' : 'text-healthy'}>({change.gt(0) ? '+' : ''}{formatPercent(change, 1)})</span>.
            </p>
          </Card>
          {review.impact && <ImpactPreview view={review.impact} currency={business.currency} />}
          <p className="text-[13px] text-muted">Si actualizás, el precio anterior queda en el historial y tus productos se recalculan. Tus precios de venta no cambian solos.</p>
        </div>
      </Sheet>
    );
  }

  // ---------------------------------------------------------------- Formulario

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

        {isNew && !prefill?.fixedCostId && (
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

        {(linkNote || (movement?.fixed_cost_id && !income)) && (
          <p className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-[13px] text-brand-900">
            <Link2 className="size-4 shrink-0" aria-hidden /> {linkNote ?? 'Pago vinculado a un costo fijo planificado.'}
          </p>
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

        {canBePurchase && (
          <PurchaseFields form={form} ingredients={ingredients.data ?? []} selected={purchasedIngredient} errors={errors} />
        )}

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

        {!income && isNew && !prefill?.fixedCostId && (
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

/** "¿Es la compra de un insumo?" + cantidad y unidad compatibles. */
function PurchaseFields({ form, ingredients, selected, errors }: {
  form: ReturnType<typeof useForm<MovementFormValues>>;
  ingredients: IngredientRow[];
  selected: IngredientRow | undefined;
  errors: ReturnType<typeof useForm<MovementFormValues>>['formState']['errors'];
}) {
  const options = ingredients.filter((i) => !i.archived_at || i.id === selected?.id);
  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <Field label="¿Es la compra de un insumo? (opcional)" hint="Si el precio cambió, te ofrecemos actualizarlo y ver el impacto en tus productos.">
        {(id, d) => (
          <Select
            id={id}
            aria-describedby={d}
            {...form.register('purchaseIngredientId', {
              onChange: (e) => {
                const ing = ingredients.find((i) => i.id === e.target.value);
                if (ing) {
                  form.setValue('purchaseUnit', ing.purchase_unit);
                  if (!form.getValues('concept')) form.setValue('concept', `Compra de ${ing.name.toLowerCase()}`);
                }
              },
            })}
          >
            <option value="">No</option>
            {options.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        )}
      </Field>
      {selected && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cantidad comprada" error={errors.purchaseQty?.message}>
            {(id, d) => <AffixInput id={id} aria-describedby={d} placeholder="5" aria-invalid={!!errors.purchaseQty} {...form.register('purchaseQty')} />}
          </Field>
          <Field label="Unidad">
            {(id) => (
              <Select id={id} {...form.register('purchaseUnit')}>
                {[...new Set([selected.purchase_unit, BASE_UNIT_BY_UNIT[selected.purchase_unit], ...UNITS_BY_FAMILY[unitFamily(selected.purchase_unit)]])].map((u) => (
                  <option key={u} value={u}>{UNIT_LABELS[u].plural}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      )}
    </div>
  );
}
