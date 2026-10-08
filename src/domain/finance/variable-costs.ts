import { dec, sum, type Dec } from './money';
import type { VariableCost } from './types';

export interface AppliedVariableCost {
  id: string;
  name: string;
  /** % efectivo = percentOfSale × shareOfSales. */
  effectivePercent: Dec;
  /** Monto por unidad efectivo = amountPerUnit × shareOfSales. */
  effectivePerUnit: Dec;
}

export interface VariableCostRates {
  /** Suma de % efectivos sobre el precio (fracción). */
  percent: Dec;
  /** Suma de montos fijos efectivos por unidad. */
  perUnit: Dec;
  applied: AppliedVariableCost[];
}

/**
 * Qué costos variables aplican a un producto y con qué peso.
 * Ej.: MercadoLibre 15 %, solo en alfajores, en el 60 % de sus ventas
 * → 9 % efectivo sobre el precio del alfajor.
 */
export function resolveVariableCostsForProduct(
  productId: string,
  variableCosts: readonly VariableCost[],
): VariableCostRates {
  const applied = variableCosts
    .filter((vc) => vc.isActive)
    .filter((vc) => vc.appliesTo === 'all' || vc.productIds.includes(productId))
    .map((vc) => {
      const share = dec(vc.shareOfSales);
      return {
        id: vc.id,
        name: vc.name,
        effectivePercent: dec(vc.percentOfSale).times(share),
        effectivePerUnit: dec(vc.amountPerUnit).times(share),
      };
    });

  return {
    percent: sum(applied.map((a) => a.effectivePercent)),
    perUnit: sum(applied.map((a) => a.effectivePerUnit)),
    applied,
  };
}

/** Costo de venta por unidad a un precio dado: precio × % + monto por unidad. */
export function calculateVariableCost(price: Dec, rates: Pick<VariableCostRates, 'percent' | 'perUnit'>): Dec {
  return price.times(rates.percent).plus(rates.perUnit);
}
