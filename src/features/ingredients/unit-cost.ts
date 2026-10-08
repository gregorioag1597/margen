import { calculateIngredientUnitCost, dec, type Dec, type UnitCode } from '@/domain/finance';
import { parseLocaleNumber } from '@/lib/number-input';
import { BASE_UNIT_BY_UNIT } from '@/lib/format';

export interface UnitCostView {
  /** Costo por unidad base (g, ml, unidad, cm, min). */
  perBase: Dec;
  baseUnit: UnitCode;
  /** Costo por unidad de compra (kg, l…), si es distinta de la base. */
  perPurchaseUnit: Dec | null;
  purchaseUnit: UnitCode;
}

/** Costo unitario para mostrar. Usa el motor; null si los datos no alcanzan. */
export function getUnitCostView(purchaseQty: string, purchaseUnit: UnitCode, purchasePrice: string): UnitCostView | null {
  const qty = parseLocaleNumber(purchaseQty) ?? purchaseQty;
  const price = parseLocaleNumber(purchasePrice) ?? purchasePrice;
  const result = calculateIngredientUnitCost({ purchaseQty: qty, purchaseUnit, purchasePrice: price });
  if (!result.ok) return null;
  const baseUnit = BASE_UNIT_BY_UNIT[purchaseUnit];
  return {
    perBase: result.value,
    baseUnit,
    perPurchaseUnit: baseUnit === purchaseUnit ? null : dec(price).div(dec(qty)),
    purchaseUnit,
  };
}
