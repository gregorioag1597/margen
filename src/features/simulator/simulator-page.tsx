import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Bookmark, CheckCircle2, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AffixInput, Field, Input, Segmented, Select } from '@/components/ui/form';
import { Banner, Card, ListSkeleton, MobileAction, PageHeader, Sheet } from '@/components/ui/surfaces';
import { dataErrorMessage } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { useBusinessModel } from '@/features/business/use-business-model';
import { calculateScenarioImpact, type BusinessSnapshot, type Dec, type ScenarioImpact } from '@/domain/finance';
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { fractionToPercentInput } from '@/lib/number-input';
import { invalidateBusinessData } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { applyScenario, deleteScenario, listDraftScenarios, saveDraftScenario } from './api';
import { buildScenarioPlan, EMPTY_LEVERS, hasAnyLever, planToChanges, planToRpcItems, type Levers, type PlanItem } from './plan';

const QUICK_QUESTIONS: { label: string; levers: Partial<Levers> }[] = [
  { label: '¿Y si subo precios 10 %?', levers: { pricePct: '10' } },
  { label: '¿Y si suben los insumos 15 %?', levers: { ingredientCostPct: '15' } },
  { label: '¿Y si vendo 20 % menos?', levers: { volumePct: '-20' } },
  { label: '¿Y si aumenta el alquiler y demás fijos 10 %?', levers: { fixedCostsPct: '10' } },
];

export function SimulatorPage() {
  const business = useCurrentBusiness();
  const { snapshot, isPending, error } = useBusinessModel();
  const [levers, setLevers] = useState<Levers>(EMPTY_LEVERS);
  const [confirming, setConfirming] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);

  const result = useMemo(() => {
    if (!snapshot) return null;
    const { plan, errors } = buildScenarioPlan(snapshot, levers);
    return { plan, errors, impact: calculateScenarioImpact(snapshot, planToChanges(plan)) };
  }, [snapshot, levers]);

  if (isPending) return <ListSkeleton />;
  if (error || !snapshot || !result) return <Banner tone="warning">{dataErrorMessage(error)}</Banner>;

  const set = (patch: Partial<Levers>) => { setApplied(null); setLevers((l) => ({ ...l, ...patch })); };
  const currency = business.currency;
  const active = hasAnyLever(levers);

  if (snapshot.products.length === 0) {
    return (
      <>
        <PageHeader title="Simulador" />
        <Banner>Para simular necesitás al menos un producto con precio y ventas estimadas.</Banner>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Simulador" description="Probá cambios sin tocar tus datos. Nada se guarda hasta que lo apliques." />

      {applied !== null && (
        <div className="mb-4">
          <Banner>
            <span className="flex items-center gap-2"><CheckCircle2 className="size-4" /> Escenario aplicado: {applied} cambio{applied === 1 ? '' : 's'} guardado{applied === 1 ? '' : 's'}.</span>
          </Banner>
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => set({ ...EMPTY_LEVERS, ...q.levers })}
            className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm hover:border-brand-500 hover:text-brand-700"
          >
            {q.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_1fr] md:items-start">
        <div className="space-y-3">
          <LeverCard title="Precios de venta" error={result.errors.pricePct}>
            <PctInput label="Cambio de precios" value={levers.pricePct} onChange={(v) => set({ pricePct: v })} chips={['-5', '5', '10', '20']} />
            <Segmented
              ariaLabel="A qué productos"
              value={levers.priceProductIds === 'all' ? 'all' : 'some'}
              onChange={(v) => set({ priceProductIds: v === 'all' ? 'all' : [] })}
              options={[{ value: 'all', label: 'Todos' }, { value: 'some', label: 'Algunos' }]}
            />
            {levers.priceProductIds !== 'all' && (
              <ProductPicker snapshot={snapshot} selected={levers.priceProductIds} onChange={(ids) => set({ priceProductIds: ids })} />
            )}
          </LeverCard>

          <LeverCard title="Costo de los insumos" error={result.errors.ingredientCostPct}>
            <PctInput label="Cambio de costo de insumos" value={levers.ingredientCostPct} onChange={(v) => set({ ingredientCostPct: v })} chips={['5', '10', '20']} />
          </LeverCard>

          <LeverCard title="Cantidad de ventas" error={result.errors.volumePct}>
            <PctInput label="Cambio de ventas" value={levers.volumePct} onChange={(v) => set({ volumePct: v })} chips={['-20', '-10', '10', '20']} />
          </LeverCard>

          <LeverCard title="Costos fijos" error={result.errors.fixedCostsPct}>
            <PctInput label="Cambio de costos fijos" value={levers.fixedCostsPct} onChange={(v) => set({ fixedCostsPct: v })} chips={['5', '10', '-10']} />
          </LeverCard>

          {snapshot.variableCosts.some((v) => v.isActive) && (
            <LeverCard title="Comisión o costo de venta" error={result.errors.commission}>
              <CommissionLever snapshot={snapshot} value={levers.commission} onChange={(c) => set({ commission: c })} />
            </LeverCard>
          )}

          {active && (
            <Button variant="ghost" size="sm" onClick={() => set(EMPTY_LEVERS)}><RotateCcw /> Empezar de nuevo</Button>
          )}
        </div>

        <div className="space-y-3 md:sticky md:top-6">
          <Results impact={result.impact} currency={currency} active={result.plan.length > 0} />
          {result.plan.length > 0 && (
            <div className="hidden gap-2 md:flex">
              <Button size="lg" className="flex-1" onClick={() => setConfirming(true)}>Aplicar escenario</Button>
            </div>
          )}
          <SavedScenarios levers={levers} canSave={active} onLoad={(l) => set(l)} />
        </div>
      </div>

      {result.plan.length > 0 && (
        <MobileAction>
          <Button size="lg" block onClick={() => setConfirming(true)}>
            Aplicar escenario · {result.impact.profitChange.gte(0) ? '+' : '−'}{formatMoney(result.impact.profitChange.abs(), currency)}/mes
          </Button>
        </MobileAction>
      )}

      {confirming && (
        <ApplySheet
          plan={result.plan}
          currency={currency}
          onClose={() => setConfirming(false)}
          onApplied={(n) => { setConfirming(false); setLevers(EMPTY_LEVERS); setApplied(n); }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function LeverCard({ title, error, children }: { title: string; error?: string; children: ReactNode }) {
  return (
    <Card className="space-y-3 p-4">
      <p className="font-medium">{title}</p>
      {children}
      {error && <p role="alert" className="text-[13px] font-medium text-negative">{error}</p>}
    </Card>
  );
}

function PctInput({ label, value, onChange, chips }: { label: string; value: string; onChange: (v: string) => void; chips: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-28">
        <AffixInput aria-label={label} suffix="%" placeholder="0" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      {chips.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(value === c ? '' : c)}
          className={cn(
            'h-9 rounded-lg px-3 text-sm font-medium tabular',
            value === c ? 'bg-brand-700 text-white' : 'bg-canvas text-ink hover:bg-brand-50',
          )}
        >
          {Number(c) > 0 ? `+${c}` : c} %
        </button>
      ))}
    </div>
  );
}

function ProductPicker({ snapshot, selected, onChange }: { snapshot: BusinessSnapshot; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {snapshot.products.filter((p) => p.price !== null).map((p) => {
        const checked = selected.includes(p.id);
        return (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
              <input type="checkbox" className="size-5 accent-brand-600" checked={checked} onChange={() => onChange(checked ? selected.filter((x) => x !== p.id) : [...selected, p.id])} />
              {p.name}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function CommissionLever({ snapshot, value, onChange }: { snapshot: BusinessSnapshot; value: Levers['commission']; onChange: (v: Levers['commission']) => void }) {
  const options = snapshot.variableCosts.filter((v) => v.isActive);
  const current = options.find((o) => o.id === value?.variableCostId);
  return (
    <div className="grid grid-cols-[1fr_7rem] gap-2">
      <Select
        aria-label="Costo de venta a cambiar"
        value={value?.variableCostId ?? ''}
        onChange={(e) => onChange(e.target.value ? { variableCostId: e.target.value, newPercent: '' } : null)}
      >
        <option value="">Elegí uno</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name} ({formatPercent(Number(o.percentOfSale))})</option>)}
      </Select>
      <AffixInput
        aria-label="Nuevo porcentaje"
        suffix="%"
        disabled={!value}
        placeholder={current ? fractionToPercentInput(String(current.percentOfSale)) : ''}
        value={value?.newPercent ?? ''}
        onChange={(e) => value && onChange({ ...value, newPercent: e.target.value })}
      />
    </div>
  );
}

function Delta({ before, after, format, invert }: { before: Dec | null; after: Dec | null; format: (d: Dec | null) => string; invert?: boolean }) {
  const diff = before && after ? after.minus(before) : null;
  const good = diff ? (invert ? diff.lt(0) : diff.gt(0)) : false;
  const bad = diff ? (invert ? diff.gt(0) : diff.lt(0)) : false;
  return (
    <div className="flex flex-wrap items-baseline justify-end gap-x-2 tabular">
      {diff && !diff.isZero() && <span className="text-sm text-muted line-through decoration-1">{format(before)}</span>}
      <span className="font-semibold">{format(after)}</span>
      {diff && !diff.isZero() && (
        <span className={cn('text-[13px] font-medium', good && 'text-healthy', bad && 'text-negative')}>
          {diff.gt(0) ? '+' : '−'}{format(diff.abs())}
        </span>
      )}
    </div>
  );
}

function Results({ impact, currency, active }: { impact: ScenarioImpact; currency: string; active: boolean }) {
  const money = (d: Dec | null) => formatMoney(d, currency);
  const pct = (d: Dec | null) => formatPercent(d, 1);
  const b = impact.before.summary;
  const a = impact.after.summary;
  const changed = impact.products.filter((p) => p.monthlyProfitChange && !p.monthlyProfitChange.isZero());

  return (
    <Card className="p-4">
      <p className="mb-3 font-semibold">{active ? 'Resultado del escenario' : 'Tu mes hoy'}</p>
      <dl className="space-y-2.5 text-sm">
        <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Facturación</dt><dd><Delta before={b.monthlyRevenue} after={a.monthlyRevenue} format={money} /></dd></div>
        <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Ganancia</dt><dd><Delta before={b.monthlyProfit} after={a.monthlyProfit} format={money} /></dd></div>
        <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Margen promedio</dt><dd><Delta before={b.averageMargin} after={a.averageMargin} format={pct} /></dd></div>
      </dl>

      {active && changed.length > 0 && (
        <>
          <p className="mt-4 mb-2 border-t border-line pt-3 text-[13px] font-semibold tracking-wide text-muted uppercase">Por producto</p>
          <ul className="space-y-2">
            {changed.map((p) => (
              <li key={p.productId} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className={cn('tabular font-medium', p.monthlyProfitChange!.gt(0) ? 'text-healthy' : 'text-negative')}>
                    {p.monthlyProfitChange!.gt(0) ? '+' : '−'}{money(p.monthlyProfitChange!.abs())}/mes
                  </span>
                </div>
                <p className="text-[12px] text-muted tabular">
                  Margen {pct(p.before.margin)} <ArrowRight className="inline size-3" /> {pct(p.after.margin)}
                  {p.before.price && p.after.price && !p.before.price.eq(p.after.price) && ` · precio ${money(p.before.price)} → ${money(p.after.price)}`}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      {!active && <p className="mt-3 text-[13px] text-muted">Mové alguna palanca para ver qué cambia.</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function describeItem(item: PlanItem, currency: string): { what: string; from: string; to: string } {
  switch (item.target) {
    case 'product_price':
      return { what: `Precio de ${item.label}`, from: formatMoney(item.from, currency), to: formatMoney(item.to, currency) };
    case 'product_units':
      return { what: `Ventas por mes de ${item.label}`, from: formatNumber(item.from, 0), to: formatNumber(item.to, 0) };
    case 'ingredient_price':
      return { what: `Precio de compra de ${item.label}`, from: formatMoney(item.from, currency), to: formatMoney(item.to, currency) };
    case 'variable_cost_percent':
      return { what: item.label, from: formatPercent(item.from), to: formatPercent(item.to) };
    case 'fixed_cost_amount':
      return { what: item.label, from: formatMoney(item.from, currency), to: formatMoney(item.to, currency) };
  }
}

/** Antes de aplicar: lista exacta de qué datos van a cambiar. */
function ApplySheet({ plan, currency, onClose, onApplied }: { plan: PlanItem[]; currency: string; onClose: () => void; onApplied: (n: number) => void }) {
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const apply = useMutation({
    mutationFn: () => applyScenario(business.id, name || 'Escenario aplicado', planToRpcItems(plan)),
    onSuccess: async (n) => { await invalidateBusinessData(queryClient, business.id); onApplied(n); },
    onError: (e) => setError(dataErrorMessage(e)),
  });

  return (
    <Sheet
      open
      onClose={onClose}
      title="Aplicar escenario"
      footer={<Button size="lg" block loading={apply.isPending} onClick={() => { setError(null); apply.mutate(); }}>Confirmar y aplicar {plan.length} cambio{plan.length === 1 ? '' : 's'}</Button>}
    >
      <div className="space-y-4">
        {error && <Banner tone="warning">{error}</Banner>}
        <Banner tone="warning">Estos datos reales van a cambiar. Los precios anteriores quedan en el historial.</Banner>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {plan.map((item) => {
            const d = describeItem(item, currency);
            return (
              <li key={`${item.target}-${item.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">{d.what}</span>
                <span className="shrink-0 tabular"><span className="text-muted">{d.from}</span> → <strong>{d.to}</strong></span>
              </li>
            );
          })}
        </ul>
        <Field label="Nombre (opcional, para tu registro)">
          {(id) => <Input id={id} placeholder="Ej.: Aumento de octubre" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}
        </Field>
      </div>
    </Sheet>
  );
}

function SavedScenarios({ levers, canSave, onLoad }: { levers: Levers; canSave: boolean; onLoad: (l: Levers) => void }) {
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const key = ['scenarios', business.id] as const;
  const saved = useQuery({ queryKey: key, queryFn: () => listDraftScenarios(business.id) });
  const [naming, setNaming] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (name: string) => saveDraftScenario(business.id, name, levers),
    onSuccess: async () => { setNaming(null); await queryClient.invalidateQueries({ queryKey: key }); },
  });
  const remove = useMutation({ mutationFn: deleteScenario, onSuccess: () => queryClient.invalidateQueries({ queryKey: key }) });

  if (!canSave && !saved.data?.length) return null;

  return (
    <Card className="p-4">
      <p className="mb-2 flex items-center gap-2 font-medium"><Bookmark className="size-4 text-brand-600" /> Escenarios guardados</p>
      {canSave && (naming === null ? (
        <Button variant="secondary" size="sm" onClick={() => setNaming('')}>Guardar este escenario</Button>
      ) : (
        <div className="flex gap-2">
          <Input aria-label="Nombre del escenario" placeholder="Ej.: Suba de precios" value={naming} onChange={(e) => setNaming(e.target.value)} maxLength={120} />
          <Button loading={save.isPending} onClick={() => save.mutate(naming.trim() || 'Escenario')}>Guardar</Button>
        </div>
      ))}
      {saved.data && saved.data.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {saved.data.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2">
              <button type="button" disabled={!s.levers} onClick={() => s.levers && onLoad(s.levers)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="text-[12px] text-muted">{formatDate(s.createdAt)} · tocá para cargarlo</p>
              </button>
              <button type="button" aria-label={`Eliminar ${s.name}`} onClick={() => remove.mutate(s.id)} className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-negative">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
