import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Plus, Receipt, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input, Segmented, Select } from '@/components/ui/form';
import { MonthPicker } from '@/components/ui/month-picker';
import { Banner, Card, EmptyState, ListSkeleton, MobileAction, PageHeader } from '@/components/ui/surfaces';
import { dataErrorMessage } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { currentMonth, filterMovements, monthRange, summarizeMovements } from '@/domain/finance';
import { formatMoney } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { listMovements, toMovement } from './api';
import { MovementSheet } from './movement-sheet';
import { categoriesFor, categoryLabel, EXPENSE_CATEGORIES, INCOME_CATEGORIES, paymentLabel, type MovementKind, type MovementRow } from './schemas';

type Tab = 'all' | MovementKind;

export function MovementsPage() {
  const business = useCurrentBusiness();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get('mes') ?? '') ? params.get('mes')! : currentMonth();
  const tab = (['all', 'income', 'expense'].includes(params.get('tipo') ?? '') ? params.get('tipo') : 'all') as Tab;
  const [day, setDay] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<MovementRow | 'new' | null>(null);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next, { replace: true });
  };

  const query = useQuery({ queryKey: queryKeys.movements(business.id, month), queryFn: () => listMovements(business.id, month) });

  const rows = query.data ?? [];
  const filtered = useMemo(() => {
    const ids = new Set(
      filterMovements(rows.map(toMovement), { kind: tab === 'all' ? undefined : tab, date: day || undefined, category: category || undefined }).map((m) => m.id),
    );
    return rows.filter((r) => ids.has(r.id));
  }, [rows, tab, day, category]);
  const totals = summarizeMovements(filtered.map(toMovement));
  const { from, to } = monthRange(month);
  const hasFilters = Boolean(day || category);

  // Agrupar por día para la vista cronológica.
  const byDay = useMemo(() => {
    const groups = new Map<string, MovementRow[]>();
    for (const r of filtered) groups.set(r.occurred_on, [...(groups.get(r.occurred_on) ?? []), r]);
    return [...groups];
  }, [filtered]);

  const addButton = (
    <Button size="lg" block onClick={() => setEditing('new')}>
      <Plus /> Registrar {tab === 'income' ? 'ingreso' : tab === 'expense' ? 'egreso' : 'movimiento'}
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Movimientos"
        description="La plata que realmente entró y salió."
        action={<Button onClick={() => setEditing('new')}><Plus /> Registrar</Button>}
      />

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MonthPicker value={month} onChange={(m) => { setDay(''); update({ mes: m }); }} />
        </div>
        <Segmented<Tab>
          ariaLabel="Tipo de movimiento"
          value={tab}
          onChange={(t) => { setCategory(''); update({ tipo: t }); }}
          options={[{ value: 'all', label: 'Todos' }, { value: 'income', label: 'Ingresos' }, { value: 'expense', label: 'Egresos' }]}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" aria-label="Filtrar por día" min={from} max={to} value={day} onChange={(e) => setDay(e.target.value)} />
          <Select aria-label="Filtrar por categoría" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas las categorías</option>
            {(tab === 'all' ? [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES] : categoriesFor(tab)).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </div>
        {hasFilters && (
          <button type="button" onClick={() => { setDay(''); setCategory(''); }} className="flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
            <X className="size-4" /> Quitar filtros
          </button>
        )}
      </div>

      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <Banner tone="warning">{dataErrorMessage(query.error)}</Banner>
      ) : (
        <>
          <Card className={cn('mb-4 grid divide-x divide-line', tab === 'all' ? 'grid-cols-3' : 'grid-cols-2')}>
            {tab !== 'expense' && <Total label="Ingresos" value={formatMoney(totals.income, business.currency)} tone="healthy" />}
            {tab !== 'income' && <Total label="Egresos" value={formatMoney(totals.expense, business.currency)} tone="negative" />}
            {tab === 'all' ? (
              <Total label="Resultado" value={formatMoney(totals.result, business.currency)} tone={totals.result.lt(0) ? 'negative' : undefined} />
            ) : (
              <Total label="Movimientos" value={String(filtered.length)} />
            )}
          </Card>

          {rows.length === 0 ? (
            <EmptyState icon={<Receipt />} title="Sin movimientos este mes" action={<div className="hidden md:block">{addButton}</div>}>
              Registrá lo que vendiste y lo que pagaste. Por ejemplo: "Ventas del sábado $120.000" o "Compra de harina $25.000".
            </EmptyState>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No hay movimientos con esos filtros.</p>
          ) : (
            <div className="space-y-4">
              {byDay.map(([date, items]) => (
                <section key={date}>
                  <h2 className="mb-1.5 px-1 text-[13px] font-medium text-muted first-letter:uppercase">
                    {new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`))}
                  </h2>
                  <Card>
                    <ul className="divide-y divide-line">
                      {items.map((m) => <MovementLine key={m.id} movement={m} currency={business.currency} onClick={() => setEditing(m)} />)}
                    </ul>
                  </Card>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <MobileAction>{addButton}</MobileAction>
      {editing && (
        <MovementSheet
          movement={editing === 'new' ? null : editing}
          initialKind={tab === 'expense' ? 'expense' : 'income'}
          open
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function Total({ label, value, tone }: { label: string; value: string; tone?: 'healthy' | 'negative' }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={cn('mt-0.5 font-semibold tabular', tone === 'healthy' && 'text-healthy', tone === 'negative' && 'text-negative')}>{value}</p>
    </div>
  );
}

function MovementLine({ movement: m, currency, onClick }: { movement: MovementRow; currency: string; onClick: () => void }) {
  const income = m.kind === 'income';
  const Icon = income ? ArrowDownLeft : ArrowUpRight;
  const detail = [categoryLabel(m.category), income ? paymentLabel(m.payment_method) : m.supplier].filter(Boolean).join(' · ');
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas">
        <span
          className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', income ? 'bg-healthy-soft text-healthy' : 'bg-negative-soft text-negative')}
          aria-label={income ? 'Ingreso' : 'Egreso'}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{m.concept}</p>
          <p className="truncate text-[13px] text-muted">{detail}</p>
        </div>
        <p className={cn('font-semibold tabular', income ? 'text-healthy' : 'text-ink')}>
          {income ? '+' : '−'}{formatMoney(m.amount, currency)}
        </p>
      </button>
    </li>
  );
}
