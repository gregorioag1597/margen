import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_BUSINESS, demoApi, resetDemoStore, selectDemoBusiness } from '@/lib/demo-store';
import { sameName } from './business-sheet';

describe('varios negocios en la demo: cada uno con sus datos separados', () => {
  beforeEach(() => resetDemoStore());

  it('un negocio nuevo empieza vacío y no ve los datos de la pastelería', async () => {
    const id = await demoApi.createBusiness({ name: 'Hamburguesería', business_type: 'gastronomia', currency: 'ARS', prices_include_taxes: null });
    expect((await demoApi.listBusinesses()).map((b) => b.name)).toEqual(['Pastelería Demo', 'Hamburguesería']);

    selectDemoBusiness(id);
    expect(await demoApi.listIngredients()).toEqual([]);
    expect(await demoApi.listProducts()).toEqual([]);

    selectDemoBusiness(DEMO_BUSINESS.id);
    expect((await demoApi.listIngredients()).length).toBeGreaterThan(0);
  });

  it('lo que se carga en un negocio no aparece en el otro', async () => {
    const id = await demoApi.createBusiness({ name: 'Hamburguesería', business_type: 'gastronomia', currency: 'ARS', prices_include_taxes: null });
    selectDemoBusiness(id);
    await demoApi.createIngredient({ name: 'Pan de hamburguesa', purchase_unit: 'unit', purchase_qty: '12', purchase_price: '3600', waste_pct: '0' });
    expect((await demoApi.listIngredients()).map((i) => i.name)).toEqual(['Pan de hamburguesa']);

    selectDemoBusiness(DEMO_BUSINESS.id);
    expect((await demoApi.listIngredients()).map((i) => i.name)).not.toContain('Pan de hamburguesa');
  });

  it('eliminar un negocio borra sus datos y deja los otros intactos', async () => {
    const id = await demoApi.createBusiness({ name: 'Temporal', business_type: 'otro', currency: 'USD', prices_include_taxes: null });
    await demoApi.deleteBusiness(id);
    expect((await demoApi.listBusinesses()).map((b) => b.id)).toEqual([DEMO_BUSINESS.id]);
    selectDemoBusiness(DEMO_BUSINESS.id);
    expect((await demoApi.listProducts()).length).toBe(4);
  });

  it('editar el nombre de un negocio', async () => {
    await demoApi.updateBusiness(DEMO_BUSINESS.id, { name: 'Pastelería Rosa' });
    expect((await demoApi.listBusinesses())[0]!.name).toBe('Pastelería Rosa');
  });
});

describe('confirmación para eliminar', () => {
  it('acepta el nombre sin importar mayúsculas ni espacios de más', () => {
    expect(sameName('  pastelería demo ', 'Pastelería Demo')).toBe(true);
  });

  it('no acepta otro nombre ni uno incompleto', () => {
    expect(sameName('Pasteleria Demo', 'Pastelería Demo')).toBe(false);
    expect(sameName('Pastelería', 'Pastelería Demo')).toBe(false);
    expect(sameName('', 'Pastelería Demo')).toBe(false);
  });
});
