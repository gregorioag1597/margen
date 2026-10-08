import { describe, expect, it } from 'vitest';
import {
  calculateBreakEven,
  calculateFixedCostAllocation,
  calculateMonthlyProfit,
  calculateProfitGoal,
  calculateRequiredRevenue,
  dec,
  type MixItem,
} from '..';
import { expectError, money, unwrap } from './helpers';

describe('asignación estimada de costos fijos (costo directo × ventas)', () => {
  const products = [
    { productId: 'a', directCost: dec(10), monthlyUnits: dec(10) }, // peso 100
    { productId: 'b', directCost: dec(30), monthlyUnits: dec(10) }, // peso 300
    { productId: 'c', directCost: dec(20), monthlyUnits: dec(0) }, //  sin ventas
  ];

  it('reparte en proporción a costo directo × ventas', () => {
    const r = calculateFixedCostAllocation(dec(1000), products);
    expect(r.byProduct.get('a')!.perUnit!.toString()).toBe('25');
    expect(r.byProduct.get('b')!.perUnit!.toString()).toBe('75');
    expect(r.byProduct.get('a')!.monthly.toString()).toBe('250');
    expect(r.byProduct.get('b')!.monthly.toString()).toBe('750');
  });

  it('la suma asignada es igual a los costos fijos', () => {
    const r = calculateFixedCostAllocation(dec(1000), products);
    const total = [...r.byProduct.values()].reduce((acc, p) => acc.plus(p.monthly), dec(0));
    expect(total.toString()).toBe('1000');
  });

  it('producto sin ventas: no absorbe fijos del mes, pero tiene asignación de referencia por unidad', () => {
    const c = calculateFixedCostAllocation(dec(1000), products).byProduct.get('c')!;
    expect(c.monthly.toString()).toBe('0');
    expect(c.perUnit!.toString()).toBe('50');
  });

  it('no depende del precio de venta (no hay circularidad)', () => {
    // La función ni siquiera recibe precios: cambiar precios no puede cambiar la asignación.
    expect(calculateFixedCostAllocation.length).toBeLessThanOrEqual(3);
  });

  it('costos fijos = 0 → asignación 0', () => {
    const r = calculateFixedCostAllocation(dec(0), products);
    expect(r.byProduct.get('a')!.perUnit!.toString()).toBe('0');
  });

  it('sin ventas en ningún producto → no disponible (sin NaN)', () => {
    const r = calculateFixedCostAllocation(dec(1000), [{ productId: 'a', directCost: dec(10), monthlyUnits: dec(0) }]);
    expect(r.available).toBe(false);
    expect(r.byProduct.get('a')!.perUnit).toBeNull();
  });

  it('con ventas pero costo directo 0 → reparte por unidades', () => {
    const r = calculateFixedCostAllocation(dec(1000), [
      { productId: 'a', directCost: dec(0), monthlyUnits: dec(30) },
      { productId: 'b', directCost: dec(0), monthlyUnits: dec(70) },
    ]);
    expect(r.byProduct.get('a')!.perUnit!.toString()).toBe('10');
    expect(r.byProduct.get('b')!.monthly.toString()).toBe('700');
  });
});

describe('punto de equilibrio y objetivos', () => {
  // Facturación 3.000, contribución 900 (30 %), 20 unidades (45 por unidad)
  const mix: MixItem[] = [
    { price: dec(100), contribution: dec(40), monthlyUnits: dec(10) },
    { price: dec(200), contribution: dec(50), monthlyUnits: dec(10) },
  ];

  it('punto de equilibrio = fijos ÷ ratio de contribución del mix', () => {
    const be = unwrap(calculateBreakEven(dec(450), mix));
    expect(money(be.revenue)).toBe('1500.00');
    expect(money(be.units)).toBe('10.00');
    expect(be.contributionRatio.toString()).toBe('0.3');
  });

  it('ganancia mensual = Σ contribución − fijos', () => {
    expect(calculateMonthlyProfit(mix, dec(450)).toString()).toBe('450');
    expect(calculateMonthlyProfit(mix, dec(1000)).toString()).toBe('-100');
  });

  it('facturación necesaria para una ganancia objetivo', () => {
    const r = unwrap(calculateRequiredRevenue(dec(900), dec(900), mix));
    expect(money(r.revenue)).toBe('6000.00');
    expect(money(r.units)).toBe('40.00');
  });

  it('ejemplo del documento: ganar $3.000.000 → facturar $13.500.000 (+$3.700.000)', () => {
    const negocio: MixItem[] = [{ price: dec(9800), contribution: dec(3920), monthlyUnits: dec(1000) }];
    const goal = unwrap(calculateProfitGoal(dec(2_400_000), dec(3_000_000), negocio));
    expect(money(goal.currentRevenue)).toBe('9800000.00');
    expect(money(goal.revenue)).toBe('13500000.00');
    expect(money(goal.revenueGap)).toBe('3700000.00');
  });

  it('sin ventas → error comprensible, no NaN', () => {
    expectError(calculateBreakEven(dec(1000), []), 'NO_SALES_DATA');
  });

  it('si cada venta pierde plata, el equilibrio es imposible', () => {
    expectError(
      calculateBreakEven(dec(1000), [{ price: dec(100), contribution: dec(-5), monthlyUnits: dec(10) }]),
      'NO_CONTRIBUTION',
    );
  });

  it('ganancia objetivo negativa → error', () => {
    expectError(calculateRequiredRevenue(dec(100), dec(-1), mix), 'INVALID_INPUT');
  });

  it('costos fijos = 0 → equilibrio en 0', () => {
    expect(money(unwrap(calculateBreakEven(dec(0), mix)).revenue)).toBe('0.00');
  });
});
