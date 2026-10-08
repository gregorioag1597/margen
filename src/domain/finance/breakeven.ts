import { safeDivide, sum, ZERO, type Dec } from './money';
import { fail, ok, type Result } from './result';

/** Un producto dentro del mix de ventas actual. */
export interface MixItem {
  price: Dec;
  /** Contribución por unidad (precio − directo − costos de venta). */
  contribution: Dec;
  monthlyUnits: Dec;
}

export interface MixTotals {
  revenue: Dec;
  contribution: Dec;
  units: Dec;
}

export function summarizeMix(mix: readonly MixItem[]): MixTotals {
  return {
    revenue: sum(mix.map((m) => m.price.times(m.monthlyUnits))),
    contribution: sum(mix.map((m) => m.contribution.times(m.monthlyUnits))),
    units: sum(mix.map((m) => m.monthlyUnits)),
  };
}

/** Ganancia mensual = Σ contribución × ventas − costos fijos. */
export function calculateMonthlyProfit(mix: readonly MixItem[], fixedCosts: Dec): Dec {
  return summarizeMix(mix).contribution.minus(fixedCosts);
}

export interface RevenueTarget {
  /** Facturación mensual necesaria. */
  revenue: Dec;
  /** Unidades aproximadas (mismo mix que hoy). */
  units: Dec;
  /** Ratio de contribución del mix: cuánto de cada $ vendido cubre fijos. */
  contributionRatio: Dec;
}

/**
 * Facturación necesaria para cubrir fijos + una ganancia objetivo,
 * suponiendo el mix de ventas actual.
 *   facturación = (fijos + objetivo) ÷ (Σ contribución ÷ Σ facturación)
 *   unidades    = (fijos + objetivo) ÷ (Σ contribución ÷ Σ unidades)
 */
export function calculateRequiredRevenue(
  fixedCosts: Dec,
  targetProfit: Dec,
  mix: readonly MixItem[],
): Result<RevenueTarget> {
  if (targetProfit.lt(0) || fixedCosts.lt(0)) return fail('INVALID_INPUT');

  const totals = summarizeMix(mix);
  if (totals.revenue.isZero() || totals.units.isZero()) return fail('NO_SALES_DATA');
  if (!totals.contribution.gt(0)) return fail('NO_CONTRIBUTION');

  const needed = fixedCosts.plus(targetProfit);
  const ratio = totals.contribution.div(totals.revenue);
  const perUnit = totals.contribution.div(totals.units);

  return ok({
    revenue: needed.div(ratio),
    units: safeDivide(needed, perUnit) ?? ZERO,
    contributionRatio: ratio,
  });
}

/** Punto de equilibrio: facturación con la que la ganancia es 0. */
export function calculateBreakEven(fixedCosts: Dec, mix: readonly MixItem[]): Result<RevenueTarget> {
  return calculateRequiredRevenue(fixedCosts, ZERO, mix);
}

export interface ProfitGoal extends RevenueTarget {
  currentRevenue: Dec;
  /** Cuánto más hay que facturar (negativo = ya lo superás). */
  revenueGap: Dec;
  currentProfit: Dec;
}

/** "Quiero ganar X por mes." */
export function calculateProfitGoal(
  fixedCosts: Dec,
  targetProfit: Dec,
  mix: readonly MixItem[],
): Result<ProfitGoal> {
  const required = calculateRequiredRevenue(fixedCosts, targetProfit, mix);
  if (!required.ok) return required;
  const totals = summarizeMix(mix);
  return ok({
    ...required.value,
    currentRevenue: totals.revenue,
    revenueGap: required.value.revenue.minus(totals.revenue),
    currentProfit: totals.contribution.minus(fixedCosts),
  });
}
