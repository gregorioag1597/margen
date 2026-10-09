import { z } from 'zod';
import { UNIT_CODES } from '@/features/ingredients/schemas';
import { emptyToNull, localeNumber, optionalText } from '@/lib/form-schemas';
import { parseLocaleNumber } from '@/lib/number-input';

export const INCOME_CATEGORIES = [
  { value: 'sale', label: 'Venta' },
  { value: 'service', label: 'Servicio' },
  { value: 'other_income', label: 'Otro ingreso' },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: 'raw_materials', label: 'Materia prima' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'rent', label: 'Alquiler' },
  { value: 'salaries', label: 'Sueldos' },
  { value: 'utilities', label: 'Servicios' },
  { value: 'advertising', label: 'Publicidad' },
  { value: 'transport', label: 'Transporte' },
  { value: 'taxes', label: 'Impuestos' },
  { value: 'software', label: 'Software' },
  { value: 'other', label: 'Otros' },
] as const;

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'debit', label: 'Débito' },
  { value: 'credit', label: 'Crédito' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'other', label: 'Otro' },
] as const;

export type MovementKind = 'income' | 'expense';
type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value'];
const paymentValues = PAYMENT_METHODS.map((p) => p.value) as [PaymentMethod, ...PaymentMethod[]];

const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
export const categoryLabel = (value: string) => ALL_CATEGORIES.find((c) => c.value === value)?.label ?? value;
export const paymentLabel = (value: string | null) => PAYMENT_METHODS.find((p) => p.value === value)?.label ?? null;
export const categoriesFor = (kind: MovementKind) => (kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES);

export const movementRowSchema = z.object({
  id: z.string(),
  kind: z.enum(['income', 'expense']),
  occurred_on: z.string(),
  concept: z.string(),
  category: z.string(),
  amount: z.coerce.string(),
  product_id: z.string().nullable(),
  payment_method: z.enum(paymentValues).nullable(),
  supplier: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  // Fase 10: vínculos de egresos
  fixed_cost_id: z.string().nullable().default(null),
  ingredient_id: z.string().nullable().default(null),
  ingredient_qty: z.coerce.string().nullable().default(null),
  ingredient_unit: z.enum(UNIT_CODES).nullable().default(null),
});
export type MovementRow = z.infer<typeof movementRowSchema>;

/** Categorías de egreso en las que tiene sentido "es la compra de un insumo". */
export const PURCHASE_CATEGORIES = ['raw_materials', 'packaging'];

export const movementFormSchema = z
  .object({
    kind: z.enum(['income', 'expense']),
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí una fecha.'),
    concept: z.string().trim().min(1, 'Poné un concepto.').max(160),
    category: z.string().min(1, 'Elegí una categoría.'),
    amount: localeNumber({ required: '¿De cuánto fue?', check: (n) => n.gt(0), checkMessage: 'Tiene que ser mayor a 0.' }),
    productId: z.string(),
    paymentMethod: z.string(),
    supplier: optionalText(120),
    notes: optionalText(1000),
    /** Pago de un costo fijo planificado (vacío = sin vínculo). */
    fixedCostId: z.string(),
    /** Compra de insumo (vacío = no es una compra de insumo). */
    purchaseIngredientId: z.string(),
    purchaseQty: z.string(),
    purchaseUnit: z.enum(UNIT_CODES),
  })
  .superRefine((v, ctx) => {
    if (!categoriesFor(v.kind).some((c) => c.value === v.category)) {
      ctx.addIssue({ code: 'custom', path: ['category'], message: 'Elegí una categoría.' });
    }
    if (isPurchase(v)) {
      const r = localeNumber({ required: '¿Cuánto compraste?', check: (n) => n.gt(0), checkMessage: 'Tiene que ser mayor a 0.' }).safeParse(v.purchaseQty);
      if (!r.success) ctx.addIssue({ code: 'custom', path: ['purchaseQty'], message: r.error.issues[0]!.message });
    }
  });
export type MovementFormValues = z.infer<typeof movementFormSchema>;

export const isPurchase = (v: Pick<MovementFormValues, 'kind' | 'category' | 'purchaseIngredientId'>) =>
  v.kind === 'expense' && PURCHASE_CATEGORIES.includes(v.category) && v.purchaseIngredientId !== '';

/** Formulario → columnas. Cada tipo solo manda sus campos (la base lo exige). */
export function toMovementPayload(v: MovementFormValues) {
  const income = v.kind === 'income';
  const purchase = isPurchase(v);
  return {
    kind: v.kind,
    occurred_on: v.occurredOn,
    concept: v.concept.trim(),
    category: v.category,
    amount: parseLocaleNumber(v.amount)!,
    product_id: income && v.productId ? v.productId : null,
    payment_method: income && v.paymentMethod ? (v.paymentMethod as PaymentMethod) : null,
    supplier: income ? null : emptyToNull(v.supplier),
    notes: emptyToNull(v.notes),
    fixed_cost_id: !income && v.fixedCostId ? v.fixedCostId : null,
    ingredient_id: purchase ? v.purchaseIngredientId : null,
    ingredient_qty: purchase ? parseLocaleNumber(v.purchaseQty)! : null,
    ingredient_unit: purchase ? v.purchaseUnit : null,
  };
}

/** Categoría de egreso que corresponde a cada categoría de costo fijo. */
export const EXPENSE_CATEGORY_FOR_FIXED: Record<string, string> = {
  rent: 'rent',
  salaries: 'salaries',
  accounting: 'other',
  internet: 'utilities',
  software: 'software',
  insurance: 'other',
  utilities: 'utilities',
  advertising: 'advertising',
  transport: 'transport',
  other: 'other',
};
export type MovementPayload = ReturnType<typeof toMovementPayload>;
