import { z } from 'zod';
import type { UnitCode } from '@/domain/finance';
import { emptyToNull, localeNumber, optionalText } from '@/lib/form-schemas';
import { parseLocaleNumber, percentInputToFraction } from '@/lib/number-input';

export const UNIT_CODES = ['kg', 'g', 'l', 'ml', 'unit', 'm', 'cm', 'h', 'min'] as const satisfies readonly UnitCode[];

export const ingredientRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  supplier: z.string().nullable(),
  purchase_unit: z.enum(UNIT_CODES),
  purchase_qty: z.coerce.string(),
  purchase_price: z.coerce.string(),
  /** Merma (fracción). */
  waste_pct: z.coerce.string().default('0'),
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
  /** Merma en % como la escribe el usuario ("20"). Vacío = 0. */
  wastePercent: localeNumber({ check: (n) => n.gte(0) && n.lte(90), checkMessage: 'Entre 0 y 90 %.' }),
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
    waste_pct: values.wastePercent.trim() === '' ? '0' : percentInputToFraction(values.wastePercent)!,
    notes: emptyToNull(values.notes),
  };
}
