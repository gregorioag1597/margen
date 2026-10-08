import { describe, expect, it } from 'vitest';
import {
  calculateContributionMargin,
  calculateMargin,
  calculateMarkup,
  calculateRecommendedPrice,
  calculateTotalProductCost,
  calculateVariableCost,
  dec,
  evaluatePrice,
  getMarginStatus,
  resolveVariableCostsForProduct,
  roundRecommendedPrice,
  ZERO,
  type VariableCost,
} from '..';
import { expectError, money, pct, unwrap } from './helpers';

describe('margen vs markup', () => {
  it('costo $4.200, precio $6.000 → margen 30 %', () => {
    expect(pct(unwrap(calculateMargin(dec(6000), dec(4200))))).toBe('0.3000');
  });

  it('el mismo caso tiene markup 42,86 %, no 30 %', () => {
    expect(pct(unwrap(calculateMarkup(dec(6000), dec(4200))))).toBe('0.4286');
  });

  it('aplicar 30 % de markup NO da 30 % de margen', () => {
    const priceWithMarkup = dec(4200).times('1.30'); // 5.460
    expect(pct(unwrap(calculateMargin(priceWithMarkup, dec(4200))))).toBe('0.2308');
  });

  it('margen negativo cuando el costo supera al precio', () => {
    expect(pct(unwrap(calculateMargin(dec(1000), dec(1200))))).toBe('-0.2000');
  });

  it('sin precio no hay margen (no divide por 0)', () => {
    expectError(calculateMargin(null, dec(100)), 'MISSING_PRICE');
    expectError(calculateMargin(ZERO, dec(100)), 'MISSING_PRICE');
  });

  it('markup con costo 0 → error, no Infinity', () => {
    expectError(calculateMarkup(dec(100), ZERO), 'ZERO_COST');
  });
});

describe('precio recomendado', () => {
  const base = { directCost: dec(4200), fixedPerUnit: ZERO, variablePercent: ZERO, variablePerUnit: ZERO };

  it('costo $4.200 y margen 30 % → $6.000 (precio = costo ÷ (1 − margen))', () => {
    const price = unwrap(calculateRecommendedPrice({ ...base, targetMargin: dec('0.30') }));
    expect(money(price)).toBe('6000.00');
  });

  it('CASO DE CONTROL: 4.200 ÷ (1 − 0,30 − 0,0639) = $6.602,74', () => {
    const price = unwrap(
      calculateRecommendedPrice({ ...base, variablePercent: dec('0.0639'), targetMargin: dec('0.30') }),
    );
    expect(money(price)).toBe('6602.74');
  });

  it('a ese precio el margen real es exactamente 30 % (el % variable crece con el precio)', () => {
    const price = unwrap(
      calculateRecommendedPrice({ ...base, variablePercent: dec('0.0639'), targetMargin: dec('0.30') }),
    );
    const totalCost = calculateTotalProductCost({ ...base, price, variablePercent: dec('0.0639') });
    expect(pct(unwrap(calculateMargin(price, totalCost)), 10)).toBe('0.3000000000');
  });

  it('el % variable NO se suma como costo fijo después (eso daría un precio menor e incorrecto)', () => {
    const wrong = dec(4200).plus(dec(6000).times('0.0639')).div('0.70'); // 6.547,77
    const right = unwrap(
      calculateRecommendedPrice({ ...base, variablePercent: dec('0.0639'), targetMargin: dec('0.30') }),
    );
    expect(right.gt(wrong)).toBe(true);
  });

  it('incluye costo variable por unidad y fijos asignados', () => {
    // (4.200 + 300 + 500) ÷ (1 − 0,30) = 7.142,857…
    const price = unwrap(
      calculateRecommendedPrice({
        directCost: dec(4200),
        variablePerUnit: dec(300),
        fixedPerUnit: dec(500),
        variablePercent: ZERO,
        targetMargin: dec('0.30'),
      }),
    );
    expect(money(price)).toBe('7142.86');
  });

  it('margen objetivo imposible: margen + % variable ≥ 100 %', () => {
    const r = expectError(
      calculateRecommendedPrice({ ...base, variablePercent: dec('0.75'), targetMargin: dec('0.30') }),
      'TARGET_MARGIN_UNREACHABLE',
    );
    if (!r.ok) expect(r.error.meta?.maxAchievableMargin).toBe('0.25');
    expectError(
      calculateRecommendedPrice({ ...base, variablePercent: dec('0.70'), targetMargin: dec('0.30') }),
      'TARGET_MARGIN_UNREACHABLE',
    );
  });

  it('margen objetivo inválido (≥ 100 % o negativo)', () => {
    for (const m of ['1', '1.5', '-0.1']) {
      expectError(calculateRecommendedPrice({ ...base, targetMargin: dec(m) }), 'INVALID_TARGET_MARGIN');
    }
  });

  it('margen objetivo 0 % = cubrir costos exactos', () => {
    expect(money(unwrap(calculateRecommendedPrice({ ...base, targetMargin: ZERO })))).toBe('4200.00');
  });
});

describe('evaluatePrice()', () => {
  it('al precio redondeado $6.650 el margen supera el objetivo de 30 %', () => {
    const r = unwrap(
      evaluatePrice({ price: dec(6650), directCost: dec(4200), variablePercent: dec('0.0639'), variablePerUnit: ZERO, fixedPerUnit: ZERO }),
    );
    // costo = 4.200 + 6.650 × 6,39 % = 4.624,935 → margen 30,45 %
    expect(money(r.totalCost)).toBe('4624.94');
    expect(pct(r.margin)).toBe('0.3045');
  });

  it('sin precio → error', () => {
    expectError(evaluatePrice({ price: ZERO, directCost: dec(1), variablePercent: ZERO, variablePerUnit: ZERO, fixedPerUnit: ZERO }), 'MISSING_PRICE');
  });
});

describe('roundRecommendedPrice()', () => {
  const price = dec('6602.7354');

  it.each([
    [10, '6610'],
    [50, '6650'],
    [100, '6700'],
    [500, '7000'],
  ])('redondea hacia arriba a múltiplos de $%i', (step, expected) => {
    expect(roundRecommendedPrice(price, step).toString()).toBe(expected);
  });

  it('un precio ya redondo no cambia', () => {
    expect(roundRecommendedPrice(dec(6600), 50).toString()).toBe('6600');
  });

  it('no salta de escalón por ruido de decimales', () => {
    expect(roundRecommendedPrice(dec('6600.000000001'), 50).toString()).toBe('6600');
  });

  it('paso 0 → solo centavos', () => {
    expect(roundRecommendedPrice(price, 0).toString()).toBe('6602.74');
  });
});

describe('costos variables', () => {
  const vc = (over: Partial<VariableCost>): VariableCost => ({
    id: 'x', name: 'x', percentOfSale: 0, amountPerUnit: 0, appliesTo: 'all',
    productIds: [], shareOfSales: 1, isActive: true, ...over,
  });

  it('porcentaje sobre la venta: Mercado Pago 6,39 % de $6.000 = $383,40', () => {
    const rates = resolveVariableCostsForProduct('p', [vc({ percentOfSale: '0.0639' })]);
    expect(money(calculateVariableCost(dec(6000), rates))).toBe('383.40');
  });

  it('monto fijo por unidad: packaging $300', () => {
    const rates = resolveVariableCostsForProduct('p', [vc({ amountPerUnit: 300 })]);
    expect(money(calculateVariableCost(dec(6000), rates))).toBe('300.00');
  });

  it('ambos a la vez', () => {
    const rates = resolveVariableCostsForProduct('p', [vc({ percentOfSale: '0.10', amountPerUnit: 300 })]);
    expect(money(calculateVariableCost(dec(6000), rates))).toBe('900.00');
  });

  it('MercadoLibre 15 % solo en productos seleccionados y en el 60 % de sus ventas → 9 %', () => {
    const costs = [vc({ percentOfSale: '0.15', appliesTo: 'selected', productIds: ['alfajor'], shareOfSales: '0.6' })];
    expect(resolveVariableCostsForProduct('alfajor', costs).percent.toString()).toBe('0.09');
    expect(resolveVariableCostsForProduct('torta', costs).percent.toString()).toBe('0');
  });

  it('el % de ventas también pondera el monto por unidad', () => {
    const rates = resolveVariableCostsForProduct('p', [vc({ amountPerUnit: 1000, shareOfSales: '0.25' })]);
    expect(rates.perUnit.toString()).toBe('250');
  });

  it('los costos desactivados no se aplican', () => {
    const rates = resolveVariableCostsForProduct('p', [vc({ percentOfSale: '0.15', isActive: false })]);
    expect(rates.percent.toString()).toBe('0');
    expect(rates.applied).toHaveLength(0);
  });

  it('contribución = precio − directo − costos de venta', () => {
    expect(money(calculateContributionMargin(dec(6000), dec(4200), dec('0.0639'), dec(300)))).toBe('1116.60');
  });
});

describe('estados de margen (umbrales centralizados)', () => {
  it('≥ 25 % saludable, 0–25 % bajo, < 0 negativo', () => {
    expect(getMarginStatus(dec('0.25'))).toBe('healthy');
    expect(getMarginStatus(dec('0.2499'))).toBe('low');
    expect(getMarginStatus(dec('0'))).toBe('low');
    expect(getMarginStatus(dec('-0.01'))).toBe('negative');
  });

  it('acepta umbrales personalizados', () => {
    expect(getMarginStatus(dec('0.30'), { healthy: dec('0.40'), low: dec('0.10') })).toBe('low');
  });
});
