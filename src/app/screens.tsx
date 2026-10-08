import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/surfaces';
import { dataErrorMessage } from '@/copy/messages';
import { Logo } from './logo';

export function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <Loader2 className="size-6 animate-spin text-brand-600" aria-label="Cargando" />
    </div>
  );
}

export function FullScreenError({ error }: { error: unknown }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="max-w-sm text-muted">{dataErrorMessage(error)}</p>
      <Button variant="outline" onClick={() => window.location.reload()}>Reintentar</Button>
    </div>
  );
}

/** Se muestra si falta .env.local, en lugar de una app rota. */
export function SetupScreen() {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-10">
      <Logo className="mb-8" />
      <Card className="w-full max-w-lg space-y-3 p-6 text-sm leading-relaxed">
        <h1 className="text-xl font-semibold">Falta conectar Supabase</h1>
        <p>Creá un archivo <code className="rounded bg-canvas px-1">.env.local</code> en la carpeta del proyecto con:</p>
        <pre className="overflow-x-auto rounded-xl bg-canvas p-3 text-xs">
{`VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-publica`}
        </pre>
        <p className="text-muted">Los datos están en Supabase → Project Settings → API. Usá solo la clave pública (anon / publishable).</p>
      </Card>
    </main>
  );
}
