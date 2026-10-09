import { DEMO_SNAPSHOT } from '@/domain/finance';
import type { Business } from '@/features/business/api';
import type { FixedCostRow, LaborRateRow, VariableCostRow } from '@/features/costs/schemas';
import type { IngredientRow } from '@/features/ingredients/schemas';
import type { MovementRow } from '@/features/movements/schemas';
import type { ComponentRow, ProductRow } from '@/features/products/schemas';
import { DataError } from './supabase';

/**
 * Base de datos en memoria para la demo pública. Imita lo que hace Supabase
 * (incluidos los historiales de precios que generan los triggers y las
 * restricciones más importantes), para que la demo se comporte igual que la app real.
 * Se reinicia al recargar la página.
 */

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);
const clone = <T,>(v: T): T => structuredClone(v);
const str = (v: unknown) => String(v);

export const DEMO_BUSINESS: Business = {
  id: 'demo-business',
  name: 'Pastelería Demo',
  business_type: 'gastronomia',
  currency: 'ARS',
  prices_include_taxes: true,
  default_target_margin: '0.3',
  settings: {},
  is_demo: true,
};

const SUPPLIERS: Record<string, string> = { choc: 'Distribuidora Sur', caja: 'Packaging Express' };
const VARIABLE_CATEGORY: Record<string, VariableCostRow['category']> = { mp: 'payment_fee', iibb: 'tax', meli: 'marketplace' };

interface PriceHistory { id: string; ingredient_id: string; purchase_unit: IngredientRow['purchase_unit']; purchase_qty: string; purchase_price: string; effective_at: string }
interface ProductPriceHistory { id: string; product_id: string; price: string; effective_at: string }
interface ScenarioRow { id: string; name: string; created_at: string; changes: unknown[]; status: 'draft' | 'applied' }

/** Fecha del mes actual (o de meses anteriores) sin pasarse de hoy. */
function demoDate(monthOffset: number, day: number): string {
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const safeDay = monthOffset === 0 ? Math.min(day, today.getDate()) : Math.min(day, lastDay);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function seedMovements(): MovementRow[] {
  type Seed = [monthOffset: number, day: number, kind: MovementRow['kind'], concept: string, category: string, amount: string, extra?: Partial<MovementRow>];
  const seeds: Seed[] = [
    // Mes actual
    [0, 1, 'expense', 'Alquiler del local', 'rent', '450000', { fixed_cost_id: 'alquiler' }],
    [0, 2, 'income', 'Ventas de mostrador', 'sale', '650000', { payment_method: 'cash' }],
    [0, 3, 'expense', 'Compra de chocolate', 'raw_materials', '180000', { supplier: 'Distribuidora Sur', ingredient_id: 'choc', ingredient_qty: '10', ingredient_unit: 'kg' }],
    [0, 4, 'income', 'Ventas online', 'sale', '820000', { payment_method: 'mercado_pago', product_id: 'alfajor' }],
    [0, 5, 'expense', 'Harina, azúcar y manteca', 'raw_materials', '96000'],
    [0, 5, 'expense', 'Cajas y etiquetas', 'packaging', '60000', { supplier: 'Packaging Express' }],
    [0, 6, 'income', 'Pedido de tortas para evento', 'sale', '256000', { payment_method: 'transfer', product_id: 'torta' }],
    [0, 7, 'expense', 'Publicidad en redes', 'advertising', '80000', { fixed_cost_id: 'publicidad' }],
    [0, 8, 'income', 'Taller de pastelería', 'service', '120000', { payment_method: 'transfer' }],
    [0, 8, 'expense', 'Ingresos Brutos', 'taxes', '52000'],
    [0, 8, 'expense', 'Internet', 'utilities', '25000', { fixed_cost_id: 'internet' }],
    // Mes anterior
    [-1, 1, 'expense', 'Alquiler del local', 'rent', '450000'],
    [-1, 10, 'income', 'Ventas del mes', 'sale', '2450000', { payment_method: 'mercado_pago' }],
    [-1, 12, 'expense', 'Insumos del mes', 'raw_materials', '610000'],
    [-1, 20, 'expense', 'Contador', 'other', '60000'],
  ];
  return seeds.map(([offset, day, kind, concept, category, amount, extra], i) => ({
    id: `mov-${i}`, kind, occurred_on: demoDate(offset, day), concept, category, amount,
    product_id: null, payment_method: null, supplier: null, notes: null,
    fixed_cost_id: null, ingredient_id: null, ingredient_qty: null, ingredient_unit: null,
    created_at: daysAgo(30 - i), ...extra,
  }));
}

function seed() {
  const s = DEMO_SNAPSHOT;
  const ingredients: IngredientRow[] = s.ingredients.map((i) => ({
    id: i.id, name: i.name, supplier: SUPPLIERS[i.id] ?? null, purchase_unit: i.purchaseUnit,
    purchase_qty: str(i.purchaseQty), purchase_price: str(i.purchasePrice), waste_pct: '0', price_updated_at: now(), notes: null, archived_at: null,
  }));
  // Ejemplo de merma: de 1 kg de frutillas quedan 800 g limpias (no se usa en productos: no cambia los totales).
  ingredients.push({
    id: 'frutillas', name: 'Frutillas', supplier: 'Verdulería Don José', purchase_unit: 'kg', purchase_qty: '1', purchase_price: '4000',
    waste_pct: '0.2', price_updated_at: now(), notes: 'Se pierde el cabito y las golpeadas.', archived_at: null,
  });
  const products: ProductRow[] = s.products.map((p) => ({
    id: p.id, name: p.name, category: p.category ?? null, price: p.price === null ? null : str(p.price),
    monthly_units_estimate: Number(p.monthlyUnits), batch_yield: '1', target_margin: p.targetMargin === null ? null : str(p.targetMargin),
    notes: null, archived_at: null, price_updated_at: now(),
    product_components: p.components.map((c, idx): ComponentRow => ({
      id: c.id, kind: c.kind,
      ingredient_id: c.kind === 'ingredient' || c.kind === 'packaging' ? c.ingredientId : null,
      labor_rate_id: c.kind === 'labor' ? c.laborRateId : null,
      quantity: c.kind === 'other' ? null : str(c.quantity),
      unit: c.kind === 'other' ? null : c.unit,
      fixed_amount: c.kind === 'other' ? str(c.amount) : null,
      label: c.kind === 'other' ? c.label : null,
      position: idx + 1,
      basis: 'batch',
    })),
  }));
  // Ejemplo de receta por tanda: el alfajor se carga como tanda de 48 (mismo costo por unidad).
  const alfajor = products.find((p) => p.id === 'alfajor')!;
  alfajor.batch_yield = '48';
  for (const c of alfajor.product_components) {
    if (c.kind === 'packaging') c.basis = 'unit';
    else if (c.kind === 'labor') { c.quantity = '6.4'; c.unit = 'h'; }
    else if (c.quantity) c.quantity = str(Number(c.quantity) * 48);
  }
  return {
    ingredients,
    laborRates: s.laborRates.map((r): LaborRateRow => ({ id: r.id, name: r.name, hourly_rate: str(r.hourlyRate), is_default: true })),
    products,
    fixedCosts: s.fixedCosts.map((f): FixedCostRow => ({ id: f.id, name: f.name, category: f.category, monthly_amount: str(f.monthlyAmount), is_active: f.isActive, notes: null })),
    variableCosts: s.variableCosts.map((v): VariableCostRow => ({
      id: v.id, name: v.name, category: VARIABLE_CATEGORY[v.id] ?? 'other', percent_of_sale: str(v.percentOfSale),
      amount_per_unit: str(v.amountPerUnit), applies_to: v.appliesTo, share_of_sales: str(v.shareOfSales), is_active: v.isActive,
      notes: null, variable_cost_products: v.productIds.map((product_id) => ({ product_id })),
    })),
    ingredientHistory: [
      { id: uid(), ingredient_id: 'choc', purchase_unit: 'kg', purchase_qty: '1', purchase_price: '16000', effective_at: daysAgo(120) },
      { id: uid(), ingredient_id: 'choc', purchase_unit: 'kg', purchase_qty: '1', purchase_price: '17000', effective_at: daysAgo(60) },
      ...ingredients.map((i) => ({ id: uid(), ingredient_id: i.id, purchase_unit: i.purchase_unit, purchase_qty: i.purchase_qty, purchase_price: i.purchase_price, effective_at: now() })),
    ] as PriceHistory[],
    productHistory: [
      { id: uid(), product_id: 'alfajor', price: '5000', effective_at: daysAgo(120) },
      { id: uid(), product_id: 'alfajor', price: '5500', effective_at: daysAgo(60) },
      ...products.filter((p) => p.price).map((p) => ({ id: uid(), product_id: p.id, price: p.price!, effective_at: now() })),
    ] as ProductPriceHistory[],
    scenarios: [] as ScenarioRow[],
    movements: seedMovements(),
  };
}

let db = seed();

/** Solo para tests. */
export function resetDemoStore() {
  db = seed();
}

const find = <T extends { id: string }>(rows: T[], id: string): T => {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new DataError('No se encontró el dato', 'P0002');
  return row;
};

function logIngredientPrice(i: IngredientRow) {
  i.price_updated_at = now();
  db.ingredientHistory.push({ id: uid(), ingredient_id: i.id, purchase_unit: i.purchase_unit, purchase_qty: i.purchase_qty, purchase_price: i.purchase_price, effective_at: i.price_updated_at });
}

function setProductPrice(p: ProductRow, price: string | null) {
  if (price !== null && Number(price) <= 0) throw new DataError('Precio inválido', '23514');
  const changed = price !== null && price !== p.price;
  p.price = price;
  if (changed) {
    p.price_updated_at = now();
    db.productHistory.push({ id: uid(), product_id: p.id, price, effective_at: p.price_updated_at });
  }
}

const isUsed = (ingredientId: string) => db.products.some((p) => p.product_components.some((c) => c.ingredient_id === ingredientId));

type Patch<T> = Partial<Record<keyof T, unknown>>;

/** Misma interfaz que las funciones de api.ts de cada sección. */
export const demoApi = {
  // Negocio
  listBusinesses: async () => [clone(DEMO_BUSINESS)],

  // Insumos
  listIngredients: async () => clone([...db.ingredients].sort((a, b) => a.name.localeCompare(b.name))),
  listIngredientUsage: async () => {
    const map = new Map<string, number>();
    for (const i of db.ingredients) {
      const n = db.products.filter((p) => p.product_components.some((c) => c.ingredient_id === i.id)).length;
      if (n) map.set(i.id, n);
    }
    return map;
  },
  createIngredient: async (payload: Patch<IngredientRow>) => {
    const row = { id: uid(), archived_at: null, price_updated_at: now(), ...payload } as IngredientRow;
    db.ingredients.push(row);
    logIngredientPrice(row);
  },
  updateIngredient: async (id: string, payload: Patch<IngredientRow>) => {
    const row = find(db.ingredients, id);
    if (payload.purchase_unit && payload.purchase_unit !== row.purchase_unit && isUsed(id)) {
      const fam = (u: string) => ({ kg: 'm', g: 'm', l: 'v', ml: 'v' } as Record<string, string>)[u] ?? u;
      if (fam(String(payload.purchase_unit)) !== fam(row.purchase_unit)) throw new DataError('Unidad incompatible', '23503');
    }
    const priceChanged = ['purchase_price', 'purchase_qty', 'purchase_unit'].some(
      (k) => k in payload && String(payload[k as keyof IngredientRow]) !== String(row[k as keyof IngredientRow]),
    );
    Object.assign(row, payload);
    if (priceChanged) logIngredientPrice(row);
  },
  setIngredientArchived: async (id: string, archived: boolean) => {
    find(db.ingredients, id).archived_at = archived ? now() : null;
  },
  deleteIngredient: async (id: string) => {
    if (isUsed(id)) throw new DataError('En uso', '23503');
    db.ingredients = db.ingredients.filter((i) => i.id !== id);
  },
  listIngredientPriceHistory: async (ingredientId: string) =>
    clone(db.ingredientHistory.filter((h) => h.ingredient_id === ingredientId).sort((a, b) => b.effective_at.localeCompare(a.effective_at))),

  // Costos
  listFixedCosts: async () => clone(db.fixedCosts),
  saveFixedCost: async (id: string | null, payload: Patch<FixedCostRow>) => {
    if (id) Object.assign(find(db.fixedCosts, id), payload);
    else db.fixedCosts.push({ id: uid(), is_active: true, ...payload } as FixedCostRow);
  },
  setFixedCostActive: async (id: string, active: boolean) => {
    find(db.fixedCosts, id).is_active = active;
  },
  deleteFixedCost: async (id: string) => {
    db.fixedCosts = db.fixedCosts.filter((f) => f.id !== id);
  },
  listVariableCosts: async () => clone(db.variableCosts),
  saveVariableCost: async (id: string | null, cost: Patch<VariableCostRow>, productIds: string[]) => {
    const links = productIds.map((product_id) => ({ product_id }));
    if (id) Object.assign(find(db.variableCosts, id), cost, { variable_cost_products: links });
    else db.variableCosts.push({ id: uid(), is_active: true, ...cost, variable_cost_products: links } as VariableCostRow);
  },
  setVariableCostActive: async (id: string, active: boolean) => {
    find(db.variableCosts, id).is_active = active;
  },
  deleteVariableCost: async (id: string) => {
    db.variableCosts = db.variableCosts.filter((v) => v.id !== id);
  },
  listLaborRates: async () => clone(db.laborRates),
  saveDefaultLaborRate: async (existingId: string | null, hourlyRate: string) => {
    if (existingId) find(db.laborRates, existingId).hourly_rate = hourlyRate;
    else db.laborRates.push({ id: uid(), name: 'Mano de obra general', hourly_rate: hourlyRate, is_default: true });
  },
  countLaborComponents: async () => db.products.flatMap((p) => p.product_components).filter((c) => c.kind === 'labor').length,
  listProductOptions: async () => db.products.filter((p) => !p.archived_at).map((p) => ({ id: p.id, name: p.name })),

  // Productos
  listProducts: async () => clone([...db.products].sort((a, b) => a.name.localeCompare(b.name))),
  createProduct: async (payload: Patch<ProductRow>) => {
    const { price, ...rest } = payload;
    const row = { id: uid(), target_margin: null, archived_at: null, price: null, price_updated_at: null, product_components: [], ...rest } as ProductRow;
    db.products.push(row);
    setProductPrice(row, (price as string | null | undefined) ?? null);
    return row.id;
  },
  updateProduct: async (id: string, patch: Patch<ProductRow>) => {
    const row = find(db.products, id);
    const { price, ...rest } = patch;
    Object.assign(row, rest);
    if ('price' in patch) setProductPrice(row, (price as string | null) ?? null);
  },
  deleteProduct: async (id: string) => {
    db.products = db.products.filter((p) => p.id !== id);
    db.variableCosts.forEach((v) => { v.variable_cost_products = v.variable_cost_products.filter((x) => x.product_id !== id); });
  },
  saveComponent: async (productId: string, componentId: string | null, payload: Patch<ComponentRow>, position: number) => {
    const product = find(db.products, productId);
    if (componentId) Object.assign(find(product.product_components, componentId), payload);
    else product.product_components.push({ id: uid(), position, ...payload } as ComponentRow);
  },
  deleteComponent: async (componentId: string) => {
    for (const p of db.products) p.product_components = p.product_components.filter((c) => c.id !== componentId);
  },
  listProductPriceHistory: async (productId: string) =>
    clone(db.productHistory.filter((h) => h.product_id === productId).sort((a, b) => b.effective_at.localeCompare(a.effective_at)).slice(0, 12)),

  // Simulador
  applyScenario: async (name: string, items: { target: string; id: string; value: string }[]) => {
    // Todo o nada: se valida y aplica sobre una copia.
    const backup = clone(db);
    try {
      for (const item of items) {
        switch (item.target) {
          case 'product_price': setProductPrice(find(db.products, item.id), item.value); break;
          case 'product_units': find(db.products, item.id).monthly_units_estimate = Number(item.value); break;
          case 'ingredient_price': { const i = find(db.ingredients, item.id); i.purchase_price = item.value; logIngredientPrice(i); break; }
          case 'variable_cost_percent': find(db.variableCosts, item.id).percent_of_sale = item.value; break;
          case 'fixed_cost_amount': find(db.fixedCosts, item.id).monthly_amount = item.value; break;
          default: throw new DataError('Cambio no reconocido', '22023');
        }
      }
    } catch (e) {
      db = backup;
      throw e;
    }
    db.scenarios.push({ id: uid(), name, created_at: now(), changes: items, status: 'applied' });
    return items.length;
  },
  listDraftScenarios: async () => clone(db.scenarios.filter((s) => s.status === 'draft').reverse()),
  saveDraftScenario: async (name: string, levers: unknown) => {
    db.scenarios.push({ id: uid(), name, created_at: now(), changes: [levers], status: 'draft' });
  },
  deleteScenario: async (id: string) => {
    db.scenarios = db.scenarios.filter((s) => s.id !== id);
  },

  // Movimientos
  listMovements: async (from: string, to: string) =>
    clone(
      db.movements
        .filter((m) => m.occurred_on >= from && m.occurred_on <= to)
        .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at)),
    ),
  saveMovement: async (id: string | null, payload: Patch<MovementRow>) => {
    if (Number(payload.amount) <= 0) throw new DataError('Importe inválido', '23514');
    if (id) Object.assign(find(db.movements, id), payload);
    else db.movements.push({ id: uid(), created_at: now(), ...payload } as MovementRow);
  },
  deleteMovement: async (id: string) => {
    db.movements = db.movements.filter((m) => m.id !== id);
  },
};
