import { z } from 'zod';
import { isDemoMode } from '@/lib/demo-mode';
import { demoApi } from '@/lib/demo-store';
import { supabase, unwrapResponse } from '@/lib/supabase';
import { productRowSchema, type ProductRow, type toComponentPayload, type toProductPayload } from './schemas';

const COLUMNS =
  'id, name, category, price, monthly_units_estimate, batch_yield, target_margin, notes, archived_at, price_updated_at, ' +
  'product_components(id, kind, ingredient_id, labor_rate_id, quantity, unit, fixed_amount, label, position, basis)';

export async function listProducts(businessId: string): Promise<ProductRow[]> {
  if (isDemoMode()) return z.array(productRowSchema).parse(await demoApi.listProducts());
  const rows = unwrapResponse(
    await supabase
      .from('products')
      .select(COLUMNS)
      .eq('business_id', businessId)
      .order('name')
      .order('position', { referencedTable: 'product_components' }),
  );
  return z.array(productRowSchema).parse(rows);
}

type ProductPayload = ReturnType<typeof toProductPayload>;

export async function createProduct(businessId: string, payload: ProductPayload): Promise<string> {
  if (isDemoMode()) return demoApi.createProduct(payload);
  const rows = unwrapResponse(await supabase.from('products').insert({ ...payload, business_id: businessId }).select('id'));
  return z.array(z.object({ id: z.string() })).parse(rows)[0]!.id;
}

/** Si cambia el precio, la base guarda el historial sola (trigger). */
export async function updateProduct(
  id: string,
  patch: Partial<ProductPayload> & { target_margin?: string | null; archived_at?: string | null },
): Promise<void> {
  if (isDemoMode()) return demoApi.updateProduct(id, patch);
  unwrapResponse(await supabase.from('products').update(patch).eq('id', id).select('id'));
}

export async function deleteProduct(id: string): Promise<void> {
  if (isDemoMode()) return demoApi.deleteProduct(id);
  unwrapResponse(await supabase.from('products').delete().eq('id', id).select('id'));
}

type ComponentPayload = ReturnType<typeof toComponentPayload>;

export async function saveComponent(
  businessId: string,
  productId: string,
  componentId: string | null,
  payload: ComponentPayload,
  position: number,
): Promise<void> {
  if (isDemoMode()) return demoApi.saveComponent(productId, componentId, payload, position);
  if (componentId) {
    unwrapResponse(await supabase.from('product_components').update(payload).eq('id', componentId).select('id'));
  } else {
    unwrapResponse(
      await supabase
        .from('product_components')
        .insert({ ...payload, business_id: businessId, product_id: productId, position })
        .select('id'),
    );
  }
}

export async function deleteComponent(id: string): Promise<void> {
  if (isDemoMode()) return demoApi.deleteComponent(id);
  unwrapResponse(await supabase.from('product_components').delete().eq('id', id).select('id'));
}

export const productPriceHistorySchema = z.object({ id: z.string(), price: z.coerce.string(), effective_at: z.string() });

export async function listProductPriceHistory(productId: string) {
  if (isDemoMode()) return z.array(productPriceHistorySchema).parse(await demoApi.listProductPriceHistory(productId));
  const rows = unwrapResponse(
    await supabase
      .from('product_price_history')
      .select('id, price, effective_at')
      .eq('product_id', productId)
      .order('effective_at', { ascending: false })
      .limit(12),
  );
  return z.array(productPriceHistorySchema).parse(rows);
}
