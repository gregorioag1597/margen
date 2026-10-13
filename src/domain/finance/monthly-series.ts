import { safeDivide, sum, ZERO, type Dec } from './money';
import { shiftMonth, summarizeMovements, type Movement } from './movements';

/** Los últimos `count` meses terminando en `endMonth`, del más viejo al más nuevo ('YYYY-MM'). */
export function lastMonths(endMonth: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => shiftMonth(endMonth, i - count + 1));
}

export interface MonthPoint {
  month: string;
  income: Dec;
  expense: Dec;
  /** Ingresos − egresos. */
  result: Dec;
  /** Variación de ingresos vs. el mes anterior (0.12 = +12 %). null si el anterior fue 0 o es el primero. */
  incomeChange: Dec | null;
}

export interface MonthlySeries {
  points: MonthPoint[];
  totalIncome: Dec;
  totalExpense: Dec;
  totalResult: Dec;
  /** Mes con mayor resultado (null si no hubo movimientos). */
  bestMonth: MonthPoint | null;
  /** Mes con menor resultado (null si no hubo movimientos). */
  worstMonth: MonthPoint | null;
  hasData: boolean;
}

/**
 * Ingresos, egresos y resultado de cada mes. Los meses sin movimientos
 * aparecen en 0 (sin huecos). Movimientos fuera de los meses pedidos se ignoran.
 */
export function buildMonthlySeries(movements: readonly Movement[], months: readonly string[]): MonthlySeries {
  const byMonth = new Map<string, Movement[]>(months.map((m) => [m, []]));
  for (const mv of movements) byMonth.get(mv.occurredOn.slice(0, 7))?.push(mv);

  const points: MonthPoint[] = [];
  for (const month of months) {
    const s = summarizeMovements(byMonth.get(month) ?? []);
    const prev = points[points.length - 1];
    points.push({
      month,
      income: s.income,
      expense: s.expense,
      result: s.result,
      incomeChange: prev ? safeDivide(s.income.minus(prev.income), prev.income) : null,
    });
  }

  const withData = points.filter((p) => !p.income.isZero() || !p.expense.isZero());
  const pick = (better: (a: MonthPoint, b: MonthPoint) => boolean) =>
    withData.reduce<MonthPoint | null>((acc, p) => (acc === null || better(p, acc) ? p : acc), null);

  return {
    points,
    totalIncome: sum(points.map((p) => p.income)),
    totalExpense: sum(points.map((p) => p.expense)),
    totalResult: points.length ? sum(points.map((p) => p.result)) : ZERO,
    bestMonth: pick((a, b) => a.result.gt(b.result)),
    worstMonth: pick((a, b) => a.result.lt(b.result)),
    hasData: withData.length > 0,
  };
}
