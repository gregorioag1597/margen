import { parseDecimal, sum, ZERO, type Dec, type DecimalInput } from './money';
import { fail, ok, type Result } from './result';
import type { Ingredient, LaborRate, ProductComponent, UnitCode } from './types';
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
  cost: Dec;
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

/** Costo de un componente dentro de 1 unidad de producto. */
export function calculateComponentCost(
  component: ProductComponent,
  lookup: CostLookup,
): Result<ComponentCost> {
  switch (component.kind) {
    case 'ingredient':
    case 'packaging': {
      const ingredient = lookup.ingredients.get(component.ingredientId);
      if (!ingredient) return fail('MISSING_REFERENCE', component.ingredientId);
      if (!areUnitsCompatible(component.unit, ingredient.purchaseUnit)) {
        return fail('INCOMPATIBLE_UNITS', `${ingredient.name}: ${component.unit} vs ${ingredient.purchaseUnit}`);
      }
      const unitCost = calculateIngredientUnitCost(ingredient);
      if (!unitCost.ok) return unitCost;
      const qty = toBaseQuantity(component.quantity, component.unit);
      if (!qty.ok) return qty;
      return ok({
        componentId: component.id,
        category: component.kind === 'packaging' ? 'packaging' : 'rawMaterials',
        cost: qty.value.times(unitCost.value),
      });
    }
    case 'labor': {
      const rate = lookup.laborRates.get(component.laborRateId);
      if (!rate) return fail('MISSING_REFERENCE', component.laborRateId);
      const cost = calculateLaborCost(rate.hourlyRate, component.quantity, component.unit);
      if (!cost.ok) return cost;
      return ok({ componentId: component.id, category: 'labor', cost: cost.value });
    }
    case 'other': {
      const amount = parseDecimal(component.amount);
      if (amount === null || amount.lt(0)) return fail('INVALID_INPUT', component.label);
      return ok({ componentId: component.id, category: 'other', cost: amount });
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
}

/** Costo directo de 1 unidad: materia prima + packaging + mano de obra + otros. */
export function calculateProductDirectCost(
  components: readonly ProductComponent[],
  lookup: CostLookup,
): Result<DirectCostBreakdown> {
  const lines: ComponentCost[] = [];
  for (const component of components) {
    const line = calculateComponentCost(component, lookup);
    if (!line.ok) return line;
    lines.push(line.value);
  }
  const byCategory = (c: DirectCostCategory) =>
    sum(lines.filter((l) => l.category === c).map((l) => l.cost));

  return ok({
    rawMaterials: byCategory('rawMaterials'),
    packaging: byCategory('packaging'),
    labor: byCategory('labor'),
    other: byCategory('other'),
    total: lines.length ? sum(lines.map((l) => l.cost)) : ZERO,
    lines,
  });
}
