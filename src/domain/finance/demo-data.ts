import type { BusinessSnapshot } from './types';

/**
 * "Pastelería Demo": datos ficticios para la demo pública (sin cuenta, sin base)
 * y para tests. Mismos valores que public.create_demo_business() en Supabase.
 */
export const DEMO_SNAPSHOT: BusinessSnapshot = {
  currency: 'ARS',
  settings: { defaultTargetMargin: '0.30' },
  ingredients: [
    { id: 'choc', name: 'Chocolate semiamargo', purchaseUnit: 'kg', purchaseQty: 1, purchasePrice: '18000' },
    { id: 'ddl', name: 'Dulce de leche', purchaseUnit: 'kg', purchaseQty: 1, purchasePrice: '4500' },
    { id: 'harina', name: 'Harina 0000', purchaseUnit: 'kg', purchaseQty: 1, purchasePrice: '1500' },
    { id: 'azucar', name: 'Azúcar', purchaseUnit: 'kg', purchaseQty: 1, purchasePrice: '1200' },
    { id: 'manteca', name: 'Manteca', purchaseUnit: 'g', purchaseQty: 500, purchasePrice: '5000' },
    { id: 'huevo', name: 'Huevos', purchaseUnit: 'unit', purchaseQty: 30, purchasePrice: '6000' },
    { id: 'caja', name: 'Caja individual', purchaseUnit: 'unit', purchaseQty: 100, purchasePrice: '25000' },
    { id: 'etiqueta', name: 'Etiqueta', purchaseUnit: 'unit', purchaseQty: 100, purchasePrice: '5000' },
  ],
  laborRates: [{ id: 'mo', name: 'Mano de obra general', hourlyRate: '6000' }],
  fixedCosts: [
    { id: 'alquiler', name: 'Alquiler del local', category: 'rent', monthlyAmount: '450000', isActive: true },
    { id: 'contador', name: 'Contador', category: 'accounting', monthlyAmount: '60000', isActive: true },
    { id: 'internet', name: 'Internet', category: 'internet', monthlyAmount: '25000', isActive: true },
    { id: 'software', name: 'Software de gestión', category: 'software', monthlyAmount: '15000', isActive: true },
    { id: 'publicidad', name: 'Publicidad en redes', category: 'advertising', monthlyAmount: '80000', isActive: true },
  ],
  variableCosts: [
    { id: 'mp', name: 'Mercado Pago', percentOfSale: '0.0639', amountPerUnit: 0, appliesTo: 'all', productIds: [], shareOfSales: '0.7', isActive: true },
    { id: 'iibb', name: 'Ingresos Brutos', percentOfSale: '0.035', amountPerUnit: 0, appliesTo: 'all', productIds: [], shareOfSales: 1, isActive: true },
    { id: 'meli', name: 'MercadoLibre', percentOfSale: '0.15', amountPerUnit: 0, appliesTo: 'selected', productIds: ['alfajor', 'brownie'], shareOfSales: '0.6', isActive: true },
  ],
  products: [
    {
      id: 'alfajor', name: 'Alfajor Premium', category: 'Alfajores', price: '6000', monthlyUnits: 400, targetMargin: '0.30',
      components: [
        { id: 'a1', kind: 'ingredient', ingredientId: 'choc', quantity: 80, unit: 'g' },
        { id: 'a2', kind: 'ingredient', ingredientId: 'ddl', quantity: 100, unit: 'g' },
        { id: 'a3', kind: 'ingredient', ingredientId: 'harina', quantity: 40, unit: 'g' },
        { id: 'a4', kind: 'packaging', ingredientId: 'caja', quantity: 1, unit: 'unit' },
        { id: 'a5', kind: 'packaging', ingredientId: 'etiqueta', quantity: 1, unit: 'unit' },
        { id: 'a6', kind: 'labor', laborRateId: 'mo', quantity: 8, unit: 'min' },
      ],
    },
    {
      id: 'brownie', name: 'Brownie', category: 'Individuales', price: '4500', monthlyUnits: 300, targetMargin: '0.30',
      components: [
        { id: 'b1', kind: 'ingredient', ingredientId: 'choc', quantity: 60, unit: 'g' },
        { id: 'b2', kind: 'ingredient', ingredientId: 'harina', quantity: 30, unit: 'g' },
        { id: 'b3', kind: 'ingredient', ingredientId: 'azucar', quantity: 40, unit: 'g' },
        { id: 'b4', kind: 'ingredient', ingredientId: 'manteca', quantity: 40, unit: 'g' },
        { id: 'b5', kind: 'ingredient', ingredientId: 'huevo', quantity: 1, unit: 'unit' },
        { id: 'b6', kind: 'packaging', ingredientId: 'caja', quantity: 1, unit: 'unit' },
        { id: 'b7', kind: 'packaging', ingredientId: 'etiqueta', quantity: 1, unit: 'unit' },
        { id: 'b8', kind: 'labor', laborRateId: 'mo', quantity: 6, unit: 'min' },
      ],
    },
    {
      id: 'torta', name: 'Torta Chocolate', category: 'Tortas', price: '32000', monthlyUnits: 30, targetMargin: '0.30',
      components: [
        { id: 't1', kind: 'ingredient', ingredientId: 'choc', quantity: 300, unit: 'g' },
        { id: 't2', kind: 'ingredient', ingredientId: 'ddl', quantity: 300, unit: 'g' },
        { id: 't3', kind: 'ingredient', ingredientId: 'harina', quantity: 250, unit: 'g' },
        { id: 't4', kind: 'ingredient', ingredientId: 'azucar', quantity: 200, unit: 'g' },
        { id: 't5', kind: 'ingredient', ingredientId: 'manteca', quantity: 200, unit: 'g' },
        { id: 't6', kind: 'ingredient', ingredientId: 'huevo', quantity: 4, unit: 'unit' },
        { id: 't7', kind: 'packaging', ingredientId: 'caja', quantity: 1, unit: 'unit' },
        { id: 't8', kind: 'packaging', ingredientId: 'etiqueta', quantity: 1, unit: 'unit' },
        { id: 't9', kind: 'labor', laborRateId: 'mo', quantity: 90, unit: 'min' },
      ],
    },
    {
      id: 'cookie', name: 'Cookie de chocolate', category: 'Individuales', price: '1800', monthlyUnits: 600, targetMargin: '0.30',
      components: [
        { id: 'c1', kind: 'ingredient', ingredientId: 'choc', quantity: 20, unit: 'g' },
        { id: 'c2', kind: 'ingredient', ingredientId: 'harina', quantity: 25, unit: 'g' },
        { id: 'c3', kind: 'ingredient', ingredientId: 'azucar', quantity: 15, unit: 'g' },
        { id: 'c4', kind: 'ingredient', ingredientId: 'manteca', quantity: 15, unit: 'g' },
        { id: 'c5', kind: 'packaging', ingredientId: 'etiqueta', quantity: 1, unit: 'unit' },
        { id: 'c6', kind: 'labor', laborRateId: 'mo', quantity: 3, unit: 'min' },
      ],
    },
  ],
};
