import { buildBusinessModel, type BusinessModel, type ProductEconomics } from './business-model';
import { calculateIngredientUnitCost } from './components';
import { dec, ONE, safeDivide, ZERO, type Dec, type DecimalInput } from './money';
import { calculateRecommendedPrice, roundRecommendedPrice } from './pricing';
import { fail, ok, type Result } from './result';
import type { BusinessSnapshot, Ingredient, UnitCode } from './types';

/**
 * Cambios que se pueden simular. Se aplican sobre una COPIA del snapshot:
 * simular nunca modifica datos reales.
 * Porcentajes como fracción: 0.10 = +10 %, -0.05 = −5 %.
 */
export type ScenarioChange =
  | { type: 'ingredient_price'; ingredientId: string; purchasePrice: DecimalInput; purchaseQty?: DecimalInput; purchaseUnit?: UnitCode }
  | { type: 'ingredient_price_pct'; ingredientIds: 'all' | string[]; pct: DecimalInput }
  | { type: 'product_price'; productId: string; price: DecimalInput }
  | { type: 'product_price_pct'; productIds: 'all' | string[]; pct: DecimalInput }
  | { type: 'product_volume_pct'; productIds: 'all' | string[]; pct: DecimalInput }
  | { type: 'product_volume'; productId: string; monthlyUnits: DecimalInput }
  | { type: 'fixed_cost_amount'; fixedCostId: string; monthlyAmount: DecimalInput }
  | { type: 'variable_cost_percent'; variableCostId: string; percentOfSale: DecimalInput }
  | { type: 'fixed_costs_pct'; pct: DecimalInput }
  | { type: 'labor_rate'; laborRateId: string; hourlyRate: DecimalInput };

const matches = (ids: 'all' | string[], id: string) => ids === 'all' || ids.includes(id);
const applyPct = (value: DecimalInput, pct: DecimalInput) => dec(value).times(ONE.plus(dec(pct))).toString();

/** Devuelve un snapshot nuevo con los cambios aplicados (el original no se toca). */
export function applyScenarioChanges(snapshot: BusinessSnapshot, changes: readonly ScenarioChange[]): BusinessSnapshot {
  return changes.reduce<BusinessSnapshot>((s, change) => {
    switch (change.type) {
      case 'ingredient_price':
        return {
          ...s,
          ingredients: s.ingredients.map((i) =>
            i.id === change.ingredientId
              ? {
                  ...i,
                  purchasePrice: change.purchasePrice,
                  purchaseQty: change.purchaseQty ?? i.purchaseQty,
                  purchaseUnit: change.purchaseUnit ?? i.purchaseUnit,
                }
              : i,
          ),
        };
      case 'ingredient_price_pct':
        return {
          ...s,
          ingredients: s.ingredients.map((i) =>
            matches(change.ingredientIds, i.id) ? { ...i, purchasePrice: applyPct(i.purchasePrice, change.pct) } : i,
          ),
        };
      case 'product_price':
        return {
          ...s,
          products: s.products.map((p) => (p.id === change.productId ? { ...p, price: change.price } : p)),
        };
      case 'product_price_pct':
        return {
          ...s,
          products: s.products.map((p) =>
            matches(change.productIds, p.id) && p.price !== null ? { ...p, price: applyPct(p.price, change.pct) } : p,
          ),
        };
      case 'product_volume_pct':
        return {
          ...s,
          products: s.products.map((p) =>
            matches(change.productIds, p.id) ? { ...p, monthlyUnits: applyPct(p.monthlyUnits, change.pct) } : p,
          ),
        };
      case 'product_volume':
        return {
          ...s,
          products: s.products.map((p) => (p.id === change.productId ? { ...p, monthlyUnits: change.monthlyUnits } : p)),
        };
      case 'fixed_cost_amount':
        return {
          ...s,
          fixedCosts: s.fixedCosts.map((f) => (f.id === change.fixedCostId ? { ...f, monthlyAmount: change.monthlyAmount } : f)),
        };
      case 'variable_cost_percent':
        return {
          ...s,
          variableCosts: s.variableCosts.map((v) =>
            v.id === change.variableCostId ? { ...v, percentOfSale: change.percentOfSale } : v,
          ),
        };
      case 'fixed_costs_pct':
        return {
          ...s,
          fixedCosts: s.fixedCosts.map((f) => ({ ...f, monthlyAmount: applyPct(f.monthlyAmount, change.pct) })),
        };
      case 'labor_rate':
        return {
          ...s,
          laborRates: s.laborRates.map((r) =>
            r.id === change.laborRateId ? { ...r, hourlyRate: change.hourlyRate } : r,
          ),
        };
    }
  }, snapshot);
}

export interface ProductImpact {
  productId: string;
  name: string;
  before: ProductEconomics;
  after: ProductEconomics;
  directCostChange: Dec | null;
  marginChange: Dec | null;
  monthlyProfitChange: Dec | null;
}

export interface ScenarioImpact {
  before: BusinessModel;
  after: BusinessModel;
  revenueChange: Dec;
  profitChange: Dec;
  /** Cambio de margen promedio en puntos (0.02 = +2 pp). */
  averageMarginChange: Dec | null;
  products: ProductImpact[];
}

const diff = (a: Dec | null, b: Dec | null) => (a !== null && b !== null ? b.minus(a) : null);

/** "¿Qué pasa si…?" Compara el negocio antes y después de los cambios. */
export function calculateScenarioImpact(snapshot: BusinessSnapshot, changes: readonly ScenarioChange[]): ScenarioImpact {
  const before = buildBusinessModel(snapshot);
  const after = buildBusinessModel(applyScenarioChanges(snapshot, changes));
  const afterById = new Map(after.products.map((p) => [p.productId, p]));

  return {
    before,
    after,
    revenueChange: after.summary.monthlyRevenue.minus(before.summary.monthlyRevenue),
    profitChange: after.summary.monthlyProfit.minus(before.summary.monthlyProfit),
    averageMarginChange: diff(before.summary.averageMargin, after.summary.averageMargin),
    products: before.products.map((b) => {
      const a = afterById.get(b.productId)!;
      return {
        productId: b.productId,
        name: b.name,
        before: b,
        after: a,
        directCostChange: diff(b.directCost?.total ?? null, a.directCost?.total ?? null),
        marginChange: diff(b.margin, a.margin),
        monthlyProfitChange: diff(b.monthlyProfit, a.monthlyProfit),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Impacto de cambio de precio de un insumo (caso de uso central)
// ---------------------------------------------------------------------------

export interface AffectedProduct {
  productId: string;
  name: string;
  costBefore: Dec;
  costAfter: Dec;
  /** Aumento del costo directo por unidad. */
  costIncrease: Dec;
  marginBefore: Dec | null;
  marginAfter: Dec | null;
  /** Ganancia mensual que se pierde: aumento de costo × ventas estimadas. */
  monthlyProfitLost: Dec;
  /** Precio para volver al margen que tenía antes del aumento (redondeado). */
  priceToKeepMargin: Dec | null;
  /** Precio recomendado con el margen objetivo, ya con el costo nuevo. */
  recommendedPrice: Dec | null;
  currentPrice: Dec | null;
}

export interface IngredientPriceImpact {
  ingredientId: string;
  unitCostBefore: Dec;
  unitCostAfter: Dec;
  /** Variación del costo unitario (0.2222 = +22,22 %). */
  unitCostChangePct: Dec | null;
  affectedProducts: AffectedProduct[];
  monthlyProfitBefore: Dec;
  monthlyProfitAfter: Dec;
  monthlyProfitLost: Dec;
  scenario: ScenarioImpact;
}

/**
 * Chocolate $18.000 → $22.000: qué productos lo usan, cuánto sube su costo,
 * cómo cambia el margen, cuánta ganancia se pierde y qué precio mantendría
 * el margen. NO cambia precios de venta: solo informa.
 *
 * Nota: con la asignación por costo directo, si sube el costo directo de un
 * producto también sube su parte de costos fijos (y baja la de los demás).
 * Los márgenes reflejan eso; la ganancia perdida no, porque los fijos totales
 * no cambian.
 */
export function calculateIngredientPriceImpact(
  snapshot: BusinessSnapshot,
  ingredientId: string,
  change: { purchasePrice: DecimalInput; purchaseQty?: DecimalInput; purchaseUnit?: UnitCode },
): Result<IngredientPriceImpact> {
  const ingredient = snapshot.ingredients.find((i) => i.id === ingredientId);
  if (!ingredient) return fail('MISSING_REFERENCE', ingredientId);

  const updated: Ingredient = {
    ...ingredient,
    purchasePrice: change.purchasePrice,
    purchaseQty: change.purchaseQty ?? ingredient.purchaseQty,
    purchaseUnit: change.purchaseUnit ?? ingredient.purchaseUnit,
  };
  const unitBefore = calculateIngredientUnitCost(ingredient);
  if (!unitBefore.ok) return unitBefore;
  const unitAfter = calculateIngredientUnitCost(updated);
  if (!unitAfter.ok) return unitAfter;

  const scenario = calculateScenarioImpact(snapshot, [{ type: 'ingredient_price', ingredientId, ...change }]);
  const step = scenario.after.settings.roundingStep;

  const usesIngredient = new Set(
    snapshot.products
      .filter((p) => p.components.some((c) => (c.kind === 'ingredient' || c.kind === 'packaging') && c.ingredientId === ingredientId))
      .map((p) => p.id),
  );

  const affectedProducts: AffectedProduct[] = scenario.products
    .filter((p) => usesIngredient.has(p.productId) && p.before.directCost && p.after.directCost)
    .map((p) => {
      const costBefore = p.before.directCost!.total;
      const costAfter = p.after.directCost!.total;
      const costIncrease = costAfter.minus(costBefore);
      const a = p.after;

      // Mantener el margen previo solo tiene sentido si era ≥ 0.
      let priceToKeepMargin: Dec | null = null;
      if (p.before.margin !== null && !p.before.margin.lt(0)) {
        const keep = calculateRecommendedPrice({
          directCost: costAfter,
          fixedPerUnit: a.fixedAllocationPerUnit ?? ZERO,
          variablePercent: a.variable.percent,
          variablePerUnit: a.variable.perUnit,
          targetMargin: p.before.margin,
        });
        priceToKeepMargin = keep.ok ? roundRecommendedPrice(keep.value, step) : null;
      }

      return {
        productId: p.productId,
        name: p.name,
        costBefore,
        costAfter,
        costIncrease,
        marginBefore: p.before.margin,
        marginAfter: a.margin,
        monthlyProfitLost: a.price ? costIncrease.times(a.monthlyUnits) : ZERO,
        priceToKeepMargin,
        recommendedPrice: a.recommendedPrice.ok ? a.recommendedPrice.value.rounded : null,
        currentPrice: a.price,
      };
    })
    .sort((x, y) => y.monthlyProfitLost.comparedTo(x.monthlyProfitLost));

  return ok({
    ingredientId,
    unitCostBefore: unitBefore.value,
    unitCostAfter: unitAfter.value,
    unitCostChangePct: safeDivide(unitAfter.value.minus(unitBefore.value), unitBefore.value),
    affectedProducts,
    monthlyProfitBefore: scenario.before.summary.monthlyProfit,
    monthlyProfitAfter: scenario.after.summary.monthlyProfit,
    monthlyProfitLost: scenario.before.summary.monthlyProfit.minus(scenario.after.summary.monthlyProfit),
    scenario,
  });
}
