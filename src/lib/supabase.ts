import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False si falta .env.local: la app muestra una pantalla de configuración en lugar de romperse. */
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('xxxx'));

/**
 * Cliente único. Solo usa la clave pública (anon): la seguridad la hace la
 * RLS de la base. Nunca poner la service_role en el frontend.
 */
export const supabase: SupabaseClient = createClient(
  url ?? 'http://localhost:54321',
  anonKey ?? 'missing-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
);

/** Error de Supabase/Postgres con el código que usamos para traducir mensajes. */
export class DataError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'DataError';
  }
}

/** Lanza DataError si la respuesta trae error; si no, devuelve data. */
export function unwrapResponse<T>(response: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (response.error) throw new DataError(response.error.message, response.error.code);
  return response.data as T;
}
