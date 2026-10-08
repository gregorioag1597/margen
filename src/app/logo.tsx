import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="flex size-8 items-center justify-center rounded-xl bg-brand-700 text-white">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 18 9.5 11l4 4L20 6" />
          <path d="M15 6h5v5" />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-tight">Margen</span>
    </div>
  );
}
