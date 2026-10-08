import { z } from 'zod';
import type { UnitCode } from '@/domain/finance';
import { emptyToNull, localeNumber, optionalText } from '@/lib/form-schemas';
import { parseLocaleNumber } from '@/lib/number-input';

export const UNIT_CODES = ['kg', 'g', 'l', 'ml', 'unit', 'm', 'cm', 'h', 'min'] as const satisfies readonly UnitCode[];

export const ingredientRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  supplier: z.string().nullable(),
  purchase_unit: z.enum(UNIT_CODES),
  purchase_qty: z.coerce.string(),
  purchase_price: z.coerce.string(),
  price_updated_at: z.string(),
  notes: z.string().nullable(),
  archived_at: z.string().nullable(),
});
export type IngredientRow = z.infer<typeof ingredientRowSchema>;

export const ingredientFormSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre.').max(120),
  supplier: optionalText(120),
  purchaseUnit: z.enum(UNIT_CODES),
  purchaseQty: localeNumber({
    required: '¿Cuánto compraste?',
    check: (n) => n.gt(0),
    checkMessage: 'La cantidad tiene que ser mayor a 0.',
  }),
  purchasePrice: localeNumber({
    required: '¿Cuánto pagaste?',
    check: (n) => n.gte(0),
    checkMessage: 'El precio no puede ser negativo.',
  }),
  notes: optionalText(1000),
});
export type IngredientFormValues = z.infer<typeof ingredientFormSchema>;

/** Valores del formulario → columnas de la tabla ingredients. */
export function toIngredientPayload(values: IngredientFormValues) {
  return {
    name: values.name.trim(),
    supplier: emptyToNull(values.supplier),
    purchase_unit: values.purchaseUnit,
    purchase_qty: parseLocaleNumber(values.purchaseQty)!,
    purchase_price: parseLocaleNumber(values.purchasePrice)!,
    notes: emptyToNull(values.notes),
  };
}
