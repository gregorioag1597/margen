import { dec, parseDecimal, type Dec, type DecimalInput } from './money';
import { fail, ok, type Result } from './result';
import type { UnitCode, UnitFamily } from './types';

/**
 * Espejo de public.unit_family_of / public.unit_factor en Postgres.
 * Unidad base por familia: g, ml, unidad, cm, min.
 * Nunca se convierte entre familias (g ↔ ml requiere densidad).
 */
export const UNITS: Record<UnitCode, { family: UnitFamily; factor: Dec }> = {
  kg: { family: 'mass', factor: dec(1000) },
  g: { family: 'mass', factor: dec(1) },
  l: { family: 'volume', factor: dec(1000) },
  ml: { family: 'volume', factor: dec(1) },
  unit: { family: 'count', factor: dec(1) },
  m: { family: 'length', factor: dec(100) },
  cm: { family: 'length', factor: dec(1) },
  h: { family: 'time', factor: dec(60) },
  min: { family: 'time', factor: dec(1) },
};

export function unitFamily(unit: UnitCode): UnitFamily {
  return UNITS[unit].family;
}

export function areUnitsCompatible(a: UnitCode, b: UnitCode): boolean {
  return unitFamily(a) === unitFamily(b);
}

/** Cantidad expresada en la unidad base de su familia (1 kg → 1000 g). */
export function toBaseQuantity(quantity: DecimalInput, unit: UnitCode): Result<Dec> {
  const q = parseDecimal(quantity);
  if (q === null) return fail('INVALID_INPUT', 'quantity');
  if (q.lt(0)) return fail('INVALID_QUANTITY');
  return ok(q.times(UNITS[unit].factor));
}

/** Convierte entre unidades de la misma familia (0,5 l → 500 ml). */
export function convertQuantity(quantity: DecimalInput, from: UnitCode, to: UnitCode): Result<Dec> {
  if (!areUnitsCompatible(from, to)) {
    return fail('INCOMPATIBLE_UNITS', `${from} → ${to}`);
  }
  const base = toBaseQuantity(quantity, from);
  if (!base.ok) return base;
  return ok(base.value.div(UNITS[to].factor));
}
