import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Banner, Card } from '@/components/ui/surfaces';
import { dataErrorMessage } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { updateProduct } from '@/features/products/api';
import { formatMoney, formatPercent } from '@/lib/format';
import { invalidateBusinessData, queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import type { ImpactView } from './price-impact-model';

/** Resumen compacto mientras se edita el precio (antes de guardar). */
export function ImpactPreview({ view, currency }: { view: ImpactView; currency: string }) {
  if (view.direction === 'none' || view.affectedCount === 0) return null;
  const up = view.direction === 'up';
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <div role="status" className={cn('rounded-xl p-4', up ? 'bg-negative-soft' : 'bg-healthy-soft')}>
      <p className={cn('flex items-center gap-2 font-semibold', up ? 'text-negative' : 'text-healthy')}>
        <Icon className="size-4" aria-hidden />
        {view.affectedCount} producto{view.affectedCount === 1 ? '' : 's'} afectado{view.affectedCount === 1 ? '' : 's'}
      </p>
      <p className="mt-1 text-sm text-ink">
        El costo de este insumo {up ? 'sube' : 'baja'} {formatPercent(view.impact.unitCostChangePct?.abs(), 1)}.{' '}
        {view.monthlyProfitLost.isZero() ? null : up ? (
          <>Perderías <strong className="tabular">{formatMoney(view.monthlyProfitLost, currency)}</strong> de ganancia por mes.</>
        ) : (
          <>Ganarías <strong className="tabular">{formatMoney(view.monthlyProfitLost.neg(), currency)}</strong> más por mes.</>
        )}
      </p>
      <ul className="mt-2 space-y-0.5 text-[13px] text-muted">
        {view.products.slice(0, 4).map((p) => (
          <li key={p.productId} className="flex justify-between gap-2">
            <span className="truncate">{p.name}</span>
            <span className="tabular">
              {p.marginBefore ? formatPercent(p.marginBefore, 1) : '—'} → {p.marginAfter ? formatPercent(p.marginAfter, 1) : '—'}
            </span>
          </li>
        ))}
        {view.affectedCount > 4 && <li>y {view.affectedCount - 4} más…</li>}
      </ul>
      <p className="mt-2 text-[12px] text-muted">Al guardar te mostramos qué precio mantendría tu margen. Tus precios no cambian solos.</p>
    </div>
  );
}

/** Pantalla después de guardar: impacto completo por producto y opción de ajustar precios. */
export function ImpactReport({ view, ingredientName, currency }: { view: ImpactView; ingredientName: string; currency: string }) {
  const up = view.direction === 'up';
  const { impact } = view;

  return (
    <div className="space-y-4">
      <Banner>
        Actualizamos <strong>{ingredientName}</strong> y recalculamos tus productos. Revisá si querés ajustar algún precio: nada cambia sin tu confirmación.
      </Banner>

      <Card className="p-4">
        <p className="text-[13px] text-muted">Ganancia estimada del mes</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold tabular">
          <span className="text-muted line-through decoration-1">{formatMoney(impact.monthlyProfitBefore, currency)}</span>
          <ArrowRight className="size-4 text-muted" aria-hidden />
          <span className={up ? 'text-negative' : 'text-healthy'}>{formatMoney(impact.monthlyProfitAfter, currency)}</span>
        </p>
        {!view.monthlyProfitLost.isZero() && (
          <p className={cn('text-sm font-medium', up ? 'text-negative' : 'text-healthy')}>
            {up ? '−' : '+'}{formatMoney(view.monthlyProfitLost.abs(), currency)} por mes
          </p>
        )}
      </Card>

      <h3 className="pt-1 font-semibold">
        {view.affectedCount} producto{view.affectedCount === 1 ? '' : 's'} afectado{view.affectedCount === 1 ? '' : 's'}
      </h3>
      <ul className="space-y-3">
        {view.products.map((p) => <AffectedProductCard key={p.productId} product={p} currency={currency} />)}
      </ul>
    </div>
  );
}

function AffectedProductCard({ product: p, currency }: { product: ImpactView['products'][number]; currency: string }) {
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useMutation({
    mutationFn: () => updateProduct(p.productId, { price: p.suggestedPrice!.toString() }),
    onSuccess: async () => {
      setApplied(true);
      await invalidateBusinessData(queryClient, business.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.productHistory(p.productId) });
    },
    onError: (e) => setError(dataErrorMessage(e)),
  });

  const showApply = p.suggestedPrice && p.currentPrice && !p.suggestedPrice.eq(p.currentPrice);

  return (
    <li>
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <Link to={`/productos/${p.productId}`} className="font-medium hover:underline">{p.name}</Link>
          <span className={cn('text-sm tabular', p.costIncrease.gt(0) ? 'text-negative' : 'text-healthy')}>
            {p.costIncrease.gte(0) ? '+' : ''}{formatMoney(p.costIncrease, currency)}/u.
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-[12px] text-muted">Costo directo</dt>
            <dd className="tabular">{formatMoney(p.costBefore, currency)} → <strong>{formatMoney(p.costAfter, currency)}</strong></dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Margen</dt>
            <dd className="tabular">
              {p.marginBefore ? formatPercent(p.marginBefore, 1) : '—'} →{' '}
              <strong className={p.marginAfter?.lt(0) ? 'text-negative' : ''}>{p.marginAfter ? formatPercent(p.marginAfter, 1) : '—'}</strong>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Precio actual</dt>
            <dd className="tabular">{p.currentPrice ? formatMoney(p.currentPrice, currency) : 'Sin precio'}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Ganancia por mes</dt>
            <dd className={cn('tabular', p.monthlyProfitLost.gt(0) ? 'text-negative' : 'text-healthy')}>
              {p.monthlyProfitLost.isZero() ? '—' : `${p.monthlyProfitLost.gt(0) ? '−' : '+'}${formatMoney(p.monthlyProfitLost.abs(), currency)}`}
            </dd>
          </div>
        </dl>

        {p.suggestedPrice && (
          <div className="mt-3 rounded-xl bg-brand-50 p-3">
            <p className="text-[13px] text-brand-700">
              {p.suggestionKind === 'keep-margin' ? 'Precio para mantener tu margen' : 'Precio recomendado (tu margen objetivo)'}
            </p>
            <p className="font-semibold text-brand-900 tabular">{formatMoney(p.suggestedPrice, currency)}</p>
          </div>
        )}

        {error && <p role="alert" className="mt-2 text-[13px] font-medium text-negative">{error}</p>}
        {applied ? (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-healthy" role="status">
            <Check className="size-4" /> Precio actualizado a {formatMoney(p.suggestedPrice, currency)}
          </p>
        ) : (
          showApply && (
            <Button className="mt-3" variant="secondary" block loading={apply.isPending} onClick={() => apply.mutate()}>
              Usar {formatMoney(p.suggestedPrice, currency)}
            </Button>
          )
        )}
      </Card>
    </li>
  );
}
