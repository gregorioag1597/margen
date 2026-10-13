import { useQuery } from '@tanstack/react-query';
import { Table2, BarChart3 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Segmented } from '@/components/ui/form';
import { Banner, Card, Skeleton } from '@/components/ui/surfaces';
import { dataErrorMessage } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { listMovementsForMonths, toMovement } from '@/features/movements/api';
import { buildMonthlySeries, currentMonth, lastMonths, type MonthlySeries } from '@/domain/finance';
import { formatMoney, formatPercent } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

/**
 * Paleta validada (dataviz/validate_palette.js, modo claro): ingresos verde marca,
 * egresos azul. Pasa CVD (ΔE 17,8) y visión normal (ΔE 20,7). El resultado es una
 * línea en tinta neutra sobre el MISMO eje en pesos (nunca un segundo eje).
 */
const COLORS = { income: '#1f8a6d', expense: '#5b6fd6', result: '#17201d', grid: '#e3e8e6', axis: '#5f6b67', surface: '#ffffff' } as const;

const monthDate = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1);
};
const monthShort = (month: string) => new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(monthDate(month)).replace('.', '');
const monthLong = (month: string) => new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(monthDate(month));
const monthName = (month: string) => new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(monthDate(month));

/** $1.846.000 → "$ 1,8 M" para los ejes (los valores exactos van en el tooltip y la tabla). */
const compactMoney = (value: number, currency: string) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value);

export default function MonthlyCharts() {
  const business = useCurrentBusiness();
  const [count, setCount] = useState<'6' | '12'>('6');
  const [asTable, setAsTable] = useState(false);
  const end = currentMonth();
  const months = lastMonths(end, Number(count));
  const from = months[0]!;

  const query = useQuery({
    queryKey: queryKeys.movementsSeries(business.id, from, end),
    queryFn: () => listMovementsForMonths(business.id, from, end),
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 className="font-semibold">Mes a mes</h3>
          <p className="text-[13px] text-muted">Según tus movimientos reales de este negocio.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Segmented<'6' | '12'>
              ariaLabel="Período"
              value={count}
              onChange={setCount}
              options={[{ value: '6', label: '6 meses' }, { value: '12', label: '12 meses' }]}
            />
          </div>
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-muted hover:text-ink"
          >
            {asTable ? <><BarChart3 className="size-4" /> Gráficos</> : <><Table2 className="size-4" /> Tabla</>}
          </button>
        </div>
      </div>

      <div className="px-2 py-4 sm:px-4">
        {query.isPending ? (
          <Skeleton className="mx-2 h-64" />
        ) : query.isError ? (
          <div className="px-2"><Banner tone="warning">{dataErrorMessage(query.error)}</Banner></div>
        ) : (
          <SeriesView series={buildMonthlySeries(query.data.map(toMovement), months)} currency={business.currency} asTable={asTable} />
        )}
      </div>
    </Card>
  );
}

function SeriesView({ series, currency, asTable }: { series: MonthlySeries; currency: string; asTable: boolean }) {
  if (!series.hasData) {
    return <p className="px-2 py-6 text-center text-sm text-muted">Todavía no hay movimientos en este período. Registralos en Movimientos y acá vas a ver cómo vienen tus meses.</p>;
  }

  const data = series.points.map((p) => ({
    month: p.month,
    label: monthShort(p.month),
    income: p.income.toNumber(),
    expense: p.expense.toNumber(),
    result: p.result.toNumber(),
  }));
  const hasLoss = data.some((d) => d.result < 0);
  const last = series.points[series.points.length - 1]!;
  const money = (n: Parameters<typeof formatMoney>[0]) => formatMoney(n, currency);

  const summary =
    `En los últimos ${series.points.length} meses ingresaste ${money(series.totalIncome)} y gastaste ${money(series.totalExpense)}: ` +
    `resultado ${money(series.totalResult)}.` +
    (series.bestMonth ? ` Tu mejor mes fue ${monthName(series.bestMonth.month)} (${money(series.bestMonth.result)}).` : '') +
    (series.worstMonth && series.worstMonth.result.lt(0) ? ` En ${monthName(series.worstMonth.month)} gastaste más de lo que entró.` : '');

  const incomeTrend =
    last.incomeChange === null
      ? `${capitalize(monthName(last.month))}: ${money(last.income)} de ingresos.`
      : `${capitalize(monthName(last.month))}: ${money(last.income)} de ingresos (${last.incomeChange.gte(0) ? '+' : ''}${formatPercent(last.incomeChange, 0)} vs. ${monthName(series.points[series.points.length - 2]!.month)}).`;

  if (asTable) return <SeriesTable series={series} currency={currency} />;

  return (
    <div className="space-y-6">
      <section aria-labelledby="chart-ingresos-egresos">
        <h4 id="chart-ingresos-egresos" className="px-2 text-sm font-semibold">Ingresos y egresos por mes</h4>
        <Legend
          items={[
            { label: 'Ingresos', swatch: <span className="size-2.5 rounded-sm" style={{ background: COLORS.income }} /> },
            { label: 'Egresos', swatch: <span className="size-2.5 rounded-sm" style={{ background: COLORS.expense }} /> },
            { label: 'Resultado', swatch: <span className="h-0.5 w-4 rounded-full" style={{ background: COLORS.result }} /> },
          ]}
        />
        <div role="img" aria-label={summary} className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke={COLORS.grid} strokeWidth={1} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: COLORS.grid }} tick={{ fill: COLORS.axis, fontSize: 12 }} interval={0} />
              <YAxis
                width={64}
                tickLine={false}
                axisLine={false}
                tick={{ fill: COLORS.axis, fontSize: 12 }}
                tickFormatter={(v: number) => compactMoney(v, currency)}
              />
              {hasLoss && <ReferenceLine y={0} stroke="#c9d1ce" strokeWidth={1} />}
              <Tooltip content={(props) => <ChartTooltip active={props.active} payload={props.payload} currency={currency} />} cursor={{ fill: 'rgba(23,32,29,0.04)' }} />
              <Bar dataKey="income" name="Ingresos" fill={COLORS.income} maxBarSize={20} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Egresos" fill={COLORS.expense} maxBarSize={20} radius={[4, 4, 0, 0]} />
              <Line
                dataKey="result"
                name="Resultado"
                type="linear"
                stroke={COLORS.result}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ r: 4, fill: COLORS.result, stroke: COLORS.surface, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: COLORS.result, stroke: COLORS.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="px-2 pt-2 text-[13px] leading-snug text-muted">{summary}</p>
      </section>

      <section aria-labelledby="chart-ingresos">
        <h4 id="chart-ingresos" className="px-2 text-sm font-semibold">Cómo vienen tus ingresos</h4>
        <div role="img" aria-label={incomeTrend} className="mt-2 h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke={COLORS.grid} strokeWidth={1} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: COLORS.grid }} tick={{ fill: COLORS.axis, fontSize: 12 }} interval={0} />
              <YAxis width={64} tickLine={false} axisLine={false} tick={{ fill: COLORS.axis, fontSize: 12 }} tickFormatter={(v: number) => compactMoney(v, currency)} />
              <Tooltip content={(props) => <ChartTooltip active={props.active} payload={props.payload} currency={currency} only="income" />} cursor={{ fill: 'rgba(23,32,29,0.04)' }} />
              <Bar dataKey="income" name="Ingresos" fill={COLORS.income} maxBarSize={24} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="px-2 pt-2 text-[13px] leading-snug text-muted">{incomeTrend}</p>
      </section>
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Legend({ items }: { items: { label: string; swatch: ReactNode }[] }) {
  return (
    <ul className="mt-1 mb-2 flex flex-wrap gap-x-4 gap-y-1 px-2" aria-label="Referencias">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[13px] text-muted">
          {i.swatch}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

type Row = { month: string; income: number; expense: number; result: number };

function ChartTooltip({ active, payload, currency, only }: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  currency: string;
  only?: 'income';
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload as Row;
  const lines = only === 'income'
    ? [{ label: 'Ingresos', value: row.income, color: COLORS.income }]
    : [
        { label: 'Ingresos', value: row.income, color: COLORS.income },
        { label: 'Egresos', value: row.expense, color: COLORS.expense },
        { label: 'Resultado', value: row.result, color: COLORS.result },
      ];
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] shadow-sm">
      <p className="mb-1 font-semibold first-letter:uppercase">{monthLong(row.month)}</p>
      {lines.map((l) => (
        <p key={l.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-full" style={{ background: l.color }} />
            {l.label}
          </span>
          <span className={cn('font-medium tabular', l.label === 'Resultado' && l.value < 0 && 'text-negative')}>{formatMoney(l.value, currency)}</span>
        </p>
      ))}
    </div>
  );
}

/** Los mismos datos en tabla (accesible y para quien prefiere números). */
function SeriesTable({ series, currency }: { series: MonthlySeries; currency: string }) {
  return (
    <div className="overflow-x-auto px-2">
      <table className="w-full text-sm tabular">
        <caption className="sr-only">Ingresos, egresos y resultado por mes</caption>
        <thead>
          <tr className="border-b border-line text-left text-[12px] text-muted">
            <th scope="col" className="py-2 pr-2 font-medium">Mes</th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">Ingresos</th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">Egresos</th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">Resultado</th>
            <th scope="col" className="py-2 text-right font-medium">Ingresos vs. mes ant.</th>
          </tr>
        </thead>
        <tbody>
          {series.points.map((p) => (
            <tr key={p.month} className="border-b border-line/60">
              <th scope="row" className="py-2 pr-2 text-left font-medium first-letter:uppercase">{monthName(p.month)}</th>
              <td className="py-2 pr-2 text-right">{formatMoney(p.income, currency)}</td>
              <td className="py-2 pr-2 text-right">{formatMoney(p.expense, currency)}</td>
              <td className={cn('py-2 pr-2 text-right font-medium', p.result.lt(0) && 'text-negative')}>{formatMoney(p.result, currency)}</td>
              <td className="py-2 text-right text-muted">{p.incomeChange ? `${p.incomeChange.gte(0) ? '+' : ''}${formatPercent(p.incomeChange, 0)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <th scope="row" className="py-2 pr-2 text-left">Total</th>
            <td className="py-2 pr-2 text-right">{formatMoney(series.totalIncome, currency)}</td>
            <td className="py-2 pr-2 text-right">{formatMoney(series.totalExpense, currency)}</td>
            <td className={cn('py-2 pr-2 text-right', series.totalResult.lt(0) && 'text-negative')}>{formatMoney(series.totalResult, currency)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
