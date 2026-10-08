/**
 * Demo pública: la app corre con datos ficticios en memoria, sin cuenta y sin
 * tocar Supabase. Se activa por pestaña (sessionStorage) y se pierde al cerrarla.
 */
const KEY = 'margen.demoMode';

export function isDemoMode(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Entra a la demo y recarga la app desde el inicio. */
export function enterDemoMode() {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Sin sessionStorage la demo no puede persistir entre recargas; igual se intenta.
  }
  window.location.assign('/');
}

export function exitDemoMode(to = '/registro') {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nada que limpiar
  }
  window.location.assign(to);
}
