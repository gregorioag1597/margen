import { z } from 'zod';
import { isDemoMode } from '@/lib/demo-mode';
import { demoApi } from '@/lib/demo-store';
import { supabase, unwrapResponse } from '@/lib/supabase';
import type { Levers } from './plan';

/** Aplica el plan en una sola transacción (función apply_scenario en la base). */
export async function applyScenario(businessId: string, name: string, items: { target: string; id: string; value: string }[]): Promise<number> {
  if (isDemoMode()) return demoApi.applyScenario(name, items);
  const result = unwrapResponse(
    await supabase.rpc('apply_scenario', { p_business_id: businessId, p_name: name, p_items: items }),
  );
  return z.number().parse(result);
}

// ---------------------------------------------------------------- Escenarios guardados (borradores)

const leversSchema = z.object({
  pricePct: z.string(),
  priceProductIds: z.union([z.literal('all'), z.array(z.string())]),
  ingredientCostPct: z.string(),
  volumePct: z.string(),
  fixedCostsPct: z.string(),
  commission: z.object({ variableCostId: z.string(), newPercent: z.string() }).nullable(),
});

const savedScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
  // Los borradores guardan las palancas como único elemento del array.
  changes: z.array(z.unknown()),
});

export interface SavedScenario {
  id: string;
  name: string;
  createdAt: string;
  levers: Levers | null;
}

export async function listDraftScenarios(businessId: string): Promise<SavedScenario[]> {
  const rows = isDemoMode()
    ? await demoApi.listDraftScenarios()
    : unwrapResponse(
        await supabase
          .from('scenarios')
          .select('id, name, created_at, changes')
          .eq('business_id', businessId)
          .eq('status', 'draft')
          .order('created_at', { ascending: false }),
      );
  return z.array(savedScenarioSchema).parse(rows).map((r) => {
    const levers = leversSchema.safeParse(r.changes[0]);
    return { id: r.id, name: r.name, createdAt: r.created_at, levers: levers.success ? levers.data : null };
  });
}

export async function saveDraftScenario(businessId: string, name: string, levers: Levers): Promise<void> {
  if (isDemoMode()) return demoApi.saveDraftScenario(name, levers);
  unwrapResponse(
    await supabase.from('scenarios').insert({ business_id: businessId, name, changes: [levers], status: 'draft' }).select('id'),
  );
}

export async function deleteScenario(id: string): Promise<void> {
  if (isDemoMode()) return demoApi.deleteScenario(id);
  unwrapResponse(await supabase.from('scenarios').delete().eq('id', id).select('id'));
}
