import {
  calculateProfitGoal,
  productsNeedingAttention,
  rankByMargin,
  rankByMonthlyProfit,
  ZERO,
  type BusinessModel,
  type Dec,
  type FinanceErrorCode,
  type ProductEconomics,
} from '@/domain/finance';

export interface BreakEvenView {
  revenue: Dec;
  units: Dec;
  /** Facturación actual − equilibrio (positivo = ya lo superás). */
  cushion: Dec;
}

export interface DashboardView {
  revenue: Dec;
  profit: Dec;
  averageMargin: Dec | null;
  fixedCosts: Dec;
  breakEven: { ok: true; value: BreakEvenView } | { ok: false; code: FinanceErrorCode };
  attention: ProductEconomics[];
  byProfit: ProductEconomics[];
  byMargin: ProductEconomics[];
  /** Mayor valor absoluto de ganancia mensual (para dibujar barras proporcionales). */
  maxMonthlyProfit: Dec;
  /** True si el producto con más margen no es el que más ganancia deja. */
  marginLeaderDiffers: boolean;
  hasProducts: boolean;
}

/** Todo lo que muestra "Resumen", derivado del modelo. Sin cálculos en JSX. */
export function buildDashboard(model: BusinessModel): DashboardView {
  const s = model.summary;
  const byProfit = rankByMonthlyProfit(model.products);
  const byMargin = rankByMargin(model.products);

  return {
    revenue: s.monthlyRevenue,
    profit: s.monthlyProfit,
    averageMargin: s.averageMargin,
    fixedCosts: s.fixedCostsTotal,
    breakEven: s.breakEven.ok
      ? {
          ok: true,
          value: {
            revenue: s.breakEven.value.revenue,
            units: s.breakEven.value.units,
            cushion: s.monthlyRevenue.minus(s.breakEven.value.revenue),
          },
        }
      : { ok: false, code: s.breakEven.error.code },
    attention: productsNeedingAttention(model.products).slice(0, 5),
    byProfit,
    byMargin,
    maxMonthlyProfit: byProfit.reduce<Dec>((max, p) => (p.monthlyProfit!.abs().gt(max) ? p.monthlyProfit!.abs() : max), ZERO),
    marginLeaderDiffers: Boolean(byProfit[0] && byMargin[0] && byProfit[0].productId !== byMargin[0].productId),
    hasProducts: model.products.length > 0,
  };
}

export type ProfitGoalView =
  | { ok: true; currentRevenue: Dec; requiredRevenue: Dec; gap: Dec; units: Dec; currentProfit: Dec; reached: boolean }
  | { ok: false; code: FinanceErrorCode };

/** "Quiero ganar X por mes." */
export function buildProfitGoal(model: BusinessModel, targetProfit: Dec): ProfitGoalView {
  const goal = calculateProfitGoal(model.summary.fixedCostsTotal, targetProfit, model.mix);
  if (!goal.ok) return { ok: false, code: goal.error.code };
  return {
    ok: true,
    currentRevenue: goal.value.currentRevenue,
    requiredRevenue: goal.value.revenue,
    gap: goal.value.revenueGap,
    units: goal.value.units,
    currentProfit: goal.value.currentProfit,
    reached: !goal.value.revenueGap.gt(0),
  };
}
