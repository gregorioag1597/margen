import Decimal from 'decimal.js';
import { DEFAULT_MARGIN_THRESHOLDS } from './config';
import { dec, ONE, roundMoney, ZERO, type Dec } from './money';
import { fail, ok, type Result } from './result';

/**
 * Margen = (precio − costo) ÷ precio.
 * Costo $4.200, precio $6.000 → 30 %.
 */
export function calculateMargin(price: Dec | null, totalCost: Dec): Result<Dec> {
  if (price === null || !price.gt(0)) return fail('MISSING_PRICE');
  return ok(price.minus(totalCost).div(price));
}

/**
 * Markup = (precio − costo) ÷ costo. NO es lo mismo que margen.
 * Costo $4.200, precio $6.000 → 42,86 % de markup (y 30 % de margen).
 */
export function calculateMarkup(price: Dec | null, totalCost: Dec): Result<Dec> {
  if (price === null || !price.gt(0)) return fail('MISSING_PRICE');
  if (!totalCost.gt(0)) return fail('ZERO_COST');
  return ok(price.minus(totalCost).div(totalCost));
}

/**
 * Cuánto te deja cada venta para cubrir costos fijos:
 * precio − costo directo − costos de venta.
 */
export function calculateContributionMargin(
  price: Dec,
  directCost: Dec,
  variablePercent: Dec,
  variablePerUnit: Dec,
): Dec {
  return price.minus(directCost).minus(price.times(variablePercent)).minus(variablePerUnit);
}

/** Costo total por unidad = directo + costos de venta (al precio dado) + fijos asignados. */
export function calculateTotalProductCost(input: {
  price: Dec;
  directCost: Dec;
  variablePercent: Dec;
  variablePerUnit: Dec;
  fixedPerUnit: Dec;
}): Dec {
  return input.directCost
    .plus(input.price.times(input.variablePercent))
    .plus(input.variablePerUnit)
    .plus(input.fixedPerUnit);
}

export interface PriceEvaluation {
  totalCost: Dec;
  profit: Dec;
  margin: Dec;
}

/**
 * ¿Qué pasaría a un precio dado? Usado para mostrar el margen real del
 * precio recomendado ya redondeado. Los fijos asignados no dependen del precio.
 */
export function evaluatePrice(input: {
  price: Dec;
  directCost: Dec;
  variablePercent: Dec;
  variablePerUnit: Dec;
  fixedPerUnit: Dec;
}): Result<PriceEvaluation> {
  const totalCost = calculateTotalProductCost(input);
  const margin = calculateMargin(input.price, totalCost);
  if (!margin.ok) return margin;
  return ok({ totalCost, profit: input.price.minus(totalCost), margin: margin.value });
}

export function validateTargetMargin(targetMargin: Dec): Result<Dec> {
  if (!targetMargin.isFinite() || targetMargin.lt(0) || targetMargin.gte(ONE)) {
    return fail('INVALID_TARGET_MARGIN', targetMargin.toString());
  }
  return ok(targetMargin);
}

export interface RecommendedPriceInput {
  directCost: Dec;
  fixedPerUnit: Dec;
  variablePercent: Dec;
  variablePerUnit: Dec;
  targetMargin: Dec;
}

/**
 * Precio que deja exactamente el margen objetivo después de TODOS los costos,
 * incluidos los porcentuales que crecen con el precio:
 *
 *   precio = (directo + variable fijo + fijos asignados) ÷ (1 − margen − % variable)
 *
 * Ej.: 4.200 ÷ (1 − 0,30 − 0,0639) = 6.602,74
 * Si margen + % variable ≥ 100 % no existe precio posible.
 */
export function calculateRecommendedPrice(input: RecommendedPriceInput): Result<Dec> {
  const margin = validateTargetMargin(input.targetMargin);
  if (!margin.ok) return margin;

  const denominator = ONE.minus(input.targetMargin).minus(input.variablePercent);
  if (!denominator.gt(0)) {
    const maxMargin = Decimal.max(ZERO, ONE.minus(input.variablePercent));
    return fail('TARGET_MARGIN_UNREACHABLE', undefined, { maxAchievableMargin: maxMargin.toString() });
  }

  const baseCost = input.directCost.plus(input.variablePerUnit).plus(input.fixedPerUnit);
  return ok(baseCost.div(denominator));
}

/**
 * Redondea hacia arriba al múltiplo de `step` (10, 50, 100, 500…).
 * Hacia arriba para no perder margen por redondear.
 * step ≤ 0 → solo redondeo a centavos (hacia arriba).
 */
export function roundRecommendedPrice(price: Dec, step: Dec | number = 50): Dec {
  const s = dec(step);
  if (!s.gt(0)) return price.toDecimalPlaces(2, Decimal.ROUND_CEIL);
  // Se redondea a centavos antes para evitar que 6.600,0000001 salte a 6.650.
  const cents = roundMoney(price);
  return cents.div(s).toDecimalPlaces(0, Decimal.ROUND_CEIL).times(s);
}

export type MarginStatus = 'healthy' | 'low' | 'negative';

export function getMarginStatus(
  margin: Dec,
  thresholds: { healthy: Dec; low: Dec } = DEFAULT_MARGIN_THRESHOLDS,
): MarginStatus {
  if (margin.gte(thresholds.healthy)) return 'healthy';
  if (margin.gte(thresholds.low)) return 'low';
  return 'negative';
}
