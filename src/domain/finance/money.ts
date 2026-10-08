import Decimal from 'decimal.js';

/**
 * Decimal configurado para dinero. Todo cálculo del motor usa este tipo:
 * nada de `number` para montos, porcentajes ni cantidades.
 * El redondeo se hace solo al final (al mostrar o guardar).
 */
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = Decimal;

/** Valores aceptados como entrada: number, string ('18000.00' de Postgres) o Decimal. */
export type DecimalInput = Decimal.Value;

export const ZERO: Dec = new Dec(0);
export const ONE: Dec = new Dec(1);

export function dec(value: DecimalInput): Dec {
  return new Dec(value);
}

export function sum(values: readonly Dec[]): Dec {
  return values.reduce<Dec>((acc, v) => acc.plus(v), ZERO);
}

/** Divide o devuelve null si el divisor es 0. Nunca produce Infinity ni NaN. */
export function safeDivide(numerator: Dec, denominator: Dec): Dec | null {
  if (denominator.isZero()) return null;
  return numerator.div(denominator);
}

/** Redondeo monetario (half-up) a `decimals` decimales. */
export function roundMoney(value: Dec, decimals = 2): Dec {
  return value.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

/** True si el valor es un Decimal finito (defensa contra datos corruptos). */
export function isFiniteDecimal(value: Dec): boolean {
  return value.isFinite() && !value.isNaN();
}

/** Parsea una entrada externa; devuelve null si no es un número finito. */
export function parseDecimal(value: unknown): Dec | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string' && !Decimal.isDecimal(value)) {
    return null;
  }
  try {
    const parsed = new Dec(value as DecimalInput);
    return isFiniteDecimal(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
