import { describe, expect, it } from 'vitest';
import { excelAmount, toCsv } from '@/lib/export-csv';
import { exportFileName, movementsToCsv } from './export';
import type { MovementRow } from './schemas';

const row = (over: Partial<MovementRow>): MovementRow => ({
  id: 'x', kind: 'expense', occurred_on: '2026-10-08', concept: 'Compra', category: 'raw_materials', amount: '25000.5',
  product_id: null, payment_method: null, supplier: null, notes: null, created_at: '2026-10-08T10:00:00Z',
  fixed_cost_id: null, ingredient_id: null, ingredient_qty: null, ingredient_unit: null, ...over,
});

describe('CSV para Excel en español', () => {
  it('empieza con BOM, usa ";" y coma decimal', () => {
    const csv = movementsToCsv([row({})], new Map());
    expect(csv.startsWith('﻿')).toBe(true);
    const [header, line] = csv.slice(1).split('\r\n');
    expect(header).toBe('Fecha;Tipo;Concepto;Categoría;Importe;Medio de pago;Proveedor;Producto;Notas');
    expect(line).toBe('08/10/2026;Egreso;Compra;Materia prima;25000,50;;;;');
  });

  it('ingreso con medio de pago y producto', () => {
    const csv = movementsToCsv([row({ kind: 'income', category: 'sale', concept: 'Ventas', amount: '120000', payment_method: 'mercado_pago', product_id: 'p1' })], new Map([['p1', 'Alfajor Premium']]));
    expect(csv.split('\r\n')[1]).toBe('08/10/2026;Ingreso;Ventas;Venta;120000,00;Mercado Pago;;Alfajor Premium;');
  });

  it('respeta tildes, comillas, punto y coma y saltos de línea', () => {
    const csv = movementsToCsv([row({ concept: 'Harina "0000"; 25 kg', notes: 'línea 1\nlínea 2', supplier: 'Molino Ñandú' })], new Map());
    const line = csv.slice(csv.indexOf('\r\n') + 2);
    expect(line).toBe('08/10/2026;Egreso;"Harina ""0000""; 25 kg";Materia prima;25000,50;;Molino Ñandú;;"línea 1\nlínea 2"');
  });

  it('ordena del más viejo al más nuevo', () => {
    const csv = movementsToCsv([row({ id: 'b', occurred_on: '2026-10-09', concept: 'B' }), row({ id: 'a', occurred_on: '2026-10-01', concept: 'A' })], new Map());
    const lines = csv.split('\r\n');
    expect(lines[1]).toContain(';A;');
    expect(lines[2]).toContain(';B;');
  });

  it('un concepto que empieza con "=" no se ejecuta como fórmula', () => {
    expect(toCsv([['=HYPERLINK("x")']])).toBe('﻿"\'=HYPERLINK(""x"")"');
  });

  it('importes exactos', () => {
    expect(excelAmount('0.1')).toBe('0,10');
    expect(excelAmount('1234567.891')).toBe('1234567,89');
  });

  it('nombre de archivo sin tildes ni espacios', () => {
    expect(exportFileName('Pastelería Doña Rosa', '2026-10')).toBe('movimientos-pasteleria-dona-rosa-2026-10.csv');
  });
});
