import { describe, expect, it } from 'vitest';
import { currentMonth, filterMovements, monthRange, shiftMonth, summarizeMovements, todayISO, type Movement } from '..';

const m = (id: string, kind: Movement['kind'], occurredOn: string, category: string, amount: string): Movement => ({ id, kind, occurredOn, category, amount });

const OCTOBER: Movement[] = [
  m('1', 'income', '2026-10-02', 'sale', '1200000'),
  m('2', 'income', '2026-10-15', 'sale', '800000.50'),
  m('3', 'income', '2026-10-20', 'service', '100000'),
  m('4', 'expense', '2026-10-01', 'rent', '450000'),
  m('5', 'expense', '2026-10-05', 'raw_materials', '320000'),
  m('6', 'expense', '2026-10-15', 'raw_materials', '180000'),
  m('7', 'expense', '2026-10-20', 'advertising', '80000'),
  m('8', 'expense', '2026-10-28', 'taxes', '0.10'),
];

describe('resumen de movimientos del mes', () => {
  const s = summarizeMovements(OCTOBER);

  it('ingresos, egresos y resultado = ingresos − egresos (exacto, sin floats)', () => {
    expect(s.income.toString()).toBe('2100000.5');
    expect(s.expense.toString()).toBe('1030000.1');
    expect(s.result.toString()).toBe('1070000.4');
  });

  it('margen sobre ingresos = resultado ÷ ingresos', () => {
    expect(s.marginOnIncome!.toFixed(4)).toBe('0.5095');
  });

  it('principales categorías de gasto, de mayor a menor', () => {
    expect(s.expenseByCategory.map((c) => `${c.category}:${c.amount}`)).toEqual([
      'raw_materials:500000',
      'rent:450000',
      'advertising:80000',
      'taxes:0.1',
    ]);
    expect(s.expenseByCategory[0]!.share.toFixed(4)).toBe('0.4854');
  });

  it('cantidades', () => {
    expect(s.incomeCount).toBe(3);
    expect(s.expenseCount).toBe(5);
  });

  it('mes sin ingresos: margen null (no divide por cero)', () => {
    const only = summarizeMovements([m('x', 'expense', '2026-10-01', 'rent', '100')]);
    expect(only.result.toString()).toBe('-100');
    expect(only.marginOnIncome).toBeNull();
  });

  it('mes vacío: todo en cero', () => {
    const empty = summarizeMovements([]);
    expect(empty.income.isZero() && empty.expense.isZero() && empty.result.isZero()).toBe(true);
    expect(empty.expenseByCategory).toEqual([]);
  });
});

describe('filtros', () => {
  it('por tipo, día y categoría', () => {
    expect(filterMovements(OCTOBER, { kind: 'income' }).map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(filterMovements(OCTOBER, { date: '2026-10-15' }).map((x) => x.id)).toEqual(['2', '6']);
    expect(filterMovements(OCTOBER, { category: 'raw_materials' }).map((x) => x.id)).toEqual(['5', '6']);
    expect(filterMovements(OCTOBER, { kind: 'expense', date: '2026-10-20' }).map((x) => x.id)).toEqual(['7']);
  });
});

describe('fechas', () => {
  it('rango de un mes, incluidos febrero bisiesto y diciembre', () => {
    expect(monthRange('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('mover meses cruzando años', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('mes y día locales', () => {
    const d = new Date(2026, 9, 8, 23, 30); // 8 de octubre, 23:30 hora local
    expect(currentMonth(d)).toBe('2026-10');
    expect(todayISO(d)).toBe('2026-10-08');
  });
});
