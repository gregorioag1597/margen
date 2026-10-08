import { describe, expect, it } from 'vitest';
import {
  buildCostLookup,
  calculateComponentCost,
  calculateIngredientUnitCost,
  calculateLaborCost,
  calculateProductDirectCost,
  convertQuantity,
  DEMO_SNAPSHOT,
  toBaseQuantity,
  type ProductComponent,
} from '..';
import { expectError, unwrap } from './helpers';

describe('unidades', () => {
  it('kg → g', () => {
    expect(unwrap(toBaseQuantity(1, 'kg')).toString()).toBe('1000');
    expect(unwrap(convertQuantity('0.08', 'kg', 'g')).toString()).toBe('80');
  });

  it('litros → ml', () => {
    expect(unwrap(toBaseQuantity('1.5', 'l')).toString()).toBe('1500');
    expect(unwrap(convertQuantity(250, 'ml', 'l')).toString()).toBe('0.25');
  });

  it('horas → minutos y metros → cm', () => {
    expect(unwrap(toBaseQuantity('0.2', 'h')).toString()).toBe('12');
    expect(unwrap(toBaseQuantity(2, 'm')).toString()).toBe('200');
  });

  it('no convierte entre familias distintas (g ↔ ml es ambiguo)', () => {
    expectError(convertQuantity(100, 'g', 'ml'), 'INCOMPATIBLE_UNITS');
    expectError(convertQuantity(1, 'unit', 'kg'), 'INCOMPATIBLE_UNITS');
  });

  it('rechaza cantidades negativas o no numéricas', () => {
    expectError(toBaseQuantity(-1, 'g'), 'INVALID_QUANTITY');
    expectError(toBaseQuantity('abc', 'g'), 'INVALID_INPUT');
    expectError(toBaseQuantity(Number.NaN, 'g'), 'INVALID_INPUT');
    expectError(toBaseQuantity(Number.POSITIVE_INFINITY, 'g'), 'INVALID_INPUT');
  });
});

describe('costo unitario de insumos', () => {
  it('chocolate 1 kg a $18.000 → $18 por g', () => {
    const cost = calculateIngredientUnitCost({ purchaseQty: 1, purchaseUnit: 'kg', purchasePrice: 18000 });
    expect(unwrap(cost).toString()).toBe('18');
  });

  it('caja 100 unidades a $25.000 → $250 por unidad', () => {
    const cost = calculateIngredientUnitCost({ purchaseQty: 100, purchaseUnit: 'unit', purchasePrice: 25000 });
    expect(unwrap(cost).toString()).toBe('250');
  });

  it('leche 2 l a $3.000 → $1,5 por ml', () => {
    const cost = calculateIngredientUnitCost({ purchaseQty: 2, purchaseUnit: 'l', purchasePrice: 3000 });
    expect(unwrap(cost).toString()).toBe('1.5');
  });

  it('precios con decimales no pierden precisión', () => {
    // 0,1 + 0,2 en float daría 0,30000000000000004
    const cost = calculateIngredientUnitCost({ purchaseQty: 3, purchaseUnit: 'g', purchasePrice: '0.30' });
    expect(unwrap(cost).toString()).toBe('0.1');
  });

  it('cantidad comprada = 0 es un error, no Infinity', () => {
    expectError(
      calculateIngredientUnitCost({ purchaseQty: 0, purchaseUnit: 'kg', purchasePrice: 18000 }),
      'INVALID_QUANTITY',
    );
  });

  it('precio = 0 es válido (ej. insumo regalado) y cuesta 0', () => {
    const cost = calculateIngredientUnitCost({ purchaseQty: 1, purchaseUnit: 'kg', purchasePrice: 0 });
    expect(unwrap(cost).toString()).toBe('0');
  });

  it('precio negativo es un error', () => {
    expectError(
      calculateIngredientUnitCost({ purchaseQty: 1, purchaseUnit: 'kg', purchasePrice: -5 }),
      'INVALID_INPUT',
    );
  });
});

describe('mano de obra', () => {
  it('$6.000/h × 12 min = $1.200', () => {
    expect(unwrap(calculateLaborCost(6000, 12, 'min')).toString()).toBe('1200');
  });

  it('0,2 h equivale a 12 min', () => {
    expect(unwrap(calculateLaborCost(6000, '0.2', 'h')).toString()).toBe('1200');
  });

  it('solo acepta unidades de tiempo', () => {
    expectError(calculateLaborCost(6000, 10, 'g'), 'INCOMPATIBLE_UNITS');
  });
});

describe('costo por componente', () => {
  const lookup = buildCostLookup(DEMO_SNAPSHOT.ingredients, DEMO_SNAPSHOT.laborRates);

  it('80 g de chocolate = 80 × $18 = $1.440', () => {
    const c: ProductComponent = { id: 'x', kind: 'ingredient', ingredientId: 'choc', quantity: 80, unit: 'g' };
    expect(unwrap(calculateComponentCost(c, lookup)).cost.toString()).toBe('1440');
  });

  it('0,08 kg de chocolate cuesta lo mismo que 80 g', () => {
    const c: ProductComponent = { id: 'x', kind: 'ingredient', ingredientId: 'choc', quantity: '0.08', unit: 'kg' };
    expect(unwrap(calculateComponentCost(c, lookup)).cost.toString()).toBe('1440');
  });

  it('unidades incompatibles con el insumo → error', () => {
    const c: ProductComponent = { id: 'x', kind: 'ingredient', ingredientId: 'choc', quantity: 80, unit: 'ml' };
    expectError(calculateComponentCost(c, lookup), 'INCOMPATIBLE_UNITS');
  });

  it('insumo inexistente → error', () => {
    const c: ProductComponent = { id: 'x', kind: 'ingredient', ingredientId: 'nope', quantity: 1, unit: 'g' };
    expectError(calculateComponentCost(c, lookup), 'MISSING_REFERENCE');
  });

  it('otro costo directo suma su monto', () => {
    const c: ProductComponent = { id: 'x', kind: 'other', label: 'Envío a local', amount: '120.50' };
    const line = unwrap(calculateComponentCost(c, lookup));
    expect(line.cost.toString()).toBe('120.5');
    expect(line.category).toBe('other');
  });
});

describe('costo directo del producto', () => {
  const lookup = buildCostLookup(DEMO_SNAPSHOT.ingredients, DEMO_SNAPSHOT.laborRates);
  const product = (id: string) => DEMO_SNAPSHOT.products.find((p) => p.id === id)!;

  it('Alfajor Premium: materia prima $1.950 + packaging $300 + mano de obra $800 = $3.050', () => {
    const cost = unwrap(calculateProductDirectCost(product('alfajor').components, lookup));
    expect(cost.rawMaterials.toString()).toBe('1950');
    expect(cost.packaging.toString()).toBe('300');
    expect(cost.labor.toString()).toBe('800');
    expect(cost.total.toString()).toBe('3050');
  });

  it('costos directos de toda la demo', () => {
    const totals = DEMO_SNAPSHOT.products.map(
      (p) => unwrap(calculateProductDirectCost(p.components, lookup)).total.toString(),
    );
    expect(totals).toEqual(['3050', '2673', '19465', '915.5']);
  });

  it('producto sin componentes cuesta 0', () => {
    expect(unwrap(calculateProductDirectCost([], lookup)).total.toString()).toBe('0');
  });
});
