import { describe, expect, it } from 'vitest';
import { movementFormSchema, toMovementPayload } from './schemas';

const links = { fixedCostId: '', purchaseIngredientId: '', purchaseQty: '', purchaseUnit: 'kg' as const };
const income = {
  kind: 'income' as const, occurredOn: '2026-10-08', concept: 'Ventas del sábado', category: 'sale', amount: '120.000',
  productId: 'alfajor', paymentMethod: 'cash', supplier: 'no debería guardarse', notes: '', ...links,
};
const expense = {
  kind: 'expense' as const, occurredOn: '2026-10-08', concept: 'Compra de harina', category: 'raw_materials', amount: '25.000,50',
  productId: 'alfajor', paymentMethod: 'cash', supplier: 'Molino Sur', notes: '', ...links,
};

describe('formulario de movimientos → base', () => {
  it('ingreso: guarda producto y medio de pago, nunca proveedor ni vínculos', () => {
    expect(toMovementPayload(movementFormSchema.parse({ ...income, fixedCostId: 'alquiler' }))).toEqual({
      kind: 'income', occurred_on: '2026-10-08', concept: 'Ventas del sábado', category: 'sale', amount: '120000',
      product_id: 'alfajor', payment_method: 'cash', supplier: null, notes: null,
      fixed_cost_id: null, ingredient_id: null, ingredient_qty: null, ingredient_unit: null,
    });
  });

  it('egreso: guarda proveedor, nunca producto ni medio de pago', () => {
    expect(toMovementPayload(movementFormSchema.parse(expense))).toMatchObject({
      kind: 'expense', amount: '25000.5', product_id: null, payment_method: null, supplier: 'Molino Sur', ingredient_id: null,
    });
  });

  it('la categoría tiene que corresponder al tipo', () => {
    expect(movementFormSchema.safeParse({ ...income, category: 'rent' }).success).toBe(false);
    expect(movementFormSchema.safeParse({ ...expense, category: 'sale' }).success).toBe(false);
  });

  it('importe 0, sin concepto o sin fecha → error', () => {
    expect(movementFormSchema.safeParse({ ...income, amount: '0' }).success).toBe(false);
    expect(movementFormSchema.safeParse({ ...income, concept: ' ' }).success).toBe(false);
    expect(movementFormSchema.safeParse({ ...income, occurredOn: '' }).success).toBe(false);
  });
});

describe('vínculos de egresos (fase 10)', () => {
  it('pago de un costo fijo', () => {
    const v = movementFormSchema.parse({ ...expense, category: 'rent', concept: 'Alquiler octubre', amount: '450.000', fixedCostId: 'alquiler' });
    expect(toMovementPayload(v)).toMatchObject({ fixed_cost_id: 'alquiler', category: 'rent', amount: '450000' });
  });

  it('compra de insumo: guarda insumo, cantidad y unidad', () => {
    const v = movementFormSchema.parse({ ...expense, purchaseIngredientId: 'choc', purchaseQty: '5', purchaseUnit: 'kg', amount: '110.000' });
    expect(toMovementPayload(v)).toMatchObject({ ingredient_id: 'choc', ingredient_qty: '5', ingredient_unit: 'kg' });
  });

  it('compra de insumo sin cantidad → error en el campo', () => {
    const r = movementFormSchema.safeParse({ ...expense, purchaseIngredientId: 'choc', purchaseQty: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path.join('.'))).toContain('purchaseQty');
  });

  it('si la categoría no es de compras, el insumo elegido se ignora', () => {
    const v = movementFormSchema.parse({ ...expense, category: 'rent', purchaseIngredientId: 'choc', purchaseQty: '5' });
    expect(toMovementPayload(v)).toMatchObject({ ingredient_id: null, ingredient_qty: null, ingredient_unit: null });
  });
});
