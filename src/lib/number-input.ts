import { dec, type Dec } from '@/domain/finance';

/**
 * Interpreta números como los escribe la gente en Argentina:
 *   "18.000" → 18000      "6,39" → 6.39      "1.234,5" → 1234.5
 *   "1.5"    → 1.5        "$ 25.000" → 25000
 * Devuelve el número normalizado como string ("18000", "6.39") o null.
 */
export function parseLocaleNumber(raw: string): string | null {
  let s = raw.trim().replace(/[\s$%]/g, '');
  if (s === '') return null;

  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // El último separador es el decimal.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3}){2,}$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "18.000" o "1.500.000": puntos de miles.
    s = s.replace(/\./g, '');
  }

  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  // Normaliza ceros a la izquierda y decimales sobrantes.
  const normalized = dec(s).toString();
  return negative && normalized !== '0' ? `-${normalized}` : normalized;
}

export function parseLocaleDecimal(raw: string): Dec | null {
  const parsed = parseLocaleNumber(raw);
  return parsed === null ? null : dec(parsed);
}

/** "6,39" (porcentaje que escribe el usuario) → "0.0639" (fracción que guarda la base). */
export function percentInputToFraction(raw: string): string | null {
  const value = parseLocaleDecimal(raw);
  return value === null ? null : value.div(100).toString();
}

/** 0.0639 → "6,39" para mostrar en un input. */
export function fractionToPercentInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return dec(value).times(100).toDecimalPlaces(4).toString().replace('.', ',');
}

/** 18000 → "18000" con coma decimal para inputs ("1,5"). */
export function numberToInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return dec(value).toString().replace('.', ',');
}
