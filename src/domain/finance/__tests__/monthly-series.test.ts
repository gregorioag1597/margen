import { describe, expect, it } from 'vitest';
import { buildMonthlySeries, lastMonths, type Movement } from '..';

const m = (id: string, kind: Movement['kind'], occurredOn: string, amount: string): Movement => ({ id, kind, occurredOn, category: 'x', amount });

describe('meses a mostrar', () => {
  it('últimos 6 meses, cruzando el año', () => {
    expect(lastMonths('2026-02', 6)).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('12 meses', () => {
    const months = lastMonths('2026-10', 12);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-11');
    expect(months[11]).toBe('2026-10');
  });
});

describe('serie mes a mes', () => {
  const months = ['2026-07', '2026-08', '2026-09', '2026-10'];
  const movements = [
    m('1', 'income', '2026-07-05', '1000000'),
    m('2', 'expense', '2026-07-10', '800000'),
    m('3', 'income', '2026-08-03', '1200000.50'),
    m('4', 'expense', '2026-08-20', '700000'),
    // septiembre sin movimientos
    m('5', 'income', '2026-10-01', '900000'),
    m('6', 'expense', '2026-10-02', '1100000'),
    m('7', 'income', '2026-06-30', '999999'), // fuera del período: se ignora
  ];
  const s = buildMonthlySeries(movements, months);

  it('ingresos, egresos y resultado por mes (exactos)', () => {
    expect(s.points.map((p) => [p.month, p.income.toString(), p.expense.toString(), p.result.toString()])).toEqual([
      ['2026-07', '1000000', '800000', '200000'],
      ['2026-08', '1200000.5', '700000', '500000.5'],
      ['2026-09', '0', '0', '0'],
      ['2026-10', '900000', '1100000', '-200000'],
    ]);
  });

  it('variación de ingresos contra el mes anterior', () => {
    expect(s.points[0]!.incomeChange).toBeNull(); // primer mes
    expect(s.points[1]!.incomeChange!.toFixed(4)).toBe('0.2000'); // +20 %
    expect(s.points[2]!.incomeChange!.toFixed(4)).toBe('-1.0000'); // −100 %
    expect(s.points[3]!.incomeChange).toBeNull(); // el anterior fue 0: no divide por cero
  });

  it('totales, mejor y peor mes', () => {
    expect(s.totalIncome.toString()).toBe('3100000.5');
    expect(s.totalExpense.toString()).toBe('2600000');
    expect(s.totalResult.toString()).toBe('500000.5');
    expect(s.bestMonth!.month).toBe('2026-08');
    expect(s.worstMonth!.month).toBe('2026-10');
    expect(s.hasData).toBe(true);
  });

  it('sin movimientos: todo en 0, sin mejor ni peor mes', () => {
    const empty = buildMonthlySeries([], months);
    expect(empty.points.every((p) => p.income.isZero() && p.expense.isZero())).toBe(true);
    expect(empty.bestMonth).toBeNull();
    expect(empty.hasData).toBe(false);
  });
});
