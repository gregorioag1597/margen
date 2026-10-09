import { z } from 'zod';
import { isDemoMode } from '@/lib/demo-mode';
import { demoApi } from '@/lib/demo-store';
import { supabase, unwrapResponse } from '@/lib/supabase';
import { ingredientRowSchema, UNIT_CODES, type IngredientRow, type toIngredientPayload } from './schemas';

// En modo demo cada función usa la base en memoria (src/lib/demo-store.ts).

const COLUMNS = 'id, name, supplier, purchase_unit, purchase_qty, purchase_price, waste_pct, price_updated_at, notes, archived_at';

type Payload = ReturnType<typeof toIngredientPayload>;

export async function listIngredients(businessId: string): Promise<IngredientRow[]> {
  const rows = isDemoMode()
    ? await demoApi.listIngredients()
    : unwrapResponse(await supabase.from('ingredients').select(COLUMNS).eq('business_id', businessId).order('name'));
  return z.array(ingredientRowSchema).parse(rows);
}

/** Cuántos productos distintos usan cada insumo. */
export async function listIngredientUsage(businessId: string): Promise<Map<string, number>> {
  if (isDemoMode()) return demoApi.listIngredientUsage();
  const rows = unwrapResponse(
    await supabase
      .from('product_components')
      .select('ingredient_id, product_id')
      .eq('business_id', businessId)
      .not('ingredient_id', 'is', null),
  );
  const parsed = z.array(z.object({ ingredient_id: z.string(), product_id: z.string() })).parse(rows);
  const sets = new Map<string, Set<string>>();
  for (const r of parsed) {
    if (!sets.has(r.ingredient_id)) sets.set(r.ingredient_id, new Set());
    sets.get(r.ingredient_id)!.add(r.product_id);
  }
  return new Map([...sets].map(([id, s]) => [id, s.size]));
}

export async function createIngredient(businessId: string, payload: Payload): Promise<void> {
  if (isDemoMode()) return demoApi.createIngredient(payload);
  unwrapResponse(await supabase.from('ingredients').insert({ ...payload, business_id: businessId }).select('id'));
}

/** Si cambia precio/cantidad/unidad, la base guarda el historial sola (trigger). */
export async function updateIngredient(id: string, payload: Payload): Promise<void> {
  if (isDemoMode()) return demoApi.updateIngredient(id, payload);
  unwrapResponse(await supabase.from('ingredients').update(payload).eq('id', id).select('id'));
}

/** Solo el precio/presentación (desde una compra registrada). El historial se guarda solo. */
export async function updateIngredientPrice(
  id: string,
  price: { purchase_price: string; purchase_qty: string; purchase_unit: IngredientRow['purchase_unit'] },
): Promise<void> {
  if (isDemoMode()) return demoApi.updateIngredient(id, price);
  unwrapResponse(await supabase.from('ingredients').update(price).eq('id', id).select('id'));
}

export async function setIngredientArchived(id: string, archived: boolean): Promise<void> {
  if (isDemoMode()) return demoApi.setIngredientArchived(id, archived);
  unwrapResponse(
    await supabase.from('ingredients').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id).select('id'),
  );
}

/** Falla con 23503 si el insumo se usa en algún producto. */
export async function deleteIngredient(id: string): Promise<void> {
  if (isDemoMode()) return demoApi.deleteIngredient(id);
  unwrapResponse(await supabase.from('ingredients').delete().eq('id', id).select('id'));
}

export const priceHistoryRowSchema = z.object({
  id: z.string(),
  purchase_unit: z.enum(UNIT_CODES),
  purchase_qty: z.coerce.string(),
  purchase_price: z.coerce.string(),
  effective_at: z.string(),
});
export type PriceHistoryRow = z.infer<typeof priceHistoryRowSchema>;

export async function listIngredientPriceHistory(ingredientId: string): Promise<PriceHistoryRow[]> {
  const rows = isDemoMode()
    ? await demoApi.listIngredientPriceHistory(ingredientId)
    : unwrapResponse(
        await supabase
          .from('ingredient_price_history')
          .select('id, purchase_unit, purchase_qty, purchase_price, effective_at')
          .eq('ingredient_id', ingredientId)
          .order('effective_at', { ascending: false }),
      );
  return z.array(priceHistoryRowSchema).parse(rows);
}
