import { z } from 'zod';
import { monthRange, type Movement } from '@/domain/finance';
import { isDemoMode } from '@/lib/demo-mode';
import { demoApi } from '@/lib/demo-store';
import { supabase, unwrapResponse } from '@/lib/supabase';
import { movementRowSchema, type MovementPayload, type MovementRow } from './schemas';

const COLUMNS = 'id, kind, occurred_on, concept, category, amount, product_id, payment_method, supplier, notes, created_at';

/** Movimientos de un mes ('YYYY-MM'), del más nuevo al más viejo. */
export async function listMovements(businessId: string, month: string): Promise<MovementRow[]> {
  const { from, to } = monthRange(month);
  const rows = isDemoMode()
    ? await demoApi.listMovements(from, to)
    : unwrapResponse(
        await supabase
          .from('movements')
          .select(COLUMNS)
          .eq('business_id', businessId)
          .gte('occurred_on', from)
          .lte('occurred_on', to)
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false }),
      );
  return z.array(movementRowSchema).parse(rows);
}

export async function saveMovement(businessId: string, id: string | null, payload: MovementPayload): Promise<void> {
  if (isDemoMode()) return demoApi.saveMovement(id, payload);
  if (id) unwrapResponse(await supabase.from('movements').update(payload).eq('id', id).select('id'));
  else unwrapResponse(await supabase.from('movements').insert({ ...payload, business_id: businessId }).select('id'));
}

export async function deleteMovement(id: string): Promise<void> {
  if (isDemoMode()) return demoApi.deleteMovement(id);
  unwrapResponse(await supabase.from('movements').delete().eq('id', id).select('id'));
}

/** Fila → formato del motor. */
export const toMovement = (r: MovementRow): Movement => ({ id: r.id, kind: r.kind, occurredOn: r.occurred_on, category: r.category, amount: r.amount });
