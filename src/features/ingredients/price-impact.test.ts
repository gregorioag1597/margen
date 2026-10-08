import { describe, expect, it } from 'vitest';
import { DEMO_SNAPSHOT } from '@/domain/finance';
import { previewIngredientImpact } from './price-impact-model';

const money = (d: { toFixed: (n: number) => string } | null | undefined) => (d ? d.toFixed(2) : null);

describe('impacto al editar un insumo (como lo escribe el usuario)', () => {
  it('chocolate "18.000" → "22.000": 4 productos, −$284.000 por mes', () => {
    const view = previewIngredientImpact(DEMO_SNAPSHOT, 'choc', { purchaseQty: '1', purchaseUnit: 'kg', purchasePrice: '22.000' })!;
    expect(view.direction).toBe('up');
    expect(view.affectedCount).toBe(4);
    expect(money(view.monthlyProfitLost)).toBe('284000.00');
  });

  it('sugiere el precio para mantener el margen, redondeado hacia arriba', () => {
    const view = previewIngredientImpact(DEMO_SNAPSHOT, 'choc', { purchaseQty: '1', purchaseUnit: 'kg', purchasePrice: '22000' })!;
    const alfajor = view.products.find((p) => p.productId === 'alfajor')!;
    expect(alfajor.suggestionKind).toBe('keep-margin');
    expect(alfajor.suggestedPrice!.toString()).toBe('6550');
    expect(alfajor.currentPrice!.toString()).toBe('6000');
  });

  it('cambiar la presentación (500 g a $11.000) también es un aumento', () => {
    // $11.000 / 500 g = $22/g, igual que $22.000/kg
    const view = previewIngredientImpact(DEMO_SNAPSHOT, 'choc', { purchaseQty: '500', purchaseUnit: 'g', purchasePrice: '11.000' })!;
    expect(money(view.monthlyProfitLost)).toBe('284000.00');
  });

  it('una baja de precio es ganancia extra (valor negativo)', () => {
    const view = previewIngredientImpact(DEMO_SNAPSHOT, 'choc', { purchaseQty: '1', purchaseUnit: 'kg', purchasePrice: '16000' })!;
    expect(view.direction).toBe('down');
    expect(money(view.monthlyProfitLost)).toBe('-142000.00');
  });

  it('sin cambio real → dirección "none"', () => {
    expect(previewIngredientImpact(DEMO_SNAPSHOT, 'choc', { purchaseQty: '1', purchaseUnit: 'kg', purchasePrice: '18000' })!.direction).toBe('none');
  });

  it('datos incompletos o inválidos → null (no muestra nada raro)', () => {
    expect(previewIngredientImpact(DEMO_SNAPSHOT, 'choc', { purchaseQty: '1', purchaseUnit: 'kg', purchasePrice: '' })).toBeNull();
    expect(previewIngredientImpact(DEMO_SNAPSHOT, 'choc', { purchaseQty: '0', purchaseUnit: 'kg', purchasePrice: '22000' })).toBeNull();
    expect(previewIngredientImpact(DEMO_SNAPSHOT, 'nope', { purchaseQty: '1', purchaseUnit: 'kg', purchasePrice: '1' })).toBeNull();
  });

  it('producto con margen negativo: sugiere el precio recomendado en vez de "mantener"', () => {
    const snapshot = {
      ...DEMO_SNAPSHOT,
      products: DEMO_SNAPSHOT.products.map((p) => (p.id === 'brownie' ? { ...p, price: '3000' } : p)),
    };
    const view = previewIngredientImpact(snapshot, 'choc', { purchaseQty: '1', purchaseUnit: 'kg', purchasePrice: '22000' })!;
    const brownie = view.products.find((p) => p.productId === 'brownie')!;
    expect(brownie.marginBefore!.lt(0)).toBe(true);
    expect(brownie.suggestionKind).toBe('recommended');
  });
});
