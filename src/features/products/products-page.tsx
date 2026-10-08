import { Archive, ChevronRight, Package, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Banner, Card, EmptyState, ListSkeleton, MobileAction, PageHeader } from '@/components/ui/surfaces';
import { dataErrorMessage } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { useBusinessModel } from '@/features/business/use-business-model';
import type { ProductEconomics } from '@/domain/finance';
import { formatMoney, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MarginBadge } from './margin-badge';
import { ProductInfoSheet } from './product-info-sheet';

export function ProductsPage() {
  const business = useCurrentBusiness();
  const { model, productRows, isPending, error } = useBusinessModel();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const archived = productRows.filter((p) => p.archived_at);
  const addButton = <Button size="lg" block onClick={() => setCreating(true)}><Plus /> Agregar producto</Button>;

  return (
    <>
      <PageHeader
        title="Mis productos"
        description="Cuánto te cuesta cada uno y cuánto ganás."
        action={<Button onClick={() => setCreating(true)}><Plus /> Agregar producto</Button>}
      />

      {isPending ? (
        <ListSkeleton />
      ) : error || !model ? (
        <Banner tone="warning">{dataErrorMessage(error)}</Banner>
      ) : showArchived ? (
        <ul className="space-y-2">
          {archived.map((p) => (
            <li key={p.id}>
              <Card>
                <Link to={`/productos/${p.id}`} className="flex items-center justify-between p-4">
                  <span className="font-medium">{p.name}</span>
                  <ChevronRight className="size-4 text-muted" />
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      ) : model.products.length === 0 ? (
        <EmptyState icon={<Package />} title="Todavía no cargaste productos" action={<div className="hidden md:block">{addButton}</div>}>
          Creá un producto y contanos qué lleva: insumos, packaging y minutos de trabajo. Calculamos cuánto te cuesta y a qué precio venderlo.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {model.products.map((p) => (
            <li key={p.productId}>
              <ProductCard product={p} currency={business.currency} />
            </li>
          ))}
        </ul>
      )}

      {(archived.length > 0 || showArchived) && (
        <button type="button" onClick={() => setShowArchived((v) => !v)} className="mx-auto mt-3 flex items-center gap-2 py-3 text-sm font-medium text-muted hover:text-ink">
          <Archive className="size-4" />
          {showArchived ? 'Ver productos activos' : `Ver archivados (${archived.length})`}
        </button>
      )}

      <MobileAction>{addButton}</MobileAction>
      {creating && <ProductInfoSheet product={null} open onClose={() => setCreating(false)} />}
    </>
  );
}

function ProductCard({ product: p, currency }: { product: ProductEconomics; currency: string }) {
  return (
    <Card className="transition-colors hover:border-brand-500/40">
      <Link to={`/productos/${p.productId}`} className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{p.name}</p>
          <p className="mt-0.5 text-[13px] text-muted tabular">
            {p.price ? formatMoney(p.price, currency) : 'Sin precio'}
            {p.totalCostPerUnit && ` · te cuesta ${formatMoney(p.totalCostPerUnit, currency)}`}
          </p>
          <div className="mt-2"><MarginBadge product={p} /></div>
        </div>
        <div className="text-right">
          <p
            className={cn(
              'text-xl font-semibold tabular',
              p.marginStatus === 'negative' && 'text-negative',
              p.marginStatus === 'low' && 'text-low',
              p.marginStatus === 'healthy' && 'text-healthy',
            )}
          >
            {p.margin ? formatPercent(p.margin, 0) : '—'}
          </p>
          <p className="text-[12px] text-muted">margen</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
      </Link>
    </Card>
  );
}
