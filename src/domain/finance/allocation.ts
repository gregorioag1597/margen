import { safeDivide, sum, ZERO, type Dec } from './money';
import type { FixedCostAllocationMethod } from './types';

export interface AllocationInput {
  productId: string;
  directCost: Dec;
  monthlyUnits: Dec;
}

export interface ProductAllocation {
  /** Asignación estimada por unidad. null si no hay base para repartir. */
  perUnit: Dec | null;
  /** Asignación mensual (perUnit × ventas). 0 si el producto no tiene ventas. */
  monthly: Dec;
  /** Parte de los costos fijos que absorbe el producto (0 a 1). */
  share: Dec;
}

export interface AllocationResult {
  method: FixedCostAllocationMethod;
  byProduct: Map<string, ProductAllocation>;
  /** False si no se pudo repartir (no hay ventas ni costos directos). */
  available: boolean;
}

/**
 * Asignación estimada de costos fijos.
 *
 * Método 'direct_cost_weighted': cada producto absorbe costos fijos en
 * proporción a (costo directo × ventas estimadas). No usa el precio, así el
 * precio recomendado no queda circular.
 *
 *   tasa       = fijos ÷ Σ(D_j × q_j)          ($ de fijos por $ de costo directo)
 *   por unidad = tasa × D_i
 *
 * Un producto sin ventas no entra en el reparto, pero igual recibe una
 * asignación por unidad de referencia (tasa × D_i) para poder estimar su precio.
 * Si nadie tiene peso (sin ventas o todo con costo 0), se reparte por unidades.
 */
export function calculateFixedCostAllocation(
  fixedCostsTotal: Dec,
  products: readonly AllocationInput[],
  method: FixedCostAllocationMethod = 'direct_cost_weighted',
): AllocationResult {
  const byProduct = new Map<string, ProductAllocation>();

  if (fixedCostsTotal.isZero()) {
    for (const p of products) byProduct.set(p.productId, { perUnit: ZERO, monthly: ZERO, share: ZERO });
    return { method, byProduct, available: true };
  }

  const weights = products.map((p) => p.directCost.times(p.monthlyUnits));
  const totalWeight = sum(weights);

  if (!totalWeight.isZero()) {
    const rate = fixedCostsTotal.div(totalWeight);
    products.forEach((p, i) => {
      const perUnit = rate.times(p.directCost);
      byProduct.set(p.productId, {
        perUnit,
        monthly: perUnit.times(p.monthlyUnits),
        share: weights[i]!.div(totalWeight),
      });
    });
    return { method, byProduct, available: true };
  }

  // Respaldo: hay ventas pero ningún costo directo → repartir por unidades.
  const totalUnits = sum(products.map((p) => p.monthlyUnits));
  const perUnitFallback = safeDivide(fixedCostsTotal, totalUnits);
  for (const p of products) {
    byProduct.set(p.productId, {
      perUnit: perUnitFallback,
      monthly: perUnitFallback ? perUnitFallback.times(p.monthlyUnits) : ZERO,
      share: perUnitFallback ? p.monthlyUnits.div(totalUnits) : ZERO,
    });
  }
  return { method, byProduct, available: perUnitFallback !== null };
}
