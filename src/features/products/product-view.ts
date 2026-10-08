import {
  calculateRecommendedPrice,
  calculateVariableCost,
  evaluatePrice,
  roundRecommendedPrice,
  ZERO,
  type Dec,
  type FinanceErrorCode,
  type ProductEconomics,
} from '@/domain/finance';

export interface BreakdownLine {
  label: string;
  amount: Dec;
  detail?: string;
}

/** Desglose para la ficha: directos / de venta / fijos asignados. Sin cálculos en JSX. */
export function buildCostBreakdown(p: ProductEconomics) {
  const direct = p.directCost;
  const directLines: BreakdownLine[] = direct
    ? [
        { label: 'Materia prima', amount: direct.rawMaterials },
        { label: 'Packaging', amount: direct.packaging },
        { label: 'Mano de obra', amount: direct.labor },
        { label: 'Otros costos directos', amount: direct.other },
      ].filter((l) => !l.amount.isZero())
    : [];

  // Cada costo de venta al precio actual (si no hay precio, solo se informa el %).
  const saleLines: (BreakdownLine & { percent: Dec })[] = p.variable.applied.map((a) => ({
    label: a.name,
    percent: a.effectivePercent,
    amount: p.price ? calculateVariableCost(p.price, { percent: a.effectivePercent, perUnit: a.effectivePerUnit }) : a.effectivePerUnit,
  }));

  return {
    directLines,
    directTotal: direct?.total ?? ZERO,
    saleLines,
    saleTotal: p.variableCostPerUnit,
    fixedPerUnit: p.fixedAllocationPerUnit,
    totalCost: p.totalCostPerUnit,
  };
}

export interface RecommendationView {
  ok: true;
  recommended: Dec;
  exact: Dec;
  difference: Dec | null;
  marginAtRecommended: Dec | null;
}

export type RecommendationResult =
  | RecommendationView
  | { ok: false; code: FinanceErrorCode; maxAchievableMargin?: string };

/** Precio recomendado para un margen objetivo cualquiera (los presets 20/30/40 o personalizado). */
export function recommendForMargin(p: ProductEconomics, targetMargin: Dec, roundingStep: Dec): RecommendationResult {
  if (!p.directCost) return { ok: false, code: p.error?.code ?? 'INVALID_INPUT' };
  const base = {
    directCost: p.directCost.total,
    fixedPerUnit: p.fixedAllocationPerUnit ?? ZERO,
    variablePercent: p.variable.percent,
    variablePerUnit: p.variable.perUnit,
  };
  const exact = calculateRecommendedPrice({ ...base, targetMargin });
  if (!exact.ok) return { ok: false, code: exact.error.code, maxAchievableMargin: exact.error.meta?.maxAchievableMargin };

  const recommended = roundRecommendedPrice(exact.value, roundingStep);
  const evaluation = evaluatePrice({ ...base, price: recommended });
  return {
    ok: true,
    recommended,
    exact: exact.value,
    difference: p.price ? recommended.minus(p.price) : null,
    marginAtRecommended: evaluation.ok ? evaluation.value.margin : null,
  };
}
