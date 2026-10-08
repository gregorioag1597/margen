import { AlertTriangle, Info, X } from 'lucide-react';
import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-line bg-surface', className)} {...props} />;
}

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="hidden md:block">{action}</div>}
    </header>
  );
}

/** Botón principal fijo al alcance del pulgar en mobile (arriba de la nav inferior). */
export function MobileAction({ children }: { children: ReactNode }) {
  return <div className="fixed inset-x-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 md:hidden">{children}</div>;
}

export function Banner({ tone = 'info', title, children }: { tone?: 'info' | 'warning'; title?: string; children: ReactNode }) {
  const Icon = tone === 'warning' ? AlertTriangle : Info;
  return (
    <div
      role={tone === 'warning' ? 'alert' : 'note'}
      className={cn(
        'flex gap-3 rounded-xl p-3.5 text-sm leading-snug',
        tone === 'warning' ? 'bg-low-soft text-[#6b4300]' : 'bg-brand-50 text-brand-900',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 [&_svg]:size-6">{icon}</div>
      <h2 className="font-semibold">{title}</h2>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-line/60', className)} />;
}

export function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Cargando">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[72px]" />)}
    </div>
  );
}

/**
 * Panel para formularios: hoja inferior en mobile, panel lateral en desktop.
 * Usa <dialog> nativo (foco atrapado, Escape para cerrar, accesible).
 */
export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl bg-surface p-0 text-ink backdrop:bg-ink/40 md:mr-0 md:ml-auto md:mt-0 md:h-dvh md:max-h-dvh md:w-[460px] md:rounded-none md:rounded-l-3xl"
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col md:h-dvh md:max-h-dvh">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-muted hover:bg-canvas" aria-label="Cerrar">
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="border-t border-line px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))]">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'brand' | 'healthy' | 'low' | 'negative'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-canvas text-muted',
    brand: 'bg-brand-50 text-brand-700',
    healthy: 'bg-healthy-soft text-healthy',
    low: 'bg-low-soft text-low',
    negative: 'bg-negative-soft text-negative',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}
