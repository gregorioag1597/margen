import { WifiOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Aviso cuando no hay internet: la app abre igual, pero los datos viven en Supabase. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-low-soft px-4 py-2 text-center text-[13px] font-medium text-[#6b4300]">
      <WifiOff className="size-4" aria-hidden />
      Sin conexión: no se pueden cargar ni guardar datos hasta que vuelva internet.
    </div>
  );
}
