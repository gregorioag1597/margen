import { describe, expect, it } from 'vitest';
import {
  buildBusinessModel,
  calculateIngredientPriceImpact,
  calculateScenarioImpact,
  DEMO_SNAPSHOT,
} from '..';
import { expectError, expectNoNaNOrInfinity, money, pct, unwrap } from './helpers';

describe('impacto de cambio de insumo: chocolate $18.000 → $22.000', () => {
  const impact = unwrap(calculateIngredientPriceImpact(DEMO_SNAPSHOT, 'choc', { purchasePrice: 22000 }));

  it('el costo por gramo pasa de $18 a $22 (+22,22 %)', () => {
    expect(impact.unitCostBefore.toString()).toBe('18');
    expect(impact.unitCostAfter.toString()).toBe('22');
    expect(pct(impact.unitCostChangePct)).toBe('0.2222');
  });

  it('4 productos afectados, ordenados por ganancia perdida', () => {
    expect(impact.affectedProducts.map((p) => p.productId)).toEqual(['alfajor', 'brownie', 'cookie', 'torta']);
  });

  it('aumento de costo por unidad = gramos de chocolate × $4', () => {
    const inc = Object.fromEntries(impact.affectedProducts.map((p) => [p.productId, p.costIncrease.toString()]));
    expect(inc).toEqual({ alfajor: '320', brownie: '240', torta: '1200', cookie: '80' });
  });

  it('ganancia mensual perdida: $128.000 + $72.000 + $36.000 + $48.000 = $284.000', () => {
    const lost = Object.fromEntries(impact.affectedProducts.map((p) => [p.productId, money(p.monthlyProfitLost)]));
    expect(lost).toEqual({ alfajor: '128000.00', brownie: '72000.00', torta: '36000.00', cookie: '48000.00' });
    expect(money(impact.monthlyProfitLost)).toBe('284000.00');
  });

  it('el margen baja en todos los productos afectados', () => {
    for (const p of impact.affectedProducts) expect(p.marginAfter!.lt(p.marginBefore!)).toBe(true);
  });

  it('el precio para mantener el margen realmente lo mantiene (o lo supera por el redondeo)', () => {
    const alfajor = impact.affectedProducts.find((p) => p.productId === 'alfajor')!;
    expect(alfajor.priceToKeepMargin!.gt(alfajor.currentPrice!)).toBe(true);

    const after = buildBusinessModel({
      ...DEMO_SNAPSHOT,
      ingredients: DEMO_SNAPSHOT.ingredients.map((i) => (i.id === 'choc' ? { ...i, purchasePrice: 22000 } : i)),
      products: DEMO_SNAPSHOT.products.map((p) =>
        p.id === 'alfajor' ? { ...p, price: alfajor.priceToKeepMargin!.toString() } : p,
      ),
    });
    const newMargin = after.products.find((p) => p.productId === 'alfajor')!.margin!;
    expect(newMargin.gte(alfajor.marginBefore!)).toBe(true);
  });

  it('NO cambia el precio de venta ni los datos originales', () => {
    expect(impact.affectedProducts.find((p) => p.productId === 'alfajor')!.currentPrice!.toString()).toBe('6000');
    expect(DEMO_SNAPSHOT.ingredients.find((i) => i.id === 'choc')!.purchasePrice).toBe('18000');
  });

  it('solo aparecen los productos que usan el insumo (la caja no está en la cookie)', () => {
    const caja = unwrap(calculateIngredientPriceImpact(DEMO_SNAPSHOT, 'caja', { purchasePrice: 30000 }));
    expect(caja.affectedProducts.map((p) => p.productId).sort()).toEqual(['alfajor', 'brownie', 'torta']);
  });

  it('insumo inexistente o cantidad 0 → error', () => {
    expectError(calculateIngredientPriceImpact(DEMO_SNAPSHOT, 'nope', { purchasePrice: 1 }), 'MISSING_REFERENCE');
    expectError(
      calculateIngredientPriceImpact(DEMO_SNAPSHOT, 'choc', { purchasePrice: 1, purchaseQty: 0 }),
      'INVALID_QUANTITY',
    );
  });

  it('sin NaN ni Infinity', () => {
    expectNoNaNOrInfinity(impact.affectedProducts);
  });
});

describe('simulador de escenarios', () => {
  it('"¿Qué pasa si aumento mis precios 10 %?"', () => {
    const s = calculateScenarioImpact(DEMO_SNAPSHOT, [{ type: 'product_price_pct', productIds: 'all', pct: '0.10' }]);
    expect(money(s.revenueChange)).toBe('579000.00');
    // Cada $ extra pierde el % variable: Σ ΔP × (1 − %var) × ventas
    expect(money(s.profitChange)).toBe('499086.33');
    expect(s.averageMarginChange!.gt(0)).toBe(true);
  });

  it('simular no modifica los datos reales', () => {
    calculateScenarioImpact(DEMO_SNAPSHOT, [{ type: 'product_price_pct', productIds: 'all', pct: '0.10' }]);
    expect(DEMO_SNAPSHOT.products[0]!.price).toBe('6000');
  });

  it('cambio de volumen: +10 % de ventas → +10 % de contribución', () => {
    const s = calculateScenarioImpact(DEMO_SNAPSHOT, [{ type: 'product_volume_pct', productIds: 'all', pct: '0.10' }]);
    expect(money(s.profitChange)).toBe('183571.33');
  });

  it('cambio de costos fijos: +10 % → −$63.000 de ganancia', () => {
    const s = calculateScenarioImpact(DEMO_SNAPSHOT, [{ type: 'fixed_costs_pct', pct: '0.10' }]);
    expect(money(s.profitChange)).toBe('-63000.00');
  });

  it('cambio de comisión: Mercado Pago 6,39 % → 8 %', () => {
    const s = calculateScenarioImpact(DEMO_SNAPSHOT, [{ type: 'variable_cost_percent', variableCostId: 'mp', percentOfSale: '0.08' }]);
    // Δ% efectivo = (0,08 − 0,0639) × 0,7 = 1,127 % de la facturación (5.790.000)
    expect(money(s.profitChange)).toBe('-65253.30');
  });

  it('aumento de costos: todos los insumos +10 %', () => {
    const s = calculateScenarioImpact(DEMO_SNAPSHOT, [{ type: 'ingredient_price_pct', ingredientIds: 'all', pct: '0.10' }]);
    expect(s.profitChange.isNegative()).toBe(true);
    expectNoNaNOrInfinity(s.after.summary);
  });

  it('varios cambios combinados en orden', () => {
    const s = calculateScenarioImpact(DEMO_SNAPSHOT, [
      { type: 'ingredient_price', ingredientId: 'choc', purchasePrice: 22000 },
      { type: 'product_price_pct', productIds: ['alfajor'], pct: '0.10' },
    ]);
    const alfajor = s.products.find((p) => p.productId === 'alfajor')!;
    expect(money(alfajor.after.price)).toBe('6600.00');
    expect(money(alfajor.directCostChange)).toBe('320.00');
  });
});
