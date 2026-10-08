/**
 * Errores del motor. La UI traduce cada código a un mensaje simple
 * (src/copy en la fase de UI). El motor nunca lanza excepciones por datos
 * del usuario: devuelve un Result.
 */
export type FinanceErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_QUANTITY'
  | 'INCOMPATIBLE_UNITS'
  | 'MISSING_REFERENCE'
  | 'MISSING_PRICE'
  | 'ZERO_COST'
  | 'INVALID_TARGET_MARGIN'
  | 'TARGET_MARGIN_UNREACHABLE'
  | 'NO_SALES_DATA'
  | 'NO_CONTRIBUTION';

export interface FinanceError {
  code: FinanceErrorCode;
  detail?: string;
  /** Datos extra para explicar el error (ej. margen máximo alcanzable). */
  meta?: Record<string, string>;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: FinanceError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(
  code: FinanceErrorCode,
  detail?: string,
  meta?: Record<string, string>,
): Result<T> {
  return { ok: false, error: { code, detail, meta } };
}

/** Avisos que no impiden calcular pero conviene mostrar. */
export type FinanceWarningCode =
  | 'NO_COMPONENTS'
  | 'NO_SALES_ESTIMATE'
  | 'NO_PRICE'
  | 'FIXED_ALLOCATION_UNAVAILABLE'
  | 'LABOR_DOUBLE_COUNT_RISK'
  | 'VARIABLE_PERCENT_TOO_HIGH'
  | 'PRODUCT_COST_ERROR';

export interface FinanceWarning {
  code: FinanceWarningCode;
  productId?: string;
  detail?: string;
}
