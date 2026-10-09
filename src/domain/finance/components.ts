import { ONE, parseDecimal, sum, ZERO, type Dec, type DecimalInput } from './money';
import { fail, ok, type Result } from './result';
import type { ComponentBasis, Ingredient, LaborRate, ProductComponent, UnitCode } from './types';
import { areUnitsCompatible, toBaseQuantity, unitFamily } from './units';

/**
 * Costo de 1 unidad base del insumo (por g, ml, unidad, cm o min).
 * Chocolate 1 kg a $18.000 → $18 por g.
 */
export function calculateIngredientUnitCost(
  ingredient: Pick<Ingredient, 'purchaseQty' | 'purchaseUnit' | 'purchasePrice'>,
): Result<Dec> {
  const price = parseDecimal(ingredient.purchasePrice);
  if (price === null || price.lt(0)) return fail('INVALID_INPUT', 'purchasePrice');

  const qty = toBaseQuantity(ingredient.purchaseQty, ingredient.purchaseUnit);
  if (!qty.ok) return qty;
  if (qty.value.isZero()) return fail('INVALID_QUANTITY', 'purchaseQty = 0');

  return ok(price.div(qty.value));
}

export const MAX_WASTE = 0.9;

/**
 * Costo por unidad base USABLE, descontando la merma.
 * Frutillas a $4/g con 20 % de merma → $4 ÷ 0,8 = $5 por g usable.
 * Sin merma es igual al costo unitario de compra.
 */
export function calculateIngredientUsableCost(
  ingredient: Pick<Ingredient, 'purchaseQty' | 'purchaseUnit' | 'purchasePrice' | 'wastePct'>,
): Result<Dec> {
  const unitCost = calculateIngredientUnitCost(ingredient);
  if (!unitCost.ok) return unitCost;
  const waste = ingredient.wastePct === undefined || ingredient.wastePct === null ? ZERO : parseDecimal(ingredient.wastePct);
  if (waste === null || waste.lt(0) || waste.gt(MAX_WASTE)) return fail('INVALID_INPUT', 'wastePct');
  return ok(unitCost.value.div(ONE.minus(waste)));
}

/** Mano de obra: tarifa por hora ÷ 60 × minutos. $6.000/h × 12 min = $1.200. */
export function calculateLaborCost(
  hourlyRate: DecimalInput,
  quantity: DecimalInput,
  unit: UnitCode,
): Result<Dec> {
  const rate = parseDecimal(hourlyRate);
  if (rate === null || rate.lt(0)) return fail('INVALID_INPUT', 'hourlyRate');
  if (unitFamily(unit) !== 'time') return fail('INCOMPATIBLE_UNITS', `${unit} no es tiempo`);

  const minutes = toBaseQuantity(quantity, unit);
  if (!minutes.ok) return minutes;
  return ok(rate.div(60).times(minutes.value));
}

export type DirectCostCategory = 'rawMaterials' | 'packaging' | 'labor' | 'other';

export interface ComponentCost {
  componentId: string;
  category: DirectCostCategory;
  /** Costo por UNIDAD de producto (si es "por tanda", ya dividido por el rinde). */
  cost: Dec;
  /** Costo de la cantidad tal como se cargó (de la tanda o de la unidad). */
  amount: Dec;
  basis: ComponentBasis;
}

export interface CostLookup {
  ingredients: ReadonlyMap<string, Ingredient>;
  laborRates: ReadonlyMap<string, LaborRate>;
}

export function buildCostLookup(ingredients: Ingredient[], laborRates: LaborRate[]): CostLookup {
  return {
    ingredients: new Map(ingredients.map((i) => [i.id, i])),
    laborRates: new Map(laborRates.map((r) => [r.id, r])),
  };
}

/**
 * Costo de un componente. `batchYield` = unidades que rinde la tanda:
 * los componentes "por tanda" se dividen por el rinde; los "por unidad", no.
 */
export function calculateComponentCost(
  component: ProductComponent,
  lookup: CostLookup,
  batchYield: Dec = ONE,
): Result<ComponentCost> {
  const basis: ComponentBasis = component.basis ?? 'batch';
  const line = (category: DirectCostCategory, amount: Dec): Result<ComponentCost> =>
    ok({ componentId: component.id, category, amount, basis, cost: basis === 'batch' ? amount.div(batchYield) : amount });

  switch (component.kind) {
    case 'ingredient':
    case 'packaging': {
      const ingredient = lookup.ingredients.get(component.ingredientId);
      if (!ingredient) return fail('MISSING_REFERENCE', component.ingredientId);
      if (!areUnitsCompatible(component.unit, ingredient.purchaseUnit)) {
        return fail('INCOMPATIBLE_UNITS', `${ingredient.name}: ${component.unit} vs ${ingredient.purchaseUnit}`);
      }
      const usableCost = calculateIngredientUsableCost(ingredient);
      if (!usableCost.ok) return usableCost;
      const qty = toBaseQuantity(component.quantity, component.unit);
      if (!qty.ok) return qty;
      return line(component.kind === 'packaging' ? 'packaging' : 'rawMaterials', qty.value.times(usableCost.value));
    }
    case 'labor': {
      const rate = lookup.laborRates.get(component.laborRateId);
      if (!rate) return fail('MISSING_REFERENCE', component.laborRateId);
      const cost = calculateLaborCost(rate.hourlyRate, component.quantity, component.unit);
      if (!cost.ok) return cost;
      return line('labor', cost.value);
    }
    case 'other': {
      const amount = parseDecimal(component.amount);
      if (amount === null || amount.lt(0)) return fail('INVALID_INPUT', component.label);
      return line('other', amount);
    }
  }
}

export interface DirectCostBreakdown {
  rawMaterials: Dec;
  packaging: Dec;
  labor: Dec;
  other: Dec;
  total: Dec;
  lines: ComponentCost[];
  /** Unidades que rinde la tanda (1 = receta por unidad). */
  batchYield: Dec;
  /** Costo de toda la tanda (componentes "por tanda" + "por unidad" × rinde). */
  batchTotal: Dec;
}

/**
 * Costo directo de 1 unidad: materia prima + packaging + mano de obra + otros.
 *   por unidad = Σ(componentes por tanda) ÷ rinde + Σ(componentes por unidad)
 */
export function calculateProductDirectCost(
  components: readonly ProductComponent[],
  lookup: CostLookup,
  batchYield: DecimalInput = 1,
): Result<DirectCostBreakdown> {
  const yieldQty = parseDecimal(batchYield);
  if (yieldQty === null || !yieldQty.gt(0)) return fail('INVALID_QUANTITY', 'batchYield');

  const lines: ComponentCost[] = [];
  for (const component of components) {
    const line = calculateComponentCost(component, lookup, yieldQty);
    if (!line.ok) return line;
    lines.push(line.value);
  }
  const total = lines.length ? sum(lines.map((l) => l.cost)) : ZERO;
  const byCategory = (c: DirectCostCategory) =>
    sum(lines.filter((l) => l.category === c).map((l) => l.cost));

  return ok({
    rawMaterials: byCategory('rawMaterials'),
    packaging: byCategory('packaging'),
    labor: byCategory('labor'),
    other: byCategory('other'),
    total,
    lines,
    batchYield: yieldQty,
    batchTotal: total.times(yieldQty),
  });
}
