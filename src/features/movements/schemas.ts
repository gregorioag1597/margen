import { z } from 'zod';
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
});
export type MovementRow = z.infer<typeof movementRowSchema>;

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
  })
  .superRefine((v, ctx) => {
    if (!categoriesFor(v.kind).some((c) => c.value === v.category)) {
      ctx.addIssue({ code: 'custom', path: ['category'], message: 'Elegí una categoría.' });
    }
  });
export type MovementFormValues = z.infer<typeof movementFormSchema>;

/** Formulario → columnas. Cada tipo solo manda sus campos (la base lo exige). */
export function toMovementPayload(v: MovementFormValues) {
  const income = v.kind === 'income';
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
  };
}
export type MovementPayload = ReturnType<typeof toMovementPayload>;
