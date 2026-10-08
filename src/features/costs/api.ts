import { z } from 'zod';
import { isDemoMode } from '@/lib/demo-mode';
import { demoApi } from '@/lib/demo-store';
import { DataError, supabase, unwrapResponse } from '@/lib/supabase';
import {
  fixedCostRowSchema,
  laborRateRowSchema,
  variableCostRowSchema,
  type FixedCostRow,
  type LaborRateRow,
  type toFixedCostPayload,
  type toVariableCostPayload,
  type VariableCostRow,
} from './schemas';

// ---------------------------------------------------------------- Fijos

export async function listFixedCosts(businessId: string): Promise<FixedCostRow[]> {
  if (isDemoMode()) return z.array(fixedCostRowSchema).parse(await demoApi.listFixedCosts());
  const rows = unwrapResponse(
    await supabase.from('fixed_costs').select('id, name, category, monthly_amount, is_active, notes').eq('business_id', businessId).order('created_at'),
  );
  return z.array(fixedCostRowSchema).parse(rows);
}

type FixedPayload = ReturnType<typeof toFixedCostPayload>;

export async function saveFixedCost(businessId: string, id: string | null, payload: FixedPayload): Promise<void> {
  if (isDemoMode()) return demoApi.saveFixedCost(id, payload);
  if (id) unwrapResponse(await supabase.from('fixed_costs').update(payload).eq('id', id).select('id'));
  else unwrapResponse(await supabase.from('fixed_costs').insert({ ...payload, business_id: businessId }).select('id'));
}

export async function setFixedCostActive(id: string, isActive: boolean): Promise<void> {
  if (isDemoMode()) return demoApi.setFixedCostActive(id, isActive);
  unwrapResponse(await supabase.from('fixed_costs').update({ is_active: isActive }).eq('id', id).select('id'));
}

export async function deleteFixedCost(id: string): Promise<void> {
  if (isDemoMode()) return demoApi.deleteFixedCost(id);
  unwrapResponse(await supabase.from('fixed_costs').delete().eq('id', id).select('id'));
}

// ---------------------------------------------------------------- Variables

export async function listVariableCosts(businessId: string): Promise<VariableCostRow[]> {
  if (isDemoMode()) return z.array(variableCostRowSchema).parse(await demoApi.listVariableCosts());
  const rows = unwrapResponse(
    await supabase
      .from('variable_costs')
      .select('id, name, category, percent_of_sale, amount_per_unit, applies_to, share_of_sales, is_active, notes, variable_cost_products(product_id)')
      .eq('business_id', businessId)
      .order('created_at'),
  );
  return z.array(variableCostRowSchema).parse(rows);
}

type VariablePayload = ReturnType<typeof toVariableCostPayload>;

/**
 * Guarda el costo y reemplaza la lista de productos a los que aplica.
 * Son dos pasos: si el segundo fallara, el costo queda guardado y el error
 * se muestra para reintentar (no se pierde información del usuario).
 */
export async function saveVariableCost(businessId: string, id: string | null, payload: VariablePayload): Promise<void> {
  if (isDemoMode()) return demoApi.saveVariableCost(id, payload.cost, payload.productIds);
  let costId = id;
  if (costId) {
    unwrapResponse(await supabase.from('variable_costs').update(payload.cost).eq('id', costId).select('id'));
  } else {
    const rows = unwrapResponse(
      await supabase.from('variable_costs').insert({ ...payload.cost, business_id: businessId }).select('id'),
    );
    costId = z.array(z.object({ id: z.string() })).parse(rows)[0]!.id;
  }

  unwrapResponse(await supabase.from('variable_cost_products').delete().eq('variable_cost_id', costId).select('product_id'));
  if (payload.productIds.length > 0) {
    unwrapResponse(
      await supabase
        .from('variable_cost_products')
        .insert(payload.productIds.map((product_id) => ({ variable_cost_id: costId, product_id, business_id: businessId })))
        .select('product_id'),
    );
  }
}

export async function setVariableCostActive(id: string, isActive: boolean): Promise<void> {
  if (isDemoMode()) return demoApi.setVariableCostActive(id, isActive);
  unwrapResponse(await supabase.from('variable_costs').update({ is_active: isActive }).eq('id', id).select('id'));
}

export async function deleteVariableCost(id: string): Promise<void> {
  if (isDemoMode()) return demoApi.deleteVariableCost(id);
  unwrapResponse(await supabase.from('variable_costs').delete().eq('id', id).select('id'));
}

// ---------------------------------------------------------------- Mano de obra

export async function listLaborRates(businessId: string): Promise<LaborRateRow[]> {
  if (isDemoMode()) return z.array(laborRateRowSchema).parse(await demoApi.listLaborRates());
  const rows = unwrapResponse(
    await supabase.from('labor_rates').select('id, name, hourly_rate, is_default').eq('business_id', businessId).order('created_at'),
  );
  return z.array(laborRateRowSchema).parse(rows);
}

/** MVP: una tarifa general (is_default). La tabla ya admite varias. */
export async function saveDefaultLaborRate(businessId: string, existingId: string | null, hourlyRate: string): Promise<void> {
  if (isDemoMode()) return demoApi.saveDefaultLaborRate(existingId, hourlyRate);
  if (existingId) {
    unwrapResponse(await supabase.from('labor_rates').update({ hourly_rate: hourlyRate }).eq('id', existingId).select('id'));
  } else {
    unwrapResponse(
      await supabase
        .from('labor_rates')
        .insert({ business_id: businessId, name: 'Mano de obra general', hourly_rate: hourlyRate, is_default: true })
        .select('id'),
    );
  }
}

/** ¿Hay productos con mano de obra cargada? (para el aviso de doble conteo) */
export async function countLaborComponents(businessId: string): Promise<number> {
  if (isDemoMode()) return demoApi.countLaborComponents();
  const { count, error } = await supabase
    .from('product_components')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('kind', 'labor');
  if (error) throw new DataError(error.message, error.code);
  return count ?? 0;
}

// ---------------------------------------------------------------- Productos (para elegir a cuáles aplica un costo)

export async function listProductOptions(businessId: string): Promise<{ id: string; name: string }[]> {
  if (isDemoMode()) return demoApi.listProductOptions();
  const rows = unwrapResponse(
    await supabase.from('products').select('id, name').eq('business_id', businessId).is('archived_at', null).order('name'),
  );
  return z.array(z.object({ id: z.string(), name: z.string() })).parse(rows);
}
