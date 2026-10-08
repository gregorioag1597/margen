import { describe, expect, it } from 'vitest';
import { buildBusinessModel, dec, DEMO_SNAPSHOT } from '@/domain/finance';
import { buildDashboard, buildProfitGoal } from './dashboard-view';

const money = (d: { toFixed: (n: number) => string } | null | undefined) => (d ? d.toFixed(2) : null);

describe('Resumen de la Pastelería Demo', () => {
  const model = buildBusinessModel(DEMO_SNAPSHOT);
  const view = buildDashboard(model);

  it('las 5 métricas principales', () => {
    expect(money(view.revenue)).toBe('5790000.00');
    expect(money(view.profit)).toBe('1205713.30');
    expect(view.averageMargin!.toFixed(4)).toBe('0.2082');
    expect(money(view.fixedCosts)).toBe('630000.00');
    expect(view.breakEven.ok && money(view.breakEven.value.revenue)).toBe('1987075.00');
  });

  it('cuánto supera el punto de equilibrio', () => {
    expect(view.breakEven.ok && money(view.breakEven.value.cushion)).toBe('3802925.00');
  });

  it('productos que necesitan atención: peor margen primero', () => {
    expect(view.attention.map((p) => p.productId)).toEqual(['brownie', 'torta', 'alfajor']);
  });

  it('rankings distintos: más ganancia (alfajor) vs mayor margen (cookie)', () => {
    expect(view.byProfit[0]!.productId).toBe('alfajor');
    expect(view.byMargin[0]!.productId).toBe('cookie');
    expect(view.marginLeaderDiffers).toBe(true);
    expect(money(view.maxMonthlyProfit)).toBe('529046.27');
  });
});

describe('objetivo de ganancia', () => {
  const model = buildBusinessModel(DEMO_SNAPSHOT);

  it('quiero ganar $3.000.000 por mes', () => {
    const goal = buildProfitGoal(model, dec(3_000_000));
    expect(goal.ok).toBe(true);
    if (goal.ok) {
      // (630.000 + 3.000.000) ÷ (1.835.713,30 ÷ 5.790.000)
      // = equilibrio $1.987.075 × (3.630.000 ÷ 630.000)
      expect(money(goal.requiredRevenue)).toBe('11449336.89');
      expect(money(goal.gap)).toBe('5659336.89');
      expect(goal.reached).toBe(false);
    }
  });

  it('un objetivo menor a la ganancia actual ya está cumplido', () => {
    const goal = buildProfitGoal(model, dec(1_000_000));
    expect(goal.ok && goal.reached).toBe(true);
  });

  it('negocio sin ventas → error comprensible', () => {
    const empty = buildBusinessModel({ ...DEMO_SNAPSHOT, products: [] });
    const goal = buildProfitGoal(empty, dec(100));
    expect(goal.ok).toBe(false);
    if (!goal.ok) expect(goal.code).toBe('NO_SALES_DATA');
    expect(buildDashboard(empty).hasProducts).toBe(false);
  });
});
