import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, Circle, Target } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AffixInput, Segmented } from '@/components/ui/form';
import { Banner, Card, ListSkeleton, PageHeader } from '@/components/ui/surfaces';
import { dataErrorMessage, financeErrorMessage, GLOSSARY } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { useBusinessModel } from '@/features/business/use-business-model';
import { listIngredients } from '@/features/ingredients/api';
import { MarginBadge } from '@/features/products/margin-badge';
import { listMovements, toMovement } from '@/features/movements/api';
import { categoryLabel } from '@/features/movements/schemas';
import { MonthPicker } from '@/components/ui/month-picker';
import { currentMonth, summarizeMovements, type BusinessModel, type ProductEconomics } from '@/domain/finance';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { parseLocaleDecimal } from '@/lib/number-input';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { buildDashboard, buildProfitGoal, type DashboardView } from './dashboard-view';

export function DashboardPage() {
  const business = useCurrentBusiness();
  const { model, isPending, error } = useBusinessModel();

  if (isPending) return <ListSkeleton />;
  if (error || !model) return <Banner tone="warning">{dataErrorMessage(error)}</Banner>;

  const view = buildDashboard(model);
  const currency = business.currency;
  const doubleCount = model.warnings.some((w) => w.code === 'LABOR_DOUBLE_COUNT_RISK');

  return (
    <>
      <PageHeader title="Resumen" />
      <div className="space-y-8">
        <RealMonth />

        <section className="space-y-5" aria-labelledby="estimacion">
          <div>
            <h2 id="estimacion" className="text-lg font-semibold">Tu estimación</h2>
            <p className="text-sm text-muted">Cómo debería venir un mes normal, según tus productos, precios y costos planificados.</p>
          </div>
          {view.hasProducts ? (
            <>
              <Metrics view={view} currency={currency} />
              {doubleCount && <Banner tone="warning">{GLOSSARY.laborDoubleCount}</Banner>}
              <Attention products={view.attention} currency={currency} />
              <Rankings view={view} currency={currency} />
              <ProfitGoal model={model} currency={currency} businessId={business.id} />
            </>
          ) : (
            <GettingStarted />
          )}
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

/** Lo que realmente pasó en el mes: movimientos registrados. */
function RealMonth() {
  const business = useCurrentBusiness();
  const [month, setMonth] = useState(currentMonth);
  const query = useQuery({ queryKey: queryKeys.movements(business.id, month), queryFn: () => listMovements(business.id, month) });
  const summary = query.data ? summarizeMovements(query.data.map(toMovement)) : null;
  const currency = business.currency;
  const empty = summary && summary.incomeCount + summary.expenseCount === 0;

  return (
    <section className="space-y-3" aria-labelledby="mes-real">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="mes-real" className="text-lg font-semibold">Tu mes real</h2>
          <p className="text-sm text-muted">La plata que entró y salió, según tus movimientos.</p>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <Banner tone="warning">{dataErrorMessage(query.error)}</Banner>
      ) : empty ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted">Todavía no registraste ingresos ni egresos este mes.</p>
          <Link to={`/movimientos?mes=${month}`} className="text-sm font-semibold text-brand-700">Registrar movimientos →</Link>
        </Card>
      ) : (
        summary && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card className="col-span-2 p-5 md:col-span-1">
                <p className="text-sm text-muted">Resultado del mes</p>
                <p className={cn('mt-1 text-3xl font-semibold tracking-tight tabular', summary.result.lt(0) ? 'text-negative' : 'text-healthy')}>
                  {formatMoney(summary.result, currency)}
                </p>
                <p className="mt-1 text-[12px] text-muted">Ingresos − egresos</p>
              </Card>
              <Metric label="Ingresos" value={formatMoney(summary.income, currency)} />
              <Metric label="Egresos" value={formatMoney(summary.expense, currency)} />
              <Metric
                label="Margen sobre ingresos"
                value={summary.marginOnIncome ? formatPercent(summary.marginOnIncome, 1) : '—'}
                hint="Qué parte de lo que entró te quedó después de los egresos."
              />
            </div>

            {summary.expenseByCategory.length > 0 && (
              <SectionCard title="En qué se fue la plata" subtitle="Principales categorías de gasto del mes.">
                <ul className="space-y-3 px-4 py-4">
                  {summary.expenseByCategory.slice(0, 5).map((c) => (
                    <li key={c.category}>
                      <div className="flex justify-between gap-3 text-sm">
                        <span>{categoryLabel(c.category)}</span>
                        <span className="font-medium tabular">
                          {formatMoney(c.amount, currency)} <span className="text-muted">· {formatPercent(c.share, 0)}</span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden>
                        <div className="h-full rounded-full bg-negative/70" style={{ width: `${c.share.times(100).toNumber()}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-line px-4 py-3">
                  <Link to={`/movimientos?mes=${month}`} className="text-sm font-semibold text-brand-700">Ver todos los movimientos →</Link>
                </div>
              </SectionCard>
            )}
          </>
        )
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function Metrics({ view, currency }: { view: DashboardView; currency: string }) {
  const profitTone = view.profit.lt(0) ? 'text-negative' : 'text-healthy';
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Card className="col-span-2 p-5 md:col-span-1">
        <p className="text-sm text-muted">Ganancia estimada del mes</p>
        <p className={cn('mt-1 text-3xl font-semibold tracking-tight tabular', profitTone)}>{formatMoney(view.profit, currency)}</p>
        <p className="mt-1 text-[13px] text-muted">Después de pagar todos los costos, incluidos los fijos.</p>
      </Card>
      <Metric label="Facturación mensual" value={formatMoney(view.revenue, currency)} />
      <Metric label="Margen promedio" value={view.averageMargin ? formatPercent(view.averageMargin, 1) : '—'} hint={GLOSSARY.margin} />
      <Metric label="Costos fijos (planificado)" value={formatMoney(view.fixedCosts, currency)} hint="Lo que cargaste en Costos. No son pagos reales." />
      <Card className="p-4">
        <p className="text-[13px] text-muted">Punto de equilibrio</p>
        {view.breakEven.ok ? (
          <>
            <p className="mt-0.5 text-lg font-semibold tabular">{formatMoney(view.breakEven.value.revenue, currency)}</p>
            <p className="text-[12px] text-muted">≈ {formatNumber(view.breakEven.value.units, 0)} unidades</p>
            <p className={cn('mt-1 text-[12px] font-medium', view.breakEven.value.cushion.gte(0) ? 'text-healthy' : 'text-negative')}>
              {view.breakEven.value.cushion.gte(0)
                ? `Lo superás por ${formatMoney(view.breakEven.value.cushion, currency)}`
                : `Te faltan ${formatMoney(view.breakEven.value.cushion.abs(), currency)}`}
            </p>
          </>
        ) : (
          <p className="mt-1 text-[13px] text-muted">{financeErrorMessage(view.breakEven.code)}</p>
        )}
      </Card>
      <p className="col-span-2 text-[12px] text-muted md:col-span-3">
        Punto de equilibrio: cuánto necesitás vender para cubrir todos tus costos. Estimación basada en tu mix de ventas actual.
      </p>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4" title={hint}>
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular">{value}</p>
    </Card>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-[13px] text-muted">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

function Attention({ products, currency }: { products: ProductEconomics[]; currency: string }) {
  if (products.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <CheckCircle2 className="size-5 text-healthy" aria-hidden />
        <p className="text-sm">Todos tus productos tienen un margen saludable.</p>
      </Card>
    );
  }
  return (
    <SectionCard title="Productos que necesitan atención">
      <ul className="divide-y divide-line">
        {products.map((p) => (
          <li key={p.productId}>
            <Link to={`/productos/${p.productId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <div className="mt-1"><MarginBadge product={p} /></div>
              </div>
              <div className="text-right">
                <p className={cn('font-semibold tabular', p.marginStatus === 'negative' ? 'text-negative' : 'text-low')}>
                  {p.margin ? formatPercent(p.margin, 1) : '—'}
                </p>
                {p.recommendedPrice.ok && p.priceGap?.gt(0) && (
                  <p className="text-[12px] text-muted">Sugerido {formatMoney(p.recommendedPrice.value.rounded, currency)}</p>
                )}
              </div>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function Rankings({ view, currency }: { view: DashboardView; currency: string }) {
  const [mode, setMode] = useState<'profit' | 'margin'>('profit');
  const list = mode === 'profit' ? view.byProfit : view.byMargin;
  if (view.byProfit.length === 0) return null;

  return (
    <SectionCard
      title="Productos más rentables"
      subtitle={
        view.marginLeaderDiffers
          ? 'Un producto con menos margen puede dejarte más plata si vende mucho más.'
          : 'Ordenados por lo que te dejan.'
      }
    >
      <div className="px-4 pt-3">
        <Segmented
          ariaLabel="Ordenar ranking"
          value={mode}
          onChange={setMode}
          options={[{ value: 'profit', label: 'Más ganancia' }, { value: 'margin', label: 'Mayor margen' }]}
        />
      </div>
      <ol className="space-y-1 px-2 py-3">
        {list.map((p, i) => {
          const share = view.maxMonthlyProfit.isZero() ? 0 : p.monthlyProfit!.abs().div(view.maxMonthlyProfit).times(100).toNumber();
          return (
            <li key={p.productId}>
              <Link to={`/productos/${p.productId}`} className="block rounded-xl px-2 py-2.5 hover:bg-canvas">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate font-medium">
                    <span className="mr-2 text-muted tabular">{i + 1}.</span>
                    {p.name}
                  </p>
                  <p className={cn('font-semibold tabular', mode === 'profit' && p.monthlyProfit!.lt(0) && 'text-negative')}>
                    {mode === 'profit' ? formatMoney(p.monthlyProfit, currency) : formatPercent(p.margin, 1)}
                  </p>
                </div>
                {mode === 'profit' && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden>
                    <div className={cn('h-full rounded-full', p.monthlyProfit!.lt(0) ? 'bg-negative' : 'bg-brand-500')} style={{ width: `${share}%` }} />
                  </div>
                )}
                <p className="mt-1 text-[12px] text-muted tabular">
                  {formatMoney(p.price, currency)} · costo {formatMoney(p.totalCostPerUnit, currency)} · ganás {formatMoney(p.profitPerUnit, currency)}/u ·{' '}
                  {mode === 'profit' ? `margen ${formatPercent(p.margin, 0)}` : `${formatMoney(p.monthlyProfit, currency)}/mes`} · {formatNumber(p.monthlyUnits, 0)} ventas
                </p>
              </Link>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}

const GOAL_KEY = (businessId: string) => `margen.profitGoal.${businessId}`;

function ProfitGoal({ model, currency, businessId }: { model: BusinessModel; currency: string; businessId: string }) {
  const [raw, setRaw] = useState(() => {
    try {
      return localStorage.getItem(GOAL_KEY(businessId)) ?? '';
    } catch {
      return '';
    }
  });
  const target = parseLocaleDecimal(raw);
  const goal = target && target.gte(0) ? buildProfitGoal(model, target) : null;

  const onChange = (value: string) => {
    setRaw(value);
    try {
      localStorage.setItem(GOAL_KEY(businessId), value);
    } catch {
      // Sin almacenamiento: el objetivo dura solo esta visita.
    }
  };

  return (
    <SectionCard title="Quiero ganar por mes…" subtitle="Te decimos cuánto tendrías que facturar con tu mix de ventas actual.">
      <div className="space-y-4 px-4 py-4">
        <AffixInput aria-label="Ganancia mensual objetivo" prefix="$" placeholder="3.000.000" value={raw} onChange={(e) => onChange(e.target.value)} />
        {raw && !goal && <p className="text-[13px] font-medium text-negative">Escribí un monto, por ejemplo 3.000.000.</p>}
        {goal && !goal.ok && <Banner tone="warning">{financeErrorMessage(goal.code)}</Banner>}
        {goal?.ok && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-[13px] text-muted">Facturás hoy</p>
                <p className="font-semibold tabular">{formatMoney(goal.currentRevenue, currency)}</p>
              </div>
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-[13px] text-brand-700">Necesitás facturar</p>
                <p className="font-semibold text-brand-900 tabular">{formatMoney(goal.requiredRevenue, currency)}</p>
              </div>
            </div>
            <p className="flex items-start gap-2 text-sm">
              <Target className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              {goal.reached ? (
                <span>Ya lo estás logrando: hoy ganás {formatMoney(goal.currentProfit, currency)} por mes.</span>
              ) : (
                <span>
                  Te faltan <strong className="tabular">{formatMoney(goal.gap, currency)}</strong> por mes (≈ {formatNumber(goal.units, 0)} unidades en total,
                  con el mismo mix). También podés acercarte subiendo precios: probalo en el Simulador.
                </span>
              )}
            </p>
          </>
        )}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

/** Negocio sin productos: primeros pasos en lugar de un tablero vacío. */
function GettingStarted() {
  const business = useCurrentBusiness();
  const ingredients = useQuery({ queryKey: queryKeys.ingredients(business.id), queryFn: () => listIngredients(business.id) });
  const { snapshot } = useBusinessModel();

  const steps = [
    { done: (ingredients.data?.length ?? 0) > 0, title: 'Cargá tus insumos', text: 'Lo que comprás: materia prima, cajas, etiquetas.', to: '/insumos' },
    {
      done: (snapshot?.fixedCosts.length ?? 0) > 0 || (snapshot?.laborRates.length ?? 0) > 0,
      title: 'Sumá tus costos',
      text: 'Alquiler, comisiones y cuánto vale una hora de trabajo.',
      to: '/costos',
    },
    { done: false, title: 'Armá tu primer producto', text: 'Qué lleva y cuántos vendés por mes.', to: '/productos' },
  ];

  return (
    <>
      <p className="mb-3 text-sm font-medium">En tres pasos vas a saber cuánto ganás con cada producto:</p>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Card>
              <Link to={s.to} className="flex items-center gap-3 p-4">
                {s.done ? <CheckCircle2 className="size-6 text-healthy" aria-label="Hecho" /> : <Circle className="size-6 text-line" aria-label="Pendiente" />}
                <div className="flex-1">
                  <p className={cn('font-medium', s.done && 'text-muted line-through')}>{i + 1}. {s.title}</p>
                  <p className="text-[13px] text-muted">{s.text}</p>
                </div>
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            </Card>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-muted">
        ¿Querés ver cómo queda con datos? Creá la Pastelería Demo desde <Link to="/configuracion" className="font-medium text-brand-700">Configuración</Link>.
      </p>
    </>
  );
}
