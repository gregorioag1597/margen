import {
  calculateIngredientPriceImpact,
  type AffectedProduct,
  type BusinessSnapshot,
  type Dec,
  type IngredientPriceImpact,
  type UnitCode,
} from '@/domain/finance';
import { parseLocaleNumber, percentInputToFraction } from '@/lib/number-input';

export type ImpactDirection = 'up' | 'down' | 'none';

export interface ImpactView {
  impact: IngredientPriceImpact;
  direction: ImpactDirection;
  affectedCount: number;
  /** Positivo = ganancia que se pierde por mes; negativo = ganancia extra. */
  monthlyProfitLost: Dec;
  products: (AffectedProduct & {
    /** Precio sugerido: mantener el margen previo o, si era negativo, el recomendado. */
    suggestedPrice: Dec | null;
    suggestionKind: 'keep-margin' | 'recommended' | null;
  })[];
}

/**
 * Impacto de cambiar el precio de un insumo, a partir de lo que el usuario
 * está escribiendo en el formulario. null si no hay cambio o los datos no alcanzan.
 */
export function previewIngredientImpact(
  snapshot: BusinessSnapshot,
  ingredientId: string,
  form: { purchaseQty: string; purchaseUnit: UnitCode; purchasePrice: string; wastePercent?: string },
): ImpactView | null {
  const purchasePrice = parseLocaleNumber(form.purchasePrice);
  const purchaseQty = parseLocaleNumber(form.purchaseQty);
  if (purchasePrice === null || purchaseQty === null) return null;
  // Merma escrita en % ("20"); vacío = 0; inválida = no se puede previsualizar.
  let wastePct: string | undefined;
  if (form.wastePercent !== undefined) {
    const w = form.wastePercent.trim() === '' ? '0' : percentInputToFraction(form.wastePercent);
    if (w === null) return null;
    wastePct = w;
  }

  const result = calculateIngredientPriceImpact(snapshot, ingredientId, {
    purchasePrice,
    purchaseQty,
    purchaseUnit: form.purchaseUnit,
    ...(wastePct !== undefined && { wastePct }),
  });
  if (!result.ok) return null;
  const impact = result.value;

  const diff = impact.unitCostAfter.minus(impact.unitCostBefore);
  const direction: ImpactDirection = diff.gt(0) ? 'up' : diff.lt(0) ? 'down' : 'none';

  return {
    impact,
    direction,
    affectedCount: impact.affectedProducts.length,
    monthlyProfitLost: impact.monthlyProfitLost,
    products: impact.affectedProducts.map((p) => {
      const suggestedPrice = p.priceToKeepMargin ?? p.recommendedPrice;
      return {
        ...p,
        suggestedPrice,
        suggestionKind: p.priceToKeepMargin ? 'keep-margin' : p.recommendedPrice ? 'recommended' : null,
      };
    }),
  };
}
