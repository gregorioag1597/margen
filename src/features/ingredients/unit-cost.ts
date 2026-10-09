import { calculateIngredientUnitCost, calculateIngredientUsableCost, dec, type Dec, type UnitCode } from '@/domain/finance';
import { parseLocaleNumber, percentInputToFraction } from '@/lib/number-input';
import { BASE_UNIT_BY_UNIT } from '@/lib/format';

export interface UnitCostView {
  /** Costo de compra por unidad base (g, ml, unidad, cm, min). */
  perBase: Dec;
  /** Costo por unidad base USABLE (con merma). null si no hay merma. */
  usablePerBase: Dec | null;
  waste: Dec;
  baseUnit: UnitCode;
  /** Costo por unidad de compra (kg, l…), si es distinta de la base. */
  perPurchaseUnit: Dec | null;
  purchaseUnit: UnitCode;
}

/**
 * Costo unitario para mostrar. Usa el motor; null si los datos no alcanzan.
 * `waste` acepta la fracción guardada ("0.2") o, con `wasteIsPercent`, lo que
 * escribe el usuario en el formulario ("20").
 */
export function getUnitCostView(
  purchaseQty: string,
  purchaseUnit: UnitCode,
  purchasePrice: string,
  waste = '0',
  wasteIsPercent = false,
): UnitCostView | null {
  const qty = parseLocaleNumber(purchaseQty) ?? purchaseQty;
  const price = parseLocaleNumber(purchasePrice) ?? purchasePrice;
  const wasteFraction = waste.trim() === '' ? '0' : wasteIsPercent ? percentInputToFraction(waste) : waste;
  const base = { purchaseQty: qty, purchaseUnit, purchasePrice: price };

  const result = calculateIngredientUnitCost(base);
  if (!result.ok) return null;
  const usable = wasteFraction ? calculateIngredientUsableCost({ ...base, wastePct: wasteFraction }) : null;
  const wasteDec = usable?.ok ? dec(wasteFraction!) : dec(0);
  const baseUnit = BASE_UNIT_BY_UNIT[purchaseUnit];
  return {
    perBase: result.value,
    usablePerBase: usable?.ok && wasteDec.gt(0) ? usable.value : null,
    waste: wasteDec,
    baseUnit,
    perPurchaseUnit: baseUnit === purchaseUnit ? null : dec(price).div(dec(qty)),
    purchaseUnit,
  };
}
