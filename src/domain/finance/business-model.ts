import { calculateFixedCostAllocation } from './allocation';
import { calculateBreakEven, summarizeMix, type MixItem, type RevenueTarget } from './breakeven';
import { buildCostLookup, calculateProductDirectCost, type DirectCostBreakdown } from './components';
import { resolveSettings, type ResolvedSettings } from './config';
import { dec, parseDecimal, safeDivide, sum, ZERO, type Dec } from './money';
import {
  calculateContributionMargin,
  calculateMargin,
  calculateMarkup,
  calculateRecommendedPrice,
  getMarginStatus,
  roundRecommendedPrice,
  type MarginStatus,
} from './pricing';
import { fail, ok, type FinanceError, type FinanceWarning, type Result } from './result';
import type { BusinessSnapshot, Product } from './types';
import { calculateVariableCost, resolveVariableCostsForProduct, type VariableCostRates } from './variable-costs';

export interface RecommendedPrice {
  /** Resultado exacto de la fórmula. */
  exact: Dec;
  /** Redondeado hacia arriba con roundRecommendedPrice(). */
  rounded: Dec;
}

export interface ProductEconomics {
  productId: string;
  name: string;
  category: string | null;
  /** Error que impide calcular el costo (ej. insumo con unidad incompatible). */
  error: FinanceError | null;
  price: Dec | null;
  monthlyUnits: Dec;

  /** COSTOS DIRECTOS */
  directCost: DirectCostBreakdown | null;
  /** COSTOS DE VENTA (dependen del precio) */
  variable: VariableCostRates;
  variableCostPerUnit: Dec | null;
  /** COSTOS FIJOS ASIGNADOS: asignación estimada, no es un costo directo. */
  fixedAllocationPerUnit: Dec | null;

  totalCostPerUnit: Dec | null;
  contributionPerUnit: Dec | null;
  profitPerUnit: Dec | null;
  margin: Dec | null;
  markup: Dec | null;
  marginStatus: MarginStatus | null;

  monthlyRevenue: Dec;
  monthlyContribution: Dec;
  monthlyProfit: Dec | null;

  targetMargin: Dec;
  recommendedPrice: Result<RecommendedPrice>;
  /** Precio recomendado redondeado − precio actual. */
  priceGap: Dec | null;
  usesLabor: boolean;
  warnings: FinanceWarning[];
}

export interface BusinessSummary {
  monthlyRevenue: Dec;
  monthlyContribution: Dec;
  fixedCostsTotal: Dec;
  monthlyProfit: Dec;
  /** Ganancia ÷ facturación del mix. null si no hay facturación. */
  averageMargin: Dec | null;
  breakEven: Result<RevenueTarget>;
}

export interface BusinessModel {
  settings: ResolvedSettings;
  products: ProductEconomics[];
  summary: BusinessSummary;
  /** Mix de ventas usado para punto de equilibrio y objetivos. */
  mix: MixItem[];
  warnings: FinanceWarning[];
}

/**
 * Punto de entrada único del motor: foto del negocio → todos los resultados.
 * Lo usan el dashboard, las fichas de producto, el simulador y el impacto
 * de cambio de insumos. Función pura y determinística.
 */
export function buildBusinessModel(snapshot: BusinessSnapshot): BusinessModel {
  const settings = resolveSettings(snapshot.settings, snapshot.currency);
  const lookup = buildCostLookup(snapshot.ingredients, snapshot.laborRates);
  const warnings: FinanceWarning[] = [];

  const fixedCostsTotal = sum(
    snapshot.fixedCosts.filter((f) => f.isActive).map((f) => dec(f.monthlyAmount)),
  );

  // 1. Costos directos
  const direct = snapshot.products.map((product) => ({
    product,
    units: nonNegative(product.monthlyUnits),
    cost: calculateProductDirectCost(product.components, lookup),
  }));

  // 2. Asignación estimada de fijos (no depende del precio)
  const allocation = calculateFixedCostAllocation(
    fixedCostsTotal,
    direct.flatMap((d) =>
      d.cost.ok ? [{ productId: d.product.id, directCost: d.cost.value.total, monthlyUnits: d.units }] : [],
    ),
    settings.allocationMethod,
  );
  if (!allocation.available) warnings.push({ code: 'FIXED_ALLOCATION_UNAVAILABLE' });

  // 3. Economía de cada producto
  const products = direct.map(({ product, units, cost }) =>
    buildProductEconomics(
      product,
      units,
      cost,
      resolveVariableCostsForProduct(product.id, snapshot.variableCosts),
      allocation.byProduct.get(product.id)?.perUnit ?? null,
      settings,
    ),
  );

  // 4. Resumen del negocio (solo productos con precio, costo válido y ventas)
  const mix: MixItem[] = products.flatMap((p) =>
    p.price && p.contributionPerUnit && p.monthlyUnits.gt(0)
      ? [{ price: p.price, contribution: p.contributionPerUnit, monthlyUnits: p.monthlyUnits }]
      : [],
  );
  const totals = summarizeMix(mix);
  const monthlyProfit = totals.contribution.minus(fixedCostsTotal);

  // 5. Avisos de negocio
  const hasSalaries = snapshot.fixedCosts.some(
    (f) => f.isActive && f.category === 'salaries' && dec(f.monthlyAmount).gt(0),
  );
  if (hasSalaries && products.some((p) => p.usesLabor)) {
    warnings.push({ code: 'LABOR_DOUBLE_COUNT_RISK' });
  }
  for (const p of products) warnings.push(...p.warnings);

  return {
    settings,
    products,
    mix,
    summary: {
      monthlyRevenue: totals.revenue,
      monthlyContribution: totals.contribution,
      fixedCostsTotal,
      monthlyProfit,
      averageMargin: safeDivide(monthlyProfit, totals.revenue),
      breakEven: calculateBreakEven(fixedCostsTotal, mix),
    },
    warnings,
  };
}

function buildProductEconomics(
  product: Product,
  units: Dec,
  cost: Result<DirectCostBreakdown>,
  variable: VariableCostRates,
  fixedPerUnit: Dec | null,
  settings: ResolvedSettings,
): ProductEconomics {
  const warnings: FinanceWarning[] = [];
  const price = positiveOrNull(product.price);
  const targetMargin = product.targetMargin === null
    ? settings.defaultTargetMargin
    : (parseDecimal(product.targetMargin) ?? settings.defaultTargetMargin);
  const usesLabor = product.components.some((c) => c.kind === 'labor');

  if (product.components.length === 0) warnings.push({ code: 'NO_COMPONENTS', productId: product.id });
  if (units.isZero()) warnings.push({ code: 'NO_SALES_ESTIMATE', productId: product.id });
  if (price === null) warnings.push({ code: 'NO_PRICE', productId: product.id });
  if (variable.percent.gte(1)) warnings.push({ code: 'VARIABLE_PERCENT_TOO_HIGH', productId: product.id });

  const base = {
    productId: product.id,
    name: product.name,
    category: product.category ?? null,
    price,
    monthlyUnits: units,
    variable,
    fixedAllocationPerUnit: fixedPerUnit,
    targetMargin,
    usesLabor,
    warnings,
  };

  if (!cost.ok) {
    warnings.push({ code: 'PRODUCT_COST_ERROR', productId: product.id, detail: cost.error.code });
    return {
      ...base,
      error: cost.error,
      directCost: null,
      variableCostPerUnit: null,
      totalCostPerUnit: null,
      contributionPerUnit: null,
      profitPerUnit: null,
      margin: null,
      markup: null,
      marginStatus: null,
      monthlyRevenue: ZERO,
      monthlyContribution: ZERO,
      monthlyProfit: null,
      recommendedPrice: fail(cost.error.code, cost.error.detail),
      priceGap: null,
    };
  }

  const directCost = cost.value;
  const fixed = fixedPerUnit ?? ZERO;

  const recommended = calculateRecommendedPrice({
    directCost: directCost.total,
    fixedPerUnit: fixed,
    variablePercent: variable.percent,
    variablePerUnit: variable.perUnit,
    targetMargin,
  });
  const recommendedPrice: Result<RecommendedPrice> = recommended.ok
    ? ok({ exact: recommended.value, rounded: roundRecommendedPrice(recommended.value, settings.roundingStep) })
    : recommended;

  if (price === null) {
    return {
      ...base,
      error: null,
      directCost,
      variableCostPerUnit: null,
      totalCostPerUnit: null,
      contributionPerUnit: null,
      profitPerUnit: null,
      margin: null,
      markup: null,
      marginStatus: null,
      monthlyRevenue: ZERO,
      monthlyContribution: ZERO,
      monthlyProfit: null,
      recommendedPrice,
      priceGap: null,
    };
  }

  const variableCostPerUnit = calculateVariableCost(price, variable);
  const contributionPerUnit = calculateContributionMargin(price, directCost.total, variable.percent, variable.perUnit);
  const profitPerUnit = contributionPerUnit.minus(fixed);
  const totalCostPerUnit = price.minus(profitPerUnit);
  const margin = calculateMargin(price, totalCostPerUnit);
  const markup = calculateMarkup(price, totalCostPerUnit);

  return {
    ...base,
    error: null,
    directCost,
    variableCostPerUnit,
    totalCostPerUnit,
    contributionPerUnit,
    profitPerUnit,
    margin: margin.ok ? margin.value : null,
    markup: markup.ok ? markup.value : null,
    marginStatus: margin.ok ? getMarginStatus(margin.value, settings.thresholds) : null,
    monthlyRevenue: price.times(units),
    monthlyContribution: contributionPerUnit.times(units),
    monthlyProfit: profitPerUnit.times(units),
    recommendedPrice,
    priceGap: recommendedPrice.ok ? recommendedPrice.value.rounded.minus(price) : null,
  };
}

function nonNegative(value: unknown): Dec {
  const parsed = parseDecimal(value);
  return parsed && parsed.gt(0) ? parsed : ZERO;
}

function positiveOrNull(value: unknown): Dec | null {
  const parsed = parseDecimal(value);
  return parsed && parsed.gt(0) ? parsed : null;
}

// ---------------------------------------------------------------------------
// Rankings
// ---------------------------------------------------------------------------

/** Mayor margen % primero. */
export function rankByMargin(products: readonly ProductEconomics[]): ProductEconomics[] {
  return products.filter((p) => p.margin !== null).sort((a, b) => b.margin!.comparedTo(a.margin!));
}

/** Más ganancia mensual primero (no es lo mismo que mayor margen). */
export function rankByMonthlyProfit(products: readonly ProductEconomics[]): ProductEconomics[] {
  return products
    .filter((p) => p.monthlyProfit !== null)
    .sort((a, b) => b.monthlyProfit!.comparedTo(a.monthlyProfit!));
}

/** Productos con margen bajo o negativo, sin precio o con error; peor primero. */
export function productsNeedingAttention(products: readonly ProductEconomics[]): ProductEconomics[] {
  const severity = (p: ProductEconomics) =>
    p.error ? 0 : p.marginStatus === 'negative' ? 1 : p.price === null ? 2 : p.marginStatus === 'low' ? 3 : 9;
  return products
    .filter((p) => severity(p) < 9)
    .sort((a, b) => severity(a) - severity(b) || (a.margin?.comparedTo(b.margin ?? 0) ?? 0));
}
