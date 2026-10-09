import { describe, expect, it } from 'vitest';
import {
  buildBusinessModel,
  buildCostLookup,
  calculateIngredientPriceImpact,
  calculateIngredientUsableCost,
  calculateProductDirectCost,
  DEMO_SNAPSHOT,
  fixedCostsPlanVsActual,
  priceForPresentation,
  type BusinessSnapshot,
  type Product,
} from '..';
import { expectError, money, unwrap } from './helpers';

const lookup = buildCostLookup(DEMO_SNAPSHOT.ingredients, DEMO_SNAPSHOT.laborRates);
const alfajor = DEMO_SNAPSHOT.products.find((p) => p.id === 'alfajor')!;

/** El alfajor de la demo cargado como tanda de 48 (cantidades × 48, packaging por unidad). */
const alfajorPorTanda: Product = {
  ...alfajor,
  batchYield: 48,
  components: [
    { id: 'a1', kind: 'ingredient', ingredientId: 'choc', quantity: 3840, unit: 'g' },
    { id: 'a2', kind: 'ingredient', ingredientId: 'ddl', quantity: '4.8', unit: 'kg' },
    { id: 'a3', kind: 'ingredient', ingredientId: 'harina', quantity: 1920, unit: 'g' },
    { id: 'a4', kind: 'packaging', ingredientId: 'caja', quantity: 1, unit: 'unit', basis: 'unit' },
    { id: 'a5', kind: 'packaging', ingredientId: 'etiqueta', quantity: 1, unit: 'unit', basis: 'unit' },
    { id: 'a6', kind: 'labor', laborRateId: 'mo', quantity: '6.4', unit: 'h' },
  ],
};

describe('recetas por tanda', () => {
  it('una tanda de 48 da el mismo costo por unidad que la receta unitaria ($3.050)', () => {
    const byBatch = unwrap(calculateProductDirectCost(alfajorPorTanda.components, lookup, 48));
    expect(byBatch.total.toString()).toBe('3050');
    expect(byBatch.rawMaterials.toString()).toBe('1950');
    expect(byBatch.packaging.toString()).toBe('300');
    expect(byBatch.labor.toString()).toBe('800');
  });

  it('el packaging "por unidad" no se divide por el rinde', () => {
    const caja = unwrap(calculateProductDirectCost(alfajorPorTanda.components, lookup, 48)).lines.find((l) => l.componentId === 'a4')!;
    expect(caja.cost.toString()).toBe('250');
    expect(caja.basis).toBe('unit');
  });

  it('informa el costo de toda la tanda', () => {
    const r = unwrap(calculateProductDirectCost(alfajorPorTanda.components, lookup, 48));
    expect(r.batchTotal.toString()).toBe('146400'); // 3.050 × 48
    const choc = r.lines.find((l) => l.componentId === 'a1')!;
    expect(choc.amount.toString()).toBe('69120'); // 3.840 g × $18
    expect(choc.cost.toString()).toBe('1440');
  });

  it('el modelo del negocio da los mismos números con la receta por tanda', () => {
    const snapshot: BusinessSnapshot = { ...DEMO_SNAPSHOT, products: DEMO_SNAPSHOT.products.map((p) => (p.id === 'alfajor' ? alfajorPorTanda : p)) };
    expect(money(buildBusinessModel(snapshot).summary.monthlyProfit)).toBe('1205713.30');
  });

  it('el aumento del chocolate impacta igual en la receta por tanda (+$320 por alfajor)', () => {
    const snapshot: BusinessSnapshot = { ...DEMO_SNAPSHOT, products: DEMO_SNAPSHOT.products.map((p) => (p.id === 'alfajor' ? alfajorPorTanda : p)) };
    const impact = unwrap(calculateIngredientPriceImpact(snapshot, 'choc', { purchasePrice: 22000 }));
    expect(impact.affectedProducts.find((p) => p.productId === 'alfajor')!.costIncrease.toString()).toBe('320');
  });

  it('rinde inválido → error', () => {
    expectError(calculateProductDirectCost(alfajorPorTanda.components, lookup, 0), 'INVALID_QUANTITY');
    expectError(calculateProductDirectCost(alfajorPorTanda.components, lookup, -3), 'INVALID_QUANTITY');
  });
});

describe('merma', () => {
  const frutillas = { purchaseQty: 1, purchaseUnit: 'kg' as const, purchasePrice: 4000 };

  it('frutillas a $4/g con 20 % de merma → $5 por gramo usable', () => {
    expect(unwrap(calculateIngredientUsableCost({ ...frutillas, wastePct: '0.2' })).toString()).toBe('5');
  });

  it('sin merma es igual al costo de compra', () => {
    expect(unwrap(calculateIngredientUsableCost(frutillas)).toString()).toBe('4');
    expect(unwrap(calculateIngredientUsableCost({ ...frutillas, wastePct: 0 })).toString()).toBe('4');
  });

  it('la merma sube el costo del producto', () => {
    const ings = DEMO_SNAPSHOT.ingredients.map((i) => (i.id === 'ddl' ? { ...i, wastePct: '0.05' } : i));
    const r = unwrap(calculateProductDirectCost(alfajor.components, buildCostLookup(ings, DEMO_SNAPSHOT.laborRates)));
    // 100 g × $4,5 ÷ 0,95 = 473,68 (antes 450)
    expect(money(r.lines.find((l) => l.componentId === 'a2')!.cost)).toBe('473.68');
  });

  it('merma fuera de rango → error', () => {
    expectError(calculateIngredientUsableCost({ ...frutillas, wastePct: '0.95' }), 'INVALID_INPUT');
    expectError(calculateIngredientUsableCost({ ...frutillas, wastePct: '-0.1' }), 'INVALID_INPUT');
  });
});

describe('costos fijos: planificado vs pagado', () => {
  const fixed = DEMO_SNAPSHOT.fixedCosts; // 630.000
  const r = fixedCostsPlanVsActual(fixed, [
    { fixedCostId: 'alquiler', amount: 450000 },
    { fixedCostId: 'internet', amount: 20000 },
    { fixedCostId: 'publicidad', amount: 50000 },
    { fixedCostId: 'publicidad', amount: 40000 },
    { fixedCostId: null, amount: 999999 }, // egreso sin vínculo: no cuenta
  ]);

  it('totales', () => {
    expect(r.planned.toString()).toBe('630000');
    expect(r.paid.toString()).toBe('560000');
  });

  it('estados: pagado, parcial, de más y pendiente', () => {
    const status = Object.fromEntries(r.items.map((i) => [i.fixedCostId, i.status]));
    expect(status).toEqual({ alquiler: 'paid', contador: 'pending', internet: 'partial', software: 'pending', publicidad: 'over' });
    expect(r.pending.map((p) => p.name)).toEqual(['Contador', 'Software de gestión']);
  });

  it('los costos pausados no cuentan', () => {
    const paused = fixedCostsPlanVsActual(fixed.map((f) => (f.id === 'contador' ? { ...f, isActive: false } : f)), []);
    expect(paused.planned.toString()).toBe('570000');
  });
});

describe('precio de una compra en la presentación del insumo', () => {
  it('5 kg a $110.000 → $22.000 por kg', () => {
    expect(unwrap(priceForPresentation(110000, { qty: 5, unit: 'kg' }, { qty: 1, unit: 'kg' })).toString()).toBe('22000');
  });

  it('2.500 g a $50.000 → $20.000 por kg', () => {
    expect(unwrap(priceForPresentation(50000, { qty: 2500, unit: 'g' }, { qty: 1, unit: 'kg' })).toString()).toBe('20000');
  });

  it('cajas: 50 unidades a $14.000 → $28.000 por 100 unidades', () => {
    expect(unwrap(priceForPresentation(14000, { qty: 50, unit: 'unit' }, { qty: 100, unit: 'unit' })).toString()).toBe('28000');
  });

  it('unidades incompatibles → error', () => {
    expectError(priceForPresentation(1000, { qty: 1, unit: 'l' }, { qty: 1, unit: 'kg' }), 'INCOMPATIBLE_UNITS');
  });
});
