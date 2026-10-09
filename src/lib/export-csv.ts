import { dec, type DecimalInput } from '@/domain/finance';

/**
 * CSV que Excel en español abre bien con doble clic:
 *   - separador ";" (Excel es-AR usa la coma como decimal)
 *   - BOM UTF-8 para que las tildes y la ñ se vean bien
 *   - importes con coma decimal y sin separador de miles
 */
export type CsvCell = string | number | null | undefined;

const BOM = '﻿';

/** Evita que Excel interprete un texto como fórmula (=, +, -, @). */
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeCell(cell: CsvCell, separator: string): string {
  if (cell === null || cell === undefined) return '';
  const text = typeof cell === 'number' ? String(cell) : neutralizeFormula(cell);
  return /["\n\r]/.test(text) || text.includes(separator) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvCell[][], separator = ';'): string {
  return BOM + rows.map((row) => row.map((c) => escapeCell(c, separator)).join(separator)).join('\r\n');
}

/** 1234.5 → "1234,50" (dos decimales, coma, sin miles). */
export function excelAmount(value: DecimalInput): string {
  return dec(value).toFixed(2).replace('.', ',');
}

/** "2026-10-08" → "08/10/2026". */
export function excelDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Descarga el texto como archivo en el navegador. */
export function downloadTextFile(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
