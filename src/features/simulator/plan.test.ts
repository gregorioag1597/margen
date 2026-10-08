import { describe, expect, it } from 'vitest';
import { calculateScenarioImpact, DEMO_SNAPSHOT } from '@/domain/finance';
import { buildScenarioPlan, EMPTY_LEVERS, planToChanges, planToRpcItems } from './plan';

const money = (d: { toFixed: (n: number) => string }) => d.toFixed(2);
const simulate = (levers: Partial<typeof EMPTY_LEVERS>) => {
  const { plan, errors } = buildScenarioPlan(DEMO_SNAPSHOT, { ...EMPTY_LEVERS, ...levers });
  return { plan, errors, impact: calculateScenarioImpact(DEMO_SNAPSHOT, planToChanges(plan)) };
};

describe('simulador: palancas → plan concreto → impacto', () => {
  it('"¿Qué pasa si aumento mis precios 10 %?"', () => {
    const { plan, impact } = simulate({ pricePct: '10' });
    expect(plan.map((p) => `${p.label}: ${p.from} → ${p.to}`)).toEqual([
      'Alfajor Premium: 6000 → 6600',
      'Brownie: 4500 → 4950',
      'Torta Chocolate: 32000 → 35200',
      'Cookie de chocolate: 1800 → 1980',
    ]);
    // Mismo resultado que el test del motor (Fase 2)
    expect(money(impact.revenueChange)).toBe('579000.00');
    expect(money(impact.profitChange)).toBe('499086.33');
  });

  it('precios solo en productos elegidos', () => {
    const { plan } = simulate({ pricePct: '10', priceProductIds: ['alfajor'] });
    expect(plan.map((p) => p.id)).toEqual(['alfajor']);
  });

  it('ventas +10 % se redondean a unidades enteras (lo que se guardará)', () => {
    const { plan } = simulate({ volumePct: '10' });
    expect(plan.map((p) => p.to.toString())).toEqual(['440', '330', '33', '660']);
  });

  it('costos fijos +10 % → −$63.000 de ganancia', () => {
    const { impact } = simulate({ fixedCostsPct: '10' });
    expect(money(impact.profitChange)).toBe('-63000.00');
  });

  it('comisión: Mercado Pago a 8 %', () => {
    const { plan, impact } = simulate({ commission: { variableCostId: 'mp', newPercent: '8' } });
    expect(plan[0]!.to.toString()).toBe('0.08');
    expect(money(impact.profitChange)).toBe('-65253.30');
  });

  it('insumos +10 % solo toca insumos usados en productos', () => {
    const { plan, impact } = simulate({ ingredientCostPct: '10' });
    expect(plan).toHaveLength(8);
    expect(impact.profitChange.lt(0)).toBe(true);
  });

  it('palancas combinadas', () => {
    const { plan } = simulate({ pricePct: '10', fixedCostsPct: '5', volumePct: '-5' });
    expect(new Set(plan.map((p) => p.target))).toEqual(new Set(['product_price', 'product_units', 'fixed_cost_amount']));
  });

  it('valores inválidos → error en esa palanca, sin plan', () => {
    const { plan, errors } = simulate({ pricePct: '-100', volumePct: 'abc' });
    expect(errors.pricePct).toBeDefined();
    expect(errors.volumePct).toBeDefined();
    expect(plan).toHaveLength(0);
  });

  it('sin palancas no hay cambios', () => {
    const { plan, impact } = simulate({});
    expect(plan).toHaveLength(0);
    expect(impact.profitChange.isZero()).toBe(true);
  });

  it('el payload para la base usa valores absolutos', () => {
    const { plan } = simulate({ pricePct: '10', priceProductIds: ['alfajor'] });
    expect(planToRpcItems(plan)).toEqual([{ target: 'product_price', id: 'alfajor', value: '6600' }]);
  });
});
