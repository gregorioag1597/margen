import { ChevronLeft, ChevronRight } from 'lucide-react';
import { currentMonth, shiftMonth } from '@/domain/finance';

/** "octubre de 2026" con flechas para cambiar de mes. No deja ir al futuro. */
export function MonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  const [y, m] = value.split('-').map(Number) as [number, number];
  const label = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  const isCurrent = value >= currentMonth();
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
      <button type="button" onClick={() => onChange(shiftMonth(value, -1))} aria-label="Mes anterior" className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink">
        <ChevronLeft className="size-5" />
      </button>
      <span className="min-w-36 text-center text-sm font-medium first-letter:uppercase" aria-live="polite">{label}</span>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(value, 1))}
        disabled={isCurrent}
        aria-label="Mes siguiente"
        className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink disabled:opacity-30"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}
