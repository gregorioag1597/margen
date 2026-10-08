import Decimal from 'decimal.js';
import {
  dec,
  ONE,
  roundMoney,
  type BusinessSnapshot,
  type Dec,
  type ScenarioChange,
} from '@/domain/finance';
import { parseLocaleDecimal } from '@/lib/number-input';

/**
 * Palancas del simulador, tal como las escribe el usuario (porcentajes "10" = +10 %).
 * Vacío = esa palanca no se usa.
 */
export interface Levers {
  pricePct: string;
  priceProductIds: 'all' | string[];
  ingredientCostPct: string;
  volumePct: string;
  fixedCostsPct: string;
  commission: { variableCostId: string; newPercent: string } | null;
}

export const EMPTY_LEVERS: Levers = {
  pricePct: '',
  priceProductIds: 'all',
  ingredientCostPct: '',
  volumePct: '',
  fixedCostsPct: '',
  commission: null,
};

/**
 * Un cambio concreto sobre un dato real. Es exactamente lo que se simula y lo
 * que se aplica: así lo que ves en el simulador es lo que queda guardado.
 */
export type PlanItem = {
  target: 'product_price' | 'product_units' | 'ingredient_price' | 'variable_cost_percent' | 'fixed_cost_amount';
  id: string;
  label: string;
  from: Dec;
  to: Dec;
};

export type LeverError = Partial<Record<'pricePct' | 'ingredientCostPct' | 'volumePct' | 'fixedCostsPct' | 'commission', string>>;

/** Porcentaje escrito → fracción. Vacío = sin cambio. Inválido = error. */
function readPct(raw: string, min: number, max: number): { ok: true; value: Dec | null } | { ok: false } {
  if (raw.trim() === '') return { ok: true, value: null };
  const n = parseLocaleDecimal(raw);
  if (n === null || n.lte(min) || n.gt(max)) return { ok: false };
  return { ok: true, value: n.isZero() ? null : n.div(100) };
}

const grow = (value: Dec, pct: Dec) => value.times(ONE.plus(pct));

export function buildScenarioPlan(snapshot: BusinessSnapshot, levers: Levers): { plan: PlanItem[]; errors: LeverError } {
  const errors: LeverError = {};
  const plan: PlanItem[] = [];

  // Precios de venta: centavos.
  const price = readPct(levers.pricePct, -100, 500);
  if (!price.ok) errors.pricePct = 'Entre −99 % y +500 %.';
  else if (price.value) {
    for (const p of snapshot.products) {
      if (p.price === null || (levers.priceProductIds !== 'all' && !levers.priceProductIds.includes(p.id))) continue;
      const from = dec(p.price);
      plan.push({ target: 'product_price', id: p.id, label: p.name, from, to: roundMoney(grow(from, price.value)) });
    }
  }

  // Insumos: solo los que usa algún producto (no tiene sentido tocar el resto).
  const ingredientPct = readPct(levers.ingredientCostPct, -100, 500);
  if (!ingredientPct.ok) errors.ingredientCostPct = 'Entre −99 % y +500 %.';
  else if (ingredientPct.value) {
    const used = new Set(snapshot.products.flatMap((p) => p.components.flatMap((c) => ('ingredientId' in c ? [c.ingredientId] : []))));
    for (const i of snapshot.ingredients) {
      if (!used.has(i.id)) continue;
      const from = dec(i.purchasePrice);
      plan.push({ target: 'ingredient_price', id: i.id, label: i.name, from, to: roundMoney(grow(from, ingredientPct.value)) });
    }
  }

  // Ventas estimadas: enteras (la base guarda unidades enteras).
  const volume = readPct(levers.volumePct, -100, 1000);
  if (!volume.ok) errors.volumePct = 'Entre −99 % y +1000 %.';
  else if (volume.value) {
    for (const p of snapshot.products) {
      const from = dec(p.monthlyUnits);
      const to = grow(from, volume.value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      if (!to.eq(from)) plan.push({ target: 'product_units', id: p.id, label: p.name, from, to });
    }
  }

  // Costos fijos activos: centavos.
  const fixed = readPct(levers.fixedCostsPct, -100, 500);
  if (!fixed.ok) errors.fixedCostsPct = 'Entre −100 % y +500 %.';
  else if (fixed.value) {
    for (const f of snapshot.fixedCosts.filter((x) => x.isActive)) {
      const from = dec(f.monthlyAmount);
      plan.push({ target: 'fixed_cost_amount', id: f.id, label: f.name, from, to: roundMoney(grow(from, fixed.value)) });
    }
  }

  // Comisión: nuevo porcentaje absoluto.
  if (levers.commission && levers.commission.newPercent.trim() !== '') {
    const vc = snapshot.variableCosts.find((v) => v.id === levers.commission!.variableCostId);
    const n = parseLocaleDecimal(levers.commission.newPercent);
    if (!vc) errors.commission = 'Elegí un costo de venta.';
    else if (n === null || n.lt(0) || n.gte(100)) errors.commission = 'Entre 0 y 99,99 %.';
    else {
      const from = dec(vc.percentOfSale);
      const to = n.div(100).toDecimalPlaces(6);
      if (!to.eq(from)) plan.push({ target: 'variable_cost_percent', id: vc.id, label: vc.name, from, to });
    }
  }

  return { plan, errors };
}

/** Plan concreto → cambios para el motor (valores absolutos). */
export function planToChanges(plan: readonly PlanItem[]): ScenarioChange[] {
  return plan.map((item): ScenarioChange => {
    const v = item.to.toString();
    switch (item.target) {
      case 'product_price':
        return { type: 'product_price', productId: item.id, price: v };
      case 'product_units':
        return { type: 'product_volume', productId: item.id, monthlyUnits: v };
      case 'ingredient_price':
        return { type: 'ingredient_price', ingredientId: item.id, purchasePrice: v };
      case 'variable_cost_percent':
        return { type: 'variable_cost_percent', variableCostId: item.id, percentOfSale: v };
      case 'fixed_cost_amount':
        return { type: 'fixed_cost_amount', fixedCostId: item.id, monthlyAmount: v };
    }
  });
}

/** Plan → payload para la función apply_scenario de la base. */
export function planToRpcItems(plan: readonly PlanItem[]) {
  return plan.map((i) => ({ target: i.target, id: i.id, value: i.to.toString() }));
}

export function hasAnyLever(levers: Levers): boolean {
  return Boolean(
    levers.pricePct.trim() || levers.ingredientCostPct.trim() || levers.volumePct.trim() || levers.fixedCostsPct.trim() || levers.commission?.newPercent.trim(),
  );
}
