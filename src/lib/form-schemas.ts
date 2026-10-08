import { z } from 'zod';
import type { Dec } from '@/domain/finance';
import { parseLocaleDecimal } from './number-input';

/**
 * Campos numéricos de formulario: el usuario escribe texto ("18.000", "6,39"),
 * se valida acá y se convierte al guardar. Así no hay floats en el camino.
 */
export function localeNumber(opts: {
  required?: string;
  invalid?: string;
  check?: (n: Dec) => boolean;
  checkMessage?: string;
}) {
  return z.string().superRefine((raw, ctx) => {
    if (raw.trim() === '') {
      if (opts.required) ctx.addIssue({ code: 'custom', message: opts.required });
      return;
    }
    const n = parseLocaleDecimal(raw);
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: opts.invalid ?? 'Escribí un número, por ejemplo 18.000 o 6,39.' });
      return;
    }
    if (opts.check && !opts.check(n)) ctx.addIssue({ code: 'custom', message: opts.checkMessage ?? 'Valor fuera de rango.' });
  });
}

export const optionalText = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres.`);

/** "" → null para columnas opcionales. */
export const emptyToNull = (s: string) => (s.trim() === '' ? null : s.trim());
