import { convertQuantity } from './units';
import { dec, roundMoney, sum, ZERO, type Dec, type DecimalInput } from './money';
import { fail, ok, type Result } from './result';
import type { FixedCost, UnitCode } from './types';

/**
 * Costos fijos PLANIFICADOS vs pagos REALES del mes.
 * Un pago cuenta solo si el egreso se vinculó a ese costo fijo (no se adivina
 * por nombre ni categoría): así nunca se duplica ni se mezcla.
 */
export type PlanStatus = 'pending' | 'partial' | 'paid' | 'over';

export interface PlanVsActualItem {
  fixedCostId: string;
  name: string;
  planned: Dec;
  paid: Dec;
  /** Pagado − planificado (positivo = pagaste de más). */
  difference: Dec;
  status: PlanStatus;
}

export interface PlanVsActual {
  items: PlanVsActualItem[];
  planned: Dec;
  paid: Dec;
  pending: PlanVsActualItem[];
}

export function fixedCostsPlanVsActual(
  fixedCosts: readonly Pick<FixedCost, 'id' | 'name' | 'monthlyAmount' | 'isActive'>[],
  payments: readonly { fixedCostId: string | null; amount: DecimalInput }[],
): PlanVsActual {
  const paidById = new Map<string, Dec>();
  for (const p of payments) {
    if (!p.fixedCostId) continue;
    paidById.set(p.fixedCostId, (paidById.get(p.fixedCostId) ?? ZERO).plus(dec(p.amount)));
  }

  const items = fixedCosts
    .filter((f) => f.isActive)
    .map((f): PlanVsActualItem => {
      const planned = dec(f.monthlyAmount);
      const paid = paidById.get(f.id) ?? ZERO;
      const status: PlanStatus = paid.isZero() ? 'pending' : paid.lt(planned) ? 'partial' : paid.gt(planned) ? 'over' : 'paid';
      return { fixedCostId: f.id, name: f.name, planned, paid, difference: paid.minus(planned), status };
    });

  return {
    items,
    planned: sum(items.map((i) => i.planned)),
    paid: sum(items.map((i) => i.paid)),
    pending: items.filter((i) => i.status === 'pending'),
  };
}

/**
 * Precio equivalente en la presentación del insumo.
 * Compra: 5 kg a $110.000; insumo cargado "1 kg" → $22.000.
 */
export function priceForPresentation(
  purchaseAmount: DecimalInput,
  purchase: { qty: DecimalInput; unit: UnitCode },
  presentation: { qty: DecimalInput; unit: UnitCode },
): Result<Dec> {
  const amount = dec(purchaseAmount);
  if (!amount.gt(0)) return fail('INVALID_INPUT', 'amount');
  const purchaseInPresentationUnit = convertQuantity(purchase.qty, purchase.unit, presentation.unit);
  if (!purchaseInPresentationUnit.ok) return purchaseInPresentationUnit;
  if (!purchaseInPresentationUnit.value.gt(0)) return fail('INVALID_QUANTITY');
  return ok(roundMoney(amount.div(purchaseInPresentationUnit.value).times(dec(presentation.qty))));
}
