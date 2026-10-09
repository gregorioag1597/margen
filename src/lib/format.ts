import { dec, type Dec } from '@/domain/finance';
import type { UnitCode, UnitFamily } from '@/domain/finance';

type Num = Dec | number | string | null | undefined;

const toNumber = (v: Num) => (v === null || v === undefined || v === '' ? null : dec(v).toNumber());

/**
 * $18.000 · $1.018,38 · sin centavos si es entero o si el monto es grande
 * (desde $10.000 los centavos solo agregan ruido visual). Solo afecta lo que
 * se muestra: los cálculos siguen siendo exactos.
 */
export function formatMoney(value: Num, currency = 'ARS'): string {
  const n = toNumber(value);
  if (n === null) return '—';
  const noCents = Number.isInteger(n) || Math.abs(n) >= 10_000;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: noCents ? 0 : 2,
    maximumFractionDigits: noCents ? 0 : 2,
  }).format(n);
}

/** Para costos chiquitos por gramo/ml: $1,5 · $0,0225. */
export function formatUnitCost(value: Num, currency = 'ARS'): string {
  const n = toNumber(value);
  if (n === null) return '—';
  const abs = Math.abs(n);
  const digits = abs === 0 || abs >= 100 ? 2 : abs >= 1 ? 2 : 4;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(n);
}

/** 0.2204 → "22 %" · 0.0639 → "6,39 %". */
export function formatPercent(fraction: Num, maxDecimals = 2): string {
  const n = toNumber(fraction);
  if (n === null) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'percent',
    maximumFractionDigits: maxDecimals,
  }).format(n);
}

export function formatNumber(value: Num, maxDecimals = 2): string {
  const n = toNumber(value);
  if (n === null) return '—';
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: maxDecimals }).format(n);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export const UNIT_LABELS: Record<UnitCode, { short: string; singular: string; plural: string }> = {
  kg: { short: 'kg', singular: 'kilo', plural: 'kilos' },
  g: { short: 'g', singular: 'gramo', plural: 'gramos' },
  l: { short: 'l', singular: 'litro', plural: 'litros' },
  ml: { short: 'ml', singular: 'mililitro', plural: 'mililitros' },
  unit: { short: 'u.', singular: 'unidad', plural: 'unidades' },
  m: { short: 'm', singular: 'metro', plural: 'metros' },
  cm: { short: 'cm', singular: 'centímetro', plural: 'centímetros' },
  h: { short: 'h', singular: 'hora', plural: 'horas' },
  min: { short: 'min', singular: 'minuto', plural: 'minutos' },
};

/** Unidades que se ofrecen al comprar un insumo (spec: kg, g, litros, ml, unidades, metros, horas). */
export const PURCHASE_UNITS: UnitCode[] = ['kg', 'g', 'l', 'ml', 'unit', 'm', 'h'];

/** Unidades que se pueden elegir según la familia del insumo (nunca se mezclan familias). */
export const UNITS_BY_FAMILY: Record<UnitFamily, UnitCode[]> = {
  mass: ['g', 'kg'],
  volume: ['ml', 'l'],
  count: ['unit'],
  length: ['cm', 'm'],
  time: ['min', 'h'],
};

/** Unidad base en la que el motor expresa el costo unitario. */
export const BASE_UNIT_BY_UNIT: Record<UnitCode, UnitCode> = {
  kg: 'g', g: 'g', l: 'ml', ml: 'ml', unit: 'unit', m: 'cm', cm: 'cm', h: 'min', min: 'min',
};
