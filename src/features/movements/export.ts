import { excelAmount, excelDate, toCsv } from '@/lib/export-csv';
import { categoryLabel, paymentLabel, type MovementRow } from './schemas';

export const EXPORT_HEADER = ['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Importe', 'Medio de pago', 'Proveedor', 'Producto', 'Notas'];

/** Movimientos → CSV para el contador (orden cronológico, del más viejo al más nuevo). */
export function movementsToCsv(rows: readonly MovementRow[], productNames: ReadonlyMap<string, string>): string {
  const sorted = [...rows].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at));
  return toCsv([
    EXPORT_HEADER,
    ...sorted.map((m) => [
      excelDate(m.occurred_on),
      m.kind === 'income' ? 'Ingreso' : 'Egreso',
      m.concept,
      categoryLabel(m.category),
      excelAmount(m.amount),
      paymentLabel(m.payment_method),
      m.supplier,
      m.product_id ? productNames.get(m.product_id) ?? '' : '',
      m.notes,
    ]),
  ]);
}

export function exportFileName(businessName: string, month: string): string {
  const slug = businessName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `movimientos-${slug || 'negocio'}-${month}.csv`;
}
