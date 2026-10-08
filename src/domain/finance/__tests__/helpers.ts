import Decimal from 'decimal.js';
import { expect } from 'vitest';
import type { FinanceErrorCode, Result } from '../result';

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`Se esperaba ok, llegó ${result.error.code} (${result.error.detail ?? ''})`);
  return result.value;
}

export function expectError<T>(result: Result<T>, code: FinanceErrorCode) {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
  return result;
}

/** Formatea a 2 decimales para comparar contra valores calculados a mano. */
export const money = (d: Decimal | null | undefined) => (d == null ? null : d.toFixed(2));
export const pct = (d: Decimal | null | undefined, decimals = 4) => (d == null ? null : d.toFixed(decimals));

/** Recorre un objeto y falla si encuentra NaN o Infinity (number o Decimal). */
export function expectNoNaNOrInfinity(value: unknown, path = 'root', seen = new Set<unknown>()): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} = ${value}`).toBe(true);
    return;
  }
  if (Decimal.isDecimal(value)) {
    expect((value as Decimal).isFinite(), `${path} = ${String(value)}`).toBe(true);
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value);
  for (const [k, v] of entries) expectNoNaNOrInfinity(v, `${path}.${String(k)}`, seen);
}
