import { DataError, supabase } from '@/lib/supabase';
import type { BusinessType } from '@/features/business/constants';

export interface SignupInput {
  fullName: string;
  email: string;
  password: string;
  businessName: string;
  businessType: BusinessType;
  currency: string;
}

/**
 * Crea la cuenta. Los datos del negocio viajan también en la metadata para
 * que, si algún día se activa la confirmación por email, el onboarding pueda
 * completarlos después del primer ingreso.
 * Devuelve true si ya hay sesión (confirmación de email desactivada).
 */
export async function signUp(input: SignupInput): Promise<{ hasSession: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.fullName,
        pending_business: { name: input.businessName, business_type: input.businessType, currency: input.currency },
      },
    },
  });
  if (error) throw new DataError(error.message, error.code);
  return { hasSession: Boolean(data.session) };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new DataError(error.message, error.code);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
