import { dec, safeDivide, sum, ZERO, type Dec, type DecimalInput } from './money';

/**
 * Movimientos reales de dinero (ingresos y egresos). Es lo que PASÓ, a
 * diferencia de costos y productos, que son lo PLANIFICADO.
 * Resultado del mes = ingresos − egresos. Sin contabilidad.
 */
export interface Movement {
  id: string;
  kind: 'income' | 'expense';
  /** Fecha 'YYYY-MM-DD'. */
  occurredOn: string;
  category: string;
  amount: DecimalInput;
}

export interface CategoryTotal {
  category: string;
  amount: Dec;
  /** Parte del total de egresos (0 a 1). */
  share: Dec;
}

export interface MovementsSummary {
  income: Dec;
  expense: Dec;
  /** Ingresos − egresos. */
  result: Dec;
  /** Resultado ÷ ingresos. null si no hubo ingresos. */
  marginOnIncome: Dec | null;
  incomeCount: number;
  expenseCount: number;
  /** Egresos por categoría, de mayor a menor. */
  expenseByCategory: CategoryTotal[];
}

export function summarizeMovements(movements: readonly Movement[]): MovementsSummary {
  const incomes = movements.filter((m) => m.kind === 'income');
  const expenses = movements.filter((m) => m.kind === 'expense');
  const income = sum(incomes.map((m) => dec(m.amount)));
  const expense = sum(expenses.map((m) => dec(m.amount)));
  const result = income.minus(expense);

  const byCategory = new Map<string, Dec>();
  for (const m of expenses) byCategory.set(m.category, (byCategory.get(m.category) ?? ZERO).plus(dec(m.amount)));

  return {
    income,
    expense,
    result,
    marginOnIncome: safeDivide(result, income),
    incomeCount: incomes.length,
    expenseCount: expenses.length,
    expenseByCategory: [...byCategory]
      .map(([category, amount]) => ({ category, amount, share: safeDivide(amount, expense) ?? ZERO }))
      .sort((a, b) => b.amount.comparedTo(a.amount) || a.category.localeCompare(b.category)),
  };
}

export interface MovementFilter {
  kind?: 'income' | 'expense';
  /** Día exacto 'YYYY-MM-DD'. */
  date?: string;
  category?: string;
}

export function filterMovements<T extends Movement>(movements: readonly T[], filter: MovementFilter): T[] {
  return movements.filter(
    (m) =>
      (!filter.kind || m.kind === filter.kind) &&
      (!filter.date || m.occurredOn === filter.date) &&
      (!filter.category || m.category === filter.category),
  );
}

/** 'YYYY-MM' → primer y último día del mes ('YYYY-MM-DD'). */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/** Suma o resta meses a 'YYYY-MM'. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Mes actual en hora local 'YYYY-MM'. */
export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Fecha local de hoy 'YYYY-MM-DD' (sin corrimientos por zona horaria). */
export function todayISO(now = new Date()): string {
  return `${currentMonth(now)}-${String(now.getDate()).padStart(2, '0')}`;
}
