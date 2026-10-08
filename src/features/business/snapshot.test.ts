import { describe, expect, it } from 'vitest';
import { buildBusinessModel } from '@/domain/finance';
import { componentFormSchema, toComponentPayload, productFormSchema, toProductPayload } from '@/features/products/schemas';
import { recommendForMargin } from '@/features/products/product-view';
import { dec } from '@/domain/finance';
import type { Business } from './api';
import { toBusinessSnapshot, type SnapshotRows } from './snapshot';

// Filas como las devuelve Supabase (numeric llega como number y se convierte a string).
const business: Business = {
  id: 'b1', name: 'Test', business_type: 'gastronomia', currency: 'ARS',
  prices_include_taxes: true, default_target_margin: '0.3', settings: {}, is_demo: false,
};

const rows: SnapshotRows = {
  business,
  ingredients: [
    { id: 'choc', name: 'Chocolate', supplier: null, purchase_unit: 'kg', purchase_qty: '1', purchase_price: '18000', price_updated_at: '2026-10-01T00:00:00Z', notes: null, archived_at: null },
    { id: 'caja', name: 'Caja', supplier: null, purchase_unit: 'unit', purchase_qty: '100', purchase_price: '25000', price_updated_at: '2026-10-01T00:00:00Z', notes: null, archived_at: '2026-10-05T00:00:00Z' },
  ],
  laborRates: [{ id: 'mo', name: 'Mano de obra', hourly_rate: '6000', is_default: true }],
  products: [
    {
      id: 'alfajor', name: 'Alfajor', category: null, price: '6000', monthly_units_estimate: 100, target_margin: null,
      notes: null, archived_at: null, price_updated_at: null,
      product_components: [
        { id: 'c2', kind: 'labor', ingredient_id: null, labor_rate_id: 'mo', quantity: '12', unit: 'min', fixed_amount: null, label: null, position: 2 },
        { id: 'c1', kind: 'ingredient', ingredient_id: 'choc', labor_rate_id: null, quantity: '80', unit: 'g', fixed_amount: null, label: null, position: 1 },
        { id: 'c3', kind: 'packaging', ingredient_id: 'caja', labor_rate_id: null, quantity: '1', unit: 'unit', fixed_amount: null, label: null, position: 3 },
        { id: 'c4', kind: 'other', ingredient_id: null, labor_rate_id: null, quantity: null, unit: null, fixed_amount: '10', label: 'Sticker', position: 4 },
      ],
    },
    {
      id: 'viejo', name: 'Producto archivado', category: null, price: '100', monthly_units_estimate: 50, target_margin: null,
      notes: null, archived_at: '2026-01-01T00:00:00Z', price_updated_at: null, product_components: [],
    },
  ],
  fixedCosts: [
    { id: 'f1', name: 'Alquiler', category: 'rent', monthly_amount: '100000', is_active: true, notes: null },
    { id: 'f2', name: 'Pausado', category: 'other', monthly_amount: '999999', is_active: false, notes: null },
  ],
  variableCosts: [
    {
      id: 'meli', name: 'MercadoLibre', category: 'marketplace', percent_of_sale: '0.15', amount_per_unit: '0',
      applies_to: 'selected', share_of_sales: '0.6', is_active: true, notes: null, variable_cost_products: [{ product_id: 'alfajor' }],
    },
  ],
};

describe('filas de Supabase → motor', () => {
  const snapshot = toBusinessSnapshot(rows);
  const model = buildBusinessModel(snapshot);
  const alfajor = model.products.find((p) => p.productId === 'alfajor')!;

  it('ordena componentes por posición y los convierte', () => {
    expect(snapshot.products[0]!.components.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('los productos archivados no entran en los cálculos', () => {
    expect(snapshot.products.map((p) => p.id)).toEqual(['alfajor']);
  });

  it('un insumo archivado sigue costeando a los productos que lo usan', () => {
    // 80 g × $18 + 12 min × $100 + 1 caja × $250 + $10 = 1.440 + 1.200 + 250 + 10
    expect(alfajor.directCost!.total.toString()).toBe('2900');
  });

  it('usa el margen objetivo del negocio si el producto no tiene uno', () => {
    expect(alfajor.targetMargin.toString()).toBe('0.3');
  });

  it('costos variables con productos seleccionados y % de ventas', () => {
    expect(alfajor.variable.percent.toString()).toBe('0.09');
  });

  it('ignora costos fijos pausados', () => {
    expect(model.summary.fixedCostsTotal.toString()).toBe('100000');
  });

  it('settings inválidos no rompen nada', () => {
    const s = toBusinessSnapshot({ ...rows, business: { ...business, settings: { marginThresholds: 'basura', priceRoundingStep: 100 } } });
    expect(s.settings.marginThresholds).toBeUndefined();
    expect(s.settings.priceRoundingStep).toBe('100');
  });

  it('precio recomendado para otro margen objetivo (40 %)', () => {
    const rec = recommendForMargin(alfajor, dec('0.40'), dec(50));
    expect(rec.ok).toBe(true);
    if (rec.ok) {
      // (2.900 + 1.000 de fijos) ÷ (1 − 0,40 − 0,09) = 7.647,06 → 7.650
      expect(rec.recommended.toString()).toBe('7650');
      expect(rec.marginAtRecommended!.gte(dec('0.40'))).toBe(true);
    }
  });
});

describe('formularios de producto y componente', () => {
  it('producto sin precio y con ventas "400"', () => {
    const v = productFormSchema.parse({ name: 'Brownie', category: '', price: '', monthlyUnits: '400', notes: '' });
    expect(toProductPayload(v)).toEqual({ name: 'Brownie', category: null, price: null, monthly_units_estimate: 400, notes: null });
  });

  it('ventas con decimales no se aceptan', () => {
    expect(productFormSchema.safeParse({ name: 'X', category: '', price: '', monthlyUnits: '10,5', notes: '' }).success).toBe(false);
  });

  it('componente insumo respeta los checks de la base', () => {
    const v = componentFormSchema.parse({ kind: 'ingredient', ingredientId: 'choc', quantity: '0,08', unit: 'kg', label: '', amount: '' });
    expect(toComponentPayload(v, 'mo')).toEqual({
      kind: 'ingredient', ingredient_id: 'choc', labor_rate_id: null, quantity: '0.08', unit: 'kg', fixed_amount: null, label: null,
    });
  });

  it('componente de mano de obra usa la tarifa general', () => {
    const v = componentFormSchema.parse({ kind: 'labor', ingredientId: '', quantity: '8', unit: 'min', label: '', amount: '' });
    expect(toComponentPayload(v, 'mo')).toMatchObject({ kind: 'labor', labor_rate_id: 'mo', ingredient_id: null, quantity: '8' });
  });

  it('componente "otro" necesita descripción y monto', () => {
    const r = componentFormSchema.safeParse({ kind: 'other', ingredientId: '', quantity: '', unit: 'g', label: '', amount: '' });
    expect(r.success).toBe(false);
  });
});
