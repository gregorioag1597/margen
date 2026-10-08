import { describe, expect, it } from 'vitest';
import { movementFormSchema, toMovementPayload } from './schemas';

const income = {
  kind: 'income' as const, occurredOn: '2026-10-08', concept: 'Ventas del sábado', category: 'sale', amount: '120.000',
  productId: 'alfajor', paymentMethod: 'cash', supplier: 'no debería guardarse', notes: '',
};
const expense = {
  kind: 'expense' as const, occurredOn: '2026-10-08', concept: 'Compra de harina', category: 'raw_materials', amount: '25.000,50',
  productId: 'alfajor', paymentMethod: 'cash', supplier: 'Molino Sur', notes: '',
};

describe('formulario de movimientos → base', () => {
  it('ingreso: guarda producto y medio de pago, nunca proveedor', () => {
    expect(toMovementPayload(movementFormSchema.parse(income))).toEqual({
      kind: 'income', occurred_on: '2026-10-08', concept: 'Ventas del sábado', category: 'sale', amount: '120000',
      product_id: 'alfajor', payment_method: 'cash', supplier: null, notes: null,
    });
  });

  it('egreso: guarda proveedor, nunca producto ni medio de pago', () => {
    expect(toMovementPayload(movementFormSchema.parse(expense))).toMatchObject({
      kind: 'expense', amount: '25000.5', product_id: null, payment_method: null, supplier: 'Molino Sur',
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
