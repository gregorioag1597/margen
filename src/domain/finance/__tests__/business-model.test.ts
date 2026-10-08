import { describe, expect, it } from 'vitest';
import {
  buildBusinessModel,
  DEMO_SNAPSHOT,
  productsNeedingAttention,
  rankByMargin,
  rankByMonthlyProfit,
  type BusinessSnapshot,
  type Product,
} from '..';
import { expectError, expectNoNaNOrInfinity, money, pct } from './helpers';

const byId = (model: ReturnType<typeof buildBusinessModel>, id: string) =>
  model.products.find((p) => p.productId === id)!;

describe('modelo del negocio: Pastelería Demo', () => {
  const model = buildBusinessModel(DEMO_SNAPSHOT);

  it('facturación, costos fijos y ganancia del mes', () => {
    expect(money(model.summary.monthlyRevenue)).toBe('5790000.00');
    expect(money(model.summary.fixedCostsTotal)).toBe('630000.00');
    expect(money(model.summary.monthlyContribution)).toBe('1835713.30');
    expect(money(model.summary.monthlyProfit)).toBe('1205713.30');
    expect(pct(model.summary.averageMargin)).toBe('0.2082');
  });

  it('la ganancia de los productos suma la ganancia del negocio', () => {
    const total = model.products.reduce((acc, p) => acc.plus(p.monthlyProfit!), model.summary.fixedCostsTotal.times(0));
    expect(money(total)).toBe(money(model.summary.monthlyProfit));
  });

  it('separa costos directos, de venta y fijos asignados (Alfajor)', () => {
    const a = byId(model, 'alfajor');
    expect(money(a.directCost!.total)).toBe('3050.00');
    expect(pct(a.variable.percent, 5)).toBe('0.16973'); // MP 4,473 % + IIBB 3,5 % + MeLi 9 %
    expect(money(a.variableCostPerUnit)).toBe('1018.38');
    expect(money(a.fixedAllocationPerUnit)).toBe('609.00');
    expect(money(a.profitPerUnit)).toBe('1322.62');
    expect(pct(a.margin)).toBe('0.2204');
    expect(a.marginStatus).toBe('low');
  });

  it('precio recomendado del Alfajor con margen 30 %, redondeado a $50', () => {
    const a = byId(model, 'alfajor');
    expect(a.recommendedPrice.ok && money(a.recommendedPrice.value.exact)).toBe('6900.27');
    expect(a.recommendedPrice.ok && a.recommendedPrice.value.rounded.toString()).toBe('6950');
    expect(money(a.priceGap)).toBe('950.00');
  });

  it('MercadoLibre no se aplica a tortas ni cookies', () => {
    expect(pct(byId(model, 'torta').variable.percent, 5)).toBe('0.07973');
    expect(pct(byId(model, 'cookie').variable.percent, 5)).toBe('0.07973');
  });

  it('estados de margen', () => {
    expect(model.products.map((p) => p.marginStatus)).toEqual(['low', 'low', 'low', 'healthy']);
  });

  it('mayor margen ≠ más ganancia mensual', () => {
    expect(rankByMargin(model.products)[0]!.productId).toBe('cookie');
    expect(rankByMonthlyProfit(model.products)[0]!.productId).toBe('alfajor');
  });

  it('productos que necesitan atención: peor margen primero', () => {
    expect(productsNeedingAttention(model.products).map((p) => p.productId)).toEqual(['brownie', 'torta', 'alfajor']);
  });

  it('punto de equilibrio con el mix actual', () => {
    // 630.000 ÷ (1.835.713,30 ÷ 5.790.000)
    expect(model.summary.breakEven.ok).toBe(true);
    if (model.summary.breakEven.ok) expect(money(model.summary.breakEven.value.revenue)).toBe('1987075.00');
  });

  it('nunca produce NaN ni Infinity', () => {
    expectNoNaNOrInfinity(model);
  });

  it('sin sueldos en costos fijos no hay aviso de doble conteo', () => {
    expect(model.warnings.some((w) => w.code === 'LABOR_DOUBLE_COUNT_RISK')).toBe(false);
  });
});

describe('casos límite', () => {
  const product = (over: Partial<Product>): Product => ({
    id: 'p', name: 'P', price: '1000', monthlyUnits: 10, targetMargin: null,
    components: [{ id: 'c', kind: 'other', label: 'Costo', amount: 500 }], ...over,
  });
  const snapshot = (over: Partial<BusinessSnapshot>): BusinessSnapshot => ({
    currency: 'ARS', settings: { defaultTargetMargin: '0.30' }, ingredients: [], laborRates: [],
    products: [], fixedCosts: [], variableCosts: [], ...over,
  });

  it('negocio sin productos ni insumos', () => {
    const m = buildBusinessModel(snapshot({}));
    expect(money(m.summary.monthlyRevenue)).toBe('0.00');
    expect(m.summary.averageMargin).toBeNull();
    expectError(m.summary.breakEven, 'NO_SALES_DATA');
    expectNoNaNOrInfinity(m);
  });

  it('producto sin componentes: costo 0 y aviso', () => {
    const m = buildBusinessModel(snapshot({ products: [product({ components: [] })] }));
    expect(money(m.products[0]!.directCost!.total)).toBe('0.00');
    expect(m.warnings.some((w) => w.code === 'NO_COMPONENTS')).toBe(true);
  });

  it('producto sin precio: sin margen, pero con precio recomendado', () => {
    const p = buildBusinessModel(snapshot({ products: [product({ price: null })] })).products[0]!;
    expect(p.margin).toBeNull();
    expect(p.recommendedPrice.ok && money(p.recommendedPrice.value.exact)).toBe('714.29');
  });

  it('producto sin ventas estimadas: aviso y fuera del mix', () => {
    const m = buildBusinessModel(snapshot({ products: [product({ monthlyUnits: 0 })] }));
    expect(m.mix).toHaveLength(0);
    expect(m.warnings.some((w) => w.code === 'NO_SALES_ESTIMATE')).toBe(true);
    expectNoNaNOrInfinity(m);
  });

  it('margen negativo', () => {
    const p = buildBusinessModel(snapshot({ products: [product({ price: '400' })] })).products[0]!;
    expect(pct(p.margin)).toBe('-0.2500');
    expect(p.marginStatus).toBe('negative');
  });

  it('margen objetivo imposible por costos variables altos', () => {
    const p = buildBusinessModel(
      snapshot({
        products: [product({})],
        variableCosts: [{ id: 'v', name: 'Comisión', percentOfSale: '0.80', amountPerUnit: 0, appliesTo: 'all', productIds: [], shareOfSales: 1, isActive: true }],
      }),
    ).products[0]!;
    expectError(p.recommendedPrice, 'TARGET_MARGIN_UNREACHABLE');
    expect(p.priceGap).toBeNull();
  });

  it('insumo con unidad incompatible: el producto queda con error y el resto sigue calculando', () => {
    const m = buildBusinessModel(
      snapshot({
        ingredients: [{ id: 'i', name: 'Leche', purchaseUnit: 'l', purchaseQty: 1, purchasePrice: 1000 }],
        products: [
          product({ id: 'malo', components: [{ id: 'c', kind: 'ingredient', ingredientId: 'i', quantity: 10, unit: 'g' }] }),
          product({ id: 'bueno' }),
        ],
      }),
    );
    expect(m.products[0]!.error?.code).toBe('INCOMPATIBLE_UNITS');
    expect(m.products[1]!.error).toBeNull();
    expect(money(m.summary.monthlyRevenue)).toBe('10000.00');
    expectNoNaNOrInfinity(m);
  });

  it('sueldos en costos fijos + mano de obra en productos → aviso de doble conteo (no bloquea)', () => {
    const m = buildBusinessModel({
      ...DEMO_SNAPSHOT,
      fixedCosts: [...DEMO_SNAPSHOT.fixedCosts, { id: 's', name: 'Sueldos', category: 'salaries', monthlyAmount: 800000, isActive: true }],
    });
    expect(m.warnings.some((w) => w.code === 'LABOR_DOUBLE_COUNT_RISK')).toBe(true);
    expect(m.products.every((p) => p.margin !== null)).toBe(true);
  });

  it('datos basura (NaN, Infinity, texto) no rompen el modelo', () => {
    const m = buildBusinessModel(
      snapshot({ products: [product({ price: Number.NaN, monthlyUnits: Number.POSITIVE_INFINITY, targetMargin: 'abc' })] }),
    );
    expectNoNaNOrInfinity(m);
    expect(m.products[0]!.price).toBeNull();
  });
});
