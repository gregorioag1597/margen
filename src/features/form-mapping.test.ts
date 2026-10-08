import { describe, expect, it } from 'vitest';
import { fixedCostFormSchema, toFixedCostPayload, toVariableCostPayload, variableCostFormSchema } from './costs/schemas';
import { ingredientFormSchema, toIngredientPayload } from './ingredients/schemas';

const errorsOf = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.path.join('.'));

describe('formulario de insumo → base de datos', () => {
  const base = { name: 'Chocolate', supplier: '', purchaseUnit: 'kg' as const, purchaseQty: '1', purchasePrice: '18.000', notes: '' };

  it('convierte "18.000" en 18000 y vacíos en null', () => {
    const parsed = ingredientFormSchema.parse(base);
    expect(toIngredientPayload(parsed)).toEqual({
      name: 'Chocolate', supplier: null, purchase_unit: 'kg', purchase_qty: '1', purchase_price: '18000', notes: null,
    });
  });

  it('cantidad 0 o texto no válido → error en el campo', () => {
    expect(errorsOf(ingredientFormSchema.safeParse({ ...base, purchaseQty: '0' }))).toEqual(['purchaseQty']);
    expect(errorsOf(ingredientFormSchema.safeParse({ ...base, purchasePrice: 'mucho' }))).toEqual(['purchasePrice']);
    expect(errorsOf(ingredientFormSchema.safeParse({ ...base, name: '  ' }))).toEqual(['name']);
  });

  it('precio 0 es válido', () => {
    expect(ingredientFormSchema.safeParse({ ...base, purchasePrice: '0' }).success).toBe(true);
  });
});

describe('formulario de costo fijo', () => {
  it('"450.000" → 450000', () => {
    const v = fixedCostFormSchema.parse({ name: 'Alquiler', category: 'rent', monthlyAmount: '450.000', notes: '' });
    expect(toFixedCostPayload(v).monthly_amount).toBe('450000');
  });
});

describe('formulario de costo de venta', () => {
  const base = {
    name: 'MercadoLibre', category: 'marketplace' as const, kind: 'percent' as const, percent: '15', amount: '',
    appliesTo: 'selected' as const, productIds: ['alfajor'], allSales: false, sharePercent: '60', notes: '',
  };

  it('MercadoLibre 15 %, en algunos productos y en el 60 % de las ventas', () => {
    const payload = toVariableCostPayload(variableCostFormSchema.parse(base));
    expect(payload.cost).toMatchObject({ percent_of_sale: '0.15', amount_per_unit: '0', applies_to: 'selected', share_of_sales: '0.6' });
    expect(payload.productIds).toEqual(['alfajor']);
  });

  it('Mercado Pago 6,39 % a todo', () => {
    const payload = toVariableCostPayload(
      variableCostFormSchema.parse({ ...base, percent: '6,39', appliesTo: 'all', allSales: true, productIds: ['x'] }),
    );
    expect(payload.cost).toMatchObject({ percent_of_sale: '0.0639', share_of_sales: '1', applies_to: 'all' });
    expect(payload.productIds).toEqual([]);
  });

  it('packaging $300 por unidad', () => {
    const payload = toVariableCostPayload(
      variableCostFormSchema.parse({ ...base, kind: 'amount', percent: '', amount: '300', appliesTo: 'all', allSales: true }),
    );
    expect(payload.cost).toMatchObject({ percent_of_sale: '0', amount_per_unit: '300' });
  });

  it('valida porcentaje, productos y % de ventas', () => {
    expect(errorsOf(variableCostFormSchema.safeParse({ ...base, percent: '120' }))).toContain('percent');
    expect(errorsOf(variableCostFormSchema.safeParse({ ...base, productIds: [] }))).toContain('productIds');
    expect(errorsOf(variableCostFormSchema.safeParse({ ...base, sharePercent: '0' }))).toContain('sharePercent');
    expect(errorsOf(variableCostFormSchema.safeParse({ ...base, percent: '0' }))).toContain('percent');
  });
});
