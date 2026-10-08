import { z } from 'zod';
import { UNIT_CODES } from '@/features/ingredients/schemas';
import { emptyToNull, localeNumber, optionalText } from '@/lib/form-schemas';
import { parseLocaleNumber, percentInputToFraction } from '@/lib/number-input';

export const componentRowSchema = z.object({
  id: z.string(),
  kind: z.enum(['ingredient', 'packaging', 'labor', 'other']),
  ingredient_id: z.string().nullable(),
  labor_rate_id: z.string().nullable(),
  quantity: z.coerce.string().nullable(),
  unit: z.enum(UNIT_CODES).nullable(),
  fixed_amount: z.coerce.string().nullable(),
  label: z.string().nullable(),
  position: z.number(),
});
export type ComponentRow = z.infer<typeof componentRowSchema>;

export const productRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  price: z.coerce.string().nullable(),
  monthly_units_estimate: z.number(),
  target_margin: z.coerce.string().nullable(),
  notes: z.string().nullable(),
  archived_at: z.string().nullable(),
  price_updated_at: z.string().nullable(),
  product_components: z.array(componentRowSchema),
});
export type ProductRow = z.infer<typeof productRowSchema>;

// ---------------------------------------------------------------- Formulario de producto

export const productFormSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre.').max(120),
  category: optionalText(60),
  price: localeNumber({ check: (n) => n.gt(0), checkMessage: 'El precio tiene que ser mayor a 0.' }),
  monthlyUnits: localeNumber({
    check: (n) => n.gte(0) && n.isInteger(),
    checkMessage: 'Usá un número entero, 0 o más.',
  }),
  notes: optionalText(1000),
});
export type ProductFormValues = z.infer<typeof productFormSchema>;

export function toProductPayload(v: ProductFormValues) {
  return {
    name: v.name.trim(),
    category: emptyToNull(v.category),
    price: v.price.trim() === '' ? null : parseLocaleNumber(v.price)!,
    monthly_units_estimate: v.monthlyUnits.trim() === '' ? 0 : Number(parseLocaleNumber(v.monthlyUnits)),
    notes: emptyToNull(v.notes),
  };
}

/** Margen objetivo personalizado: "35" → "0.35". */
export const customMarginSchema = localeNumber({
  required: 'Escribí un porcentaje.',
  check: (n) => n.gte(0) && n.lt(100),
  checkMessage: 'Entre 0 y 99 %.',
});
export const customMarginToFraction = (raw: string) => percentInputToFraction(raw);

// ---------------------------------------------------------------- Formulario de componente

export type ComponentKind = ComponentRow['kind'];

export const componentFormSchema = z
  .object({
    kind: z.enum(['ingredient', 'packaging', 'labor', 'other']),
    ingredientId: z.string(),
    quantity: z.string(),
    unit: z.enum(UNIT_CODES),
    label: z.string().trim().max(120),
    amount: z.string(),
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.kind === 'ingredient' || v.kind === 'packaging') {
      if (!v.ingredientId) add('ingredientId', 'Elegí un insumo.');
    }
    if (v.kind !== 'other') {
      const r = localeNumber({ required: '¿Cuánto lleva?', check: (n) => n.gt(0), checkMessage: 'Tiene que ser mayor a 0.' }).safeParse(v.quantity);
      if (!r.success) add('quantity', r.error.issues[0]!.message);
    } else {
      if (!v.label) add('label', 'Poné una descripción.');
      const r = localeNumber({ required: '¿Cuánto cuesta por unidad?', check: (n) => n.gte(0), checkMessage: 'No puede ser negativo.' }).safeParse(v.amount);
      if (!r.success) add('amount', r.error.issues[0]!.message);
    }
  });
export type ComponentFormValues = z.infer<typeof componentFormSchema>;

/** Valores del formulario → columnas de product_components (respeta los checks de la base). */
export function toComponentPayload(v: ComponentFormValues, laborRateId: string | null) {
  switch (v.kind) {
    case 'ingredient':
    case 'packaging':
      return { kind: v.kind, ingredient_id: v.ingredientId, labor_rate_id: null, quantity: parseLocaleNumber(v.quantity)!, unit: v.unit, fixed_amount: null, label: null };
    case 'labor':
      return { kind: v.kind, ingredient_id: null, labor_rate_id: laborRateId, quantity: parseLocaleNumber(v.quantity)!, unit: v.unit, fixed_amount: null, label: null };
    case 'other':
      return { kind: v.kind, ingredient_id: null, labor_rate_id: null, quantity: null, unit: null, fixed_amount: parseLocaleNumber(v.amount)!, label: v.label.trim() };
  }
}
