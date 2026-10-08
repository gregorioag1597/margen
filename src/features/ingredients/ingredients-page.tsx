import { useQuery } from '@tanstack/react-query';
import { Archive, ChevronRight, Plus, Search, Wheat } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Banner, Badge, Card, EmptyState, ListSkeleton, MobileAction, PageHeader } from '@/components/ui/surfaces';
import { dataErrorMessage, GLOSSARY } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { formatDate, formatNumber, formatUnitCost, UNIT_LABELS, formatMoney } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { listIngredients, listIngredientUsage } from './api';
import { IngredientSheet } from './ingredient-sheet';
import type { IngredientRow } from './schemas';
import { getUnitCostView } from './unit-cost';

export function IngredientsPage() {
  const business = useCurrentBusiness();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<IngredientRow | 'new' | null>(null);

  const ingredients = useQuery({ queryKey: queryKeys.ingredients(business.id), queryFn: () => listIngredients(business.id) });
  const usage = useQuery({ queryKey: queryKeys.ingredientUsage(business.id), queryFn: () => listIngredientUsage(business.id) });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (ingredients.data ?? [])
      .filter((i) => (showArchived ? i.archived_at : !i.archived_at))
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.supplier?.toLowerCase().includes(q));
  }, [ingredients.data, search, showArchived]);

  const archivedCount = (ingredients.data ?? []).filter((i) => i.archived_at).length;
  const addButton = (
    <Button onClick={() => setEditing('new')} size="lg" block>
      <Plus /> Agregar insumo
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Mis insumos"
        description="Lo que comprás para hacer tus productos."
        action={<Button onClick={() => setEditing('new')}><Plus /> Agregar insumo</Button>}
      />

      {ingredients.isPending ? (
        <ListSkeleton />
      ) : ingredients.isError ? (
        <Banner tone="warning">{dataErrorMessage(ingredients.error)}</Banner>
      ) : ingredients.data.length === 0 ? (
        <EmptyState icon={<Wheat />} title="Todavía no cargaste insumos" action={<div className="hidden md:block">{addButton}</div>}>
          Empezá por lo que más usás. Por ejemplo: chocolate, 1 kg, $18.000. Te calculamos cuánto cuesta cada gramo.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {ingredients.data.length > 5 && (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input className="pl-10" placeholder="Buscar insumo o proveedor" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar insumo" />
            </div>
          )}

          <ul className="space-y-2">
            {visible.map((ingredient) => (
              <li key={ingredient.id}>
                <IngredientCard ingredient={ingredient} usedIn={usage.data?.get(ingredient.id) ?? 0} currency={business.currency} onClick={() => setEditing(ingredient)} />
              </li>
            ))}
          </ul>
          {visible.length === 0 && <p className="py-6 text-center text-sm text-muted">No hay insumos que coincidan.</p>}

          {(archivedCount > 0 || showArchived) && (
            <button type="button" onClick={() => setShowArchived((v) => !v)} className="mx-auto flex items-center gap-2 py-3 text-sm font-medium text-muted hover:text-ink">
              <Archive className="size-4" />
              {showArchived ? 'Ver insumos activos' : `Ver archivados (${archivedCount})`}
            </button>
          )}
        </div>
      )}

      <MobileAction>{addButton}</MobileAction>

      <IngredientSheet
        key={editing === 'new' ? 'new' : editing?.id ?? 'closed'}
        ingredient={editing === 'new' ? null : editing}
        open={editing !== null}
        usedIn={editing && editing !== 'new' ? usage.data?.get(editing.id) ?? 0 : 0}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function IngredientCard({ ingredient, usedIn, currency, onClick }: { ingredient: IngredientRow; usedIn: number; currency: string; onClick: () => void }) {
  const view = getUnitCostView(ingredient.purchase_qty, ingredient.purchase_unit, ingredient.purchase_price);
  const unit = UNIT_LABELS[ingredient.purchase_unit];

  return (
    <Card className="transition-colors hover:border-brand-500/40">
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{ingredient.name}</p>
            {ingredient.archived_at && <Badge>Archivado</Badge>}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {formatNumber(ingredient.purchase_qty)} {unit.short} a {formatMoney(ingredient.purchase_price, currency)}
            {ingredient.supplier && ` · ${ingredient.supplier}`}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            Actualizado {formatDate(ingredient.price_updated_at)}
            {usedIn > 0 && ` · en ${usedIn} producto${usedIn === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="text-right" title={GLOSSARY.unitCost}>
          <p className="tabular font-semibold">{view ? formatUnitCost(view.perBase, currency) : '—'}</p>
          <p className="text-[12px] text-muted">por {view ? UNIT_LABELS[view.baseUnit].singular : unit.singular}</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
      </button>
    </Card>
  );
}
