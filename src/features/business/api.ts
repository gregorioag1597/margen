import { z } from 'zod';
import { isDemoMode } from '@/lib/demo-mode';
import { demoApi } from '@/lib/demo-store';
import { DataError, supabase, unwrapResponse } from '@/lib/supabase';
import { BUSINESS_TYPES, type BusinessType } from './constants';

const businessTypeValues = BUSINESS_TYPES.map((t) => t.value) as [BusinessType, ...BusinessType[]];

export const businessRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  business_type: z.enum(businessTypeValues),
  currency: z.string(),
  prices_include_taxes: z.boolean().nullable(),
  default_target_margin: z.coerce.string(),
  settings: z.record(z.string(), z.unknown()),
  is_demo: z.boolean(),
});

export type Business = z.infer<typeof businessRowSchema>;

const COLUMNS = 'id, name, business_type, currency, prices_include_taxes, default_target_margin, settings, is_demo';

/** Negocios del usuario. La RLS devuelve solo aquellos de los que es miembro. */
export async function listBusinesses(): Promise<Business[]> {
  if (isDemoMode()) return demoApi.listBusinesses();
  const rows = unwrapResponse(await supabase.from('businesses').select(COLUMNS).order('created_at'));
  return z.array(businessRowSchema).parse(rows);
}

export async function createBusiness(input: {
  name: string;
  businessType: BusinessType;
  currency: string;
  pricesIncludeTaxes?: boolean | null;
}): Promise<string> {
  const id = unwrapResponse(
    await supabase.rpc('create_business', {
      p_name: input.name,
      p_business_type: input.businessType,
      p_currency: input.currency,
      p_prices_include_taxes: input.pricesIncludeTaxes ?? null,
    }),
  );
  return z.string().parse(id);
}

export async function createDemoBusiness(): Promise<string> {
  return z.string().parse(unwrapResponse(await supabase.rpc('create_demo_business')));
}

export async function updateBusiness(
  id: string,
  patch: Partial<{ name: string; business_type: BusinessType; currency: string; prices_include_taxes: boolean | null }>,
): Promise<void> {
  if (isDemoMode()) throw new DataError('En la demo no se pueden cambiar los datos del negocio.', 'DEMO');
  unwrapResponse(await supabase.from('businesses').update(patch).eq('id', id).select('id'));
}
