import { z } from 'zod';
import type { FixedCostCategory } from '@/domain/finance';
import { emptyToNull, localeNumber, optionalText } from '@/lib/form-schemas';
import { parseLocaleNumber, percentInputToFraction } from '@/lib/number-input';

// ---------------------------------------------------------------- Costos fijos

export const FIXED_COST_CATEGORIES: { value: FixedCostCategory; label: string }[] = [
  { value: 'rent', label: 'Alquiler' },
  { value: 'salaries', label: 'Sueldos' },
  { value: 'accounting', label: 'Contador' },
  { value: 'internet', label: 'Internet' },
  { value: 'software', label: 'Software' },
  { value: 'insurance', label: 'Seguros' },
  { value: 'utilities', label: 'Servicios (luz, gas, agua)' },
  { value: 'advertising', label: 'Publicidad' },
  { value: 'transport', label: 'Transporte' },
  { value: 'other', label: 'Otros' },
];
const fixedCategoryValues = FIXED_COST_CATEGORIES.map((c) => c.value) as [FixedCostCategory, ...FixedCostCategory[]];

export const fixedCostRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(fixedCategoryValues),
  monthly_amount: z.coerce.string(),
  is_active: z.boolean(),
  notes: z.string().nullable(),
});
export type FixedCostRow = z.infer<typeof fixedCostRowSchema>;

export const fixedCostFormSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre.').max(120),
  category: z.enum(fixedCategoryValues),
  monthlyAmount: localeNumber({ required: '¿Cuánto pagás por mes?', check: (n) => n.gte(0), checkMessage: 'No puede ser negativo.' }),
  notes: optionalText(1000),
});
export type FixedCostFormValues = z.infer<typeof fixedCostFormSchema>;

export function toFixedCostPayload(v: FixedCostFormValues) {
  return {
    name: v.name.trim(),
    category: v.category,
    monthly_amount: parseLocaleNumber(v.monthlyAmount)!,
    notes: emptyToNull(v.notes),
  };
}

// ---------------------------------------------------------------- Costos variables

export const VARIABLE_COST_CATEGORIES = [
  { value: 'payment_fee', label: 'Medio de pago' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'tax', label: 'Impuesto sobre la venta' },
  { value: 'shipping', label: 'Envío' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'other', label: 'Otro' },
] as const;
type VariableCategory = (typeof VARIABLE_COST_CATEGORIES)[number]['value'];
const variableCategoryValues = VARIABLE_COST_CATEGORIES.map((c) => c.value) as [VariableCategory, ...VariableCategory[]];

export const variableCostRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(variableCategoryValues),
  percent_of_sale: z.coerce.string(),
  amount_per_unit: z.coerce.string(),
  applies_to: z.enum(['all', 'selected']),
  share_of_sales: z.coerce.string(),
  is_active: z.boolean(),
  notes: z.string().nullable(),
  variable_cost_products: z.array(z.object({ product_id: z.string() })),
});
export type VariableCostRow = z.infer<typeof variableCostRowSchema>;

export type VariableKind = 'percent' | 'amount' | 'both';

const pctField = (required: string) =>
  localeNumber({ required, check: (n) => n.gte(0) && n.lt(100), checkMessage: 'Tiene que estar entre 0 y 99,99 %.' });

export const variableCostFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Poné un nombre.').max(120),
    category: z.enum(variableCategoryValues),
    kind: z.enum(['percent', 'amount', 'both']),
    percent: z.string(),
    amount: z.string(),
    appliesTo: z.enum(['all', 'selected']),
    productIds: z.array(z.string()),
    allSales: z.boolean(),
    sharePercent: z.string(),
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    const check = (schema: z.ZodType, value: string, path: string) => {
      const r = schema.safeParse(value);
      if (!r.success) ctx.addIssue({ code: 'custom', path: [path], message: r.error.issues[0]!.message });
    };
    if (v.kind !== 'amount') check(pctField('¿Qué porcentaje te cobran?'), v.percent, 'percent');
    if (v.kind !== 'percent')
      check(localeNumber({ required: '¿Cuánto por unidad?', check: (n) => n.gte(0), checkMessage: 'No puede ser negativo.' }), v.amount, 'amount');
    if (!v.allSales)
      check(
        localeNumber({ required: '¿En qué parte de las ventas?', check: (n) => n.gt(0) && n.lte(100), checkMessage: 'Entre 1 y 100 %.' }),
        v.sharePercent,
        'sharePercent',
      );
    if (v.appliesTo === 'selected' && v.productIds.length === 0)
      ctx.addIssue({ code: 'custom', path: ['productIds'], message: 'Elegí al menos un producto.' });
    // Con "ambos", que al menos uno sea mayor a 0 (la base lo exige).
    const pct = v.kind !== 'amount' ? percentInputToFraction(v.percent) : '0';
    const amt = v.kind !== 'percent' ? parseLocaleNumber(v.amount) : '0';
    if (pct === '0' && amt === '0') ctx.addIssue({ code: 'custom', path: [v.kind === 'amount' ? 'amount' : 'percent'], message: 'Tiene que ser mayor a 0.' });
  });
export type VariableCostFormValues = z.infer<typeof variableCostFormSchema>;

export function toVariableCostPayload(v: VariableCostFormValues) {
  return {
    cost: {
      name: v.name.trim(),
      category: v.category,
      percent_of_sale: v.kind === 'amount' ? '0' : percentInputToFraction(v.percent)!,
      amount_per_unit: v.kind === 'percent' ? '0' : parseLocaleNumber(v.amount)!,
      applies_to: v.appliesTo,
      share_of_sales: v.allSales ? '1' : percentInputToFraction(v.sharePercent)!,
      notes: emptyToNull(v.notes),
    },
    productIds: v.appliesTo === 'selected' ? v.productIds : [],
  };
}

// ---------------------------------------------------------------- Mano de obra

export const laborRateRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  hourly_rate: z.coerce.string(),
  is_default: z.boolean(),
});
export type LaborRateRow = z.infer<typeof laborRateRowSchema>;

export const laborFormSchema = z.object({
  hourlyRate: localeNumber({ required: '¿Cuánto vale una hora de trabajo?', check: (n) => n.gte(0), checkMessage: 'No puede ser negativo.' }),
});
