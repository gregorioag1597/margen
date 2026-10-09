import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, Clock, Package, Pencil, Plus, Receipt, Wheat } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { AffixInput, Segmented } from '@/components/ui/form';
import { Badge, Banner, Card, ListSkeleton } from '@/components/ui/surfaces';
import { dataErrorMessage, financeErrorMessage, GLOSSARY, PRODUCT_WARNINGS } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { useBusinessModel } from '@/features/business/use-business-model';
import { listIngredients } from '@/features/ingredients/api';
import { listLaborRates } from '@/features/costs/api';
import { dec, TARGET_MARGIN_PRESETS, type Dec, type ProductEconomics } from '@/domain/finance';
import { formatDate, formatMoney, formatNumber, formatPercent, UNIT_LABELS } from '@/lib/format';
import { fractionToPercentInput } from '@/lib/number-input';
import { invalidateBusinessData, queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { listProductPriceHistory, updateProduct } from './api';
import { ComponentSheet } from './component-sheet';
import { MarginBadge } from './margin-badge';
import { ProductInfoSheet } from './product-info-sheet';
import { buildCostBreakdown, recommendForMargin } from './product-view';
import { customMarginSchema, customMarginToFraction, type ComponentRow } from './schemas';

export function ProductDetailPage() {
  const { productId } = useParams();
  const business = useCurrentBusiness();
  const { model, snapshot, productRows, isPending, error } = useBusinessModel();
  const ingredients = useQuery({ queryKey: queryKeys.ingredients(business.id), queryFn: () => listIngredients(business.id) });
  const laborRates = useQuery({ queryKey: queryKeys.laborRates(business.id), queryFn: () => listLaborRates(business.id) });
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ComponentRow | 'new' | null>(null);

  if (isPending) return <ListSkeleton />;
  if (error || !model || !snapshot) return <Banner tone="warning">{dataErrorMessage(error)}</Banner>;

  const row = productRows.find((p) => p.id === productId);
  if (!row) {
    return (
      <Banner tone="warning">
        No encontramos este producto. <Link to="/productos" className="font-medium underline">Volver a productos</Link>
      </Banner>
    );
  }
  const econ = model.products.find((p) => p.productId === productId) ?? null;
  const laborRateId = laborRates.data?.find((r) => r.is_default)?.id ?? laborRates.data?.[0]?.id ?? null;
  const currency = business.currency;
  const sortedComponents = [...row.product_components].sort((a, b) => a.position - b.position);
  const byBatch = Number(row.batch_yield) !== 1;

  return (
    <>
      <Link to="/productos" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Productos
      </Link>

      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{row.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {econ && <MarginBadge product={econ} />}
            {row.category && <Badge>{row.category}</Badge>}
            {row.archived_at && <Badge>Archivado</Badge>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditingInfo(true)}><Pencil /> Editar</Button>
      </header>

      {!econ ? (
        <Banner>Este producto está archivado y no entra en los cálculos. Podés restaurarlo desde "Editar".</Banner>
      ) : (
        <div className="space-y-5">
          <Summary econ={econ} currency={currency} />
          <Warnings econ={econ} />

          <Section
            title={byBatch ? `Qué lleva (tanda de ${formatNumber(row.batch_yield)} u.)` : 'Qué lleva'}
            action={<Button variant="secondary" size="sm" onClick={() => setEditingComponent('new')}><Plus /> Agregar</Button>}
            footnote={
              byBatch && econ.directCost
                ? `Toda la tanda cuesta ${formatMoney(econ.directCost.batchTotal, currency)} → ${formatMoney(econ.directCost.total, currency)} por unidad. Al lado de cada ingrediente ves lo que le suma a cada unidad.`
                : undefined
            }
          >
            {sortedComponents.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted">
                {byBatch
                  ? 'Agregá lo que lleva toda la tanda: insumos, minutos de trabajo y, por unidad, el packaging.'
                  : 'Agregá los insumos, el packaging y los minutos de trabajo que lleva una unidad.'}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {sortedComponents.map((c) => (
                  <ComponentLine
                    key={c.id}
                    component={c}
                    cost={econ.directCost?.lines.find((l) => l.componentId === c.id)?.cost ?? null}
                    ingredientName={ingredients.data?.find((i) => i.id === c.ingredient_id)?.name}
                    currency={currency}
                    showBasis={byBatch}
                    onClick={() => setEditingComponent(c)}
                  />
                ))}
              </ul>
            )}
          </Section>

          <Breakdown econ={econ} currency={currency} />
          <PriceRecommendation econ={econ} productId={row.id} currency={currency} roundingStep={model.settings.roundingStep} />
          <PriceHistory productId={row.id} currency={currency} />
        </div>
      )}

      {editingInfo && <ProductInfoSheet product={row} open onClose={() => setEditingInfo(false)} />}
      {editingComponent && (
        <ComponentSheet
          productId={row.id}
          component={editingComponent === 'new' ? null : editingComponent}
          nextPosition={Math.max(0, ...row.product_components.map((c) => c.position)) + 1}
          ingredients={ingredients.data ?? []}
          laborRateId={laborRateId}
          snapshot={snapshot}
          batchYield={row.batch_yield}
          open
          onClose={() => setEditingComponent(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function Section({ title, action, children, footnote }: { title: string; action?: ReactNode; children: ReactNode; footnote?: ReactNode }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
      {footnote && <p className="border-t border-line px-4 py-3 text-[13px] leading-snug text-muted">{footnote}</p>}
    </Card>
  );
}

function Summary({ econ, currency }: { econ: ProductEconomics; currency: string }) {
  const tone =
    econ.marginStatus === 'negative' ? 'text-negative' : econ.marginStatus === 'low' ? 'text-low' : econ.marginStatus === 'healthy' ? 'text-healthy' : '';
  return (
    <Card className="p-5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Stat label="Precio de venta" value={econ.price ? formatMoney(econ.price, currency) : 'Sin precio'} />
        <Stat label="Cuánto te cuesta" value={formatMoney(econ.totalCostPerUnit ?? econ.directCost?.total, currency)} />
        <Stat label="Cuánto ganás por unidad" value={formatMoney(econ.profitPerUnit, currency)} className={econ.profitPerUnit?.lt(0) ? 'text-negative' : ''} />
        <Stat label="Margen" value={econ.margin ? formatPercent(econ.margin, 1) : '—'} className={tone} />
      </div>
      {econ.monthlyProfit && econ.monthlyUnits.gt(0) && (
        <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
          Con {formatNumber(econ.monthlyUnits, 0)} ventas por mes:{' '}
          <span className={cn('font-semibold', econ.monthlyProfit.lt(0) ? 'text-negative' : 'text-ink')}>{formatMoney(econ.monthlyProfit, currency)}</span> de ganancia.
        </p>
      )}
      <p className="mt-3 text-[12px] leading-snug text-muted">{GLOSSARY.margin}</p>
    </Card>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-[13px] text-muted">{label}</p>
      <p className={cn('mt-0.5 text-xl font-semibold tracking-tight tabular', className)}>{value}</p>
    </div>
  );
}

function Warnings({ econ }: { econ: ProductEconomics }) {
  const messages = econ.warnings.map((w) => PRODUCT_WARNINGS[w.code]).filter((m): m is string => Boolean(m));
  if (econ.error) messages.unshift(`No pudimos calcular el costo: ${financeErrorMessage(econ.error.code)}`);
  if (messages.length === 0) return null;
  return (
    <div className="space-y-2">
      {messages.map((m) => <Banner key={m} tone="warning">{m}</Banner>)}
    </div>
  );
}

const KIND_ICON = { ingredient: Wheat, packaging: Package, labor: Clock, other: Receipt };

function ComponentLine({ component: c, cost, ingredientName, currency, showBasis, onClick }: {
  component: ComponentRow;
  cost: Dec | null;
  ingredientName?: string;
  currency: string;
  showBasis: boolean;
  onClick: () => void;
}) {
  const Icon = KIND_ICON[c.kind];
  const name = c.kind === 'labor' ? 'Mano de obra' : c.kind === 'other' ? c.label ?? 'Otro' : ingredientName ?? 'Insumo';
  const amount = c.quantity && c.unit ? `${formatNumber(c.quantity, 4)} ${UNIT_LABELS[c.unit].short}` : formatMoney(c.fixed_amount, currency);
  const qty = showBasis ? `${amount} ${c.basis === 'unit' ? 'por unidad' : 'en la tanda'}` : c.quantity ? amount : 'monto fijo';
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas">
        <Icon className="size-4 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px]">{name}</p>
          <p className="text-[13px] text-muted">{qty}</p>
        </div>
        <p className="font-medium tabular">{formatMoney(cost, currency)}</p>
        <ChevronRight className="size-4 text-muted" aria-hidden />
      </button>
    </li>
  );
}

function Breakdown({ econ, currency }: { econ: ProductEconomics; currency: string }) {
  const b = buildCostBreakdown(econ);
  const Row = ({ label, value, strong, muted }: { label: ReactNode; value: string; strong?: boolean; muted?: boolean }) => (
    <div className={cn('flex justify-between gap-3 py-1.5 text-sm', strong && 'font-semibold', muted && 'text-muted')}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );

  return (
    <Section title="De dónde sale el costo" footnote={GLOSSARY.fixedAllocation}>
      <div className="space-y-4 px-4 py-4">
        <div>
          <p className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Costos directos</p>
          {b.directLines.map((l) => <Row key={l.label} label={l.label} value={formatMoney(l.amount, currency)} muted />)}
          <Row label="Subtotal" value={formatMoney(b.directTotal, currency)} strong />
        </div>

        <div>
          <p className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Costos de venta</p>
          {b.saleLines.length === 0 ? (
            <p className="py-1.5 text-sm text-muted">Ninguno aplica a este producto.</p>
          ) : (
            b.saleLines.map((l) => (
              <Row
                key={l.label}
                label={<>{l.label} {l.percent.gt(0) && <span className="text-[12px]">({formatPercent(l.percent)})</span>}</>}
                value={econ.price || l.percent.isZero() ? formatMoney(l.amount, currency) : formatPercent(l.percent)}
                muted
              />
            ))
          )}
          {b.saleTotal && <Row label="Subtotal" value={formatMoney(b.saleTotal, currency)} strong />}
        </div>

        <div>
          <p className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Costos fijos asignados</p>
          <Row label={<>Tu parte de los costos fijos <Badge>estimado</Badge></>} value={b.fixedPerUnit ? formatMoney(b.fixedPerUnit, currency) : 'Sin datos'} strong />
        </div>

        {b.totalCost && (
          <div className="border-t border-line pt-3">
            <Row label="Costo total estimado" value={formatMoney(b.totalCost, currency)} strong />
            {econ.price && <Row label="Precio de venta" value={formatMoney(econ.price, currency)} muted />}
            {econ.profitPerUnit && <Row label="Cuánto ganás por unidad" value={formatMoney(econ.profitPerUnit, currency)} strong />}
          </div>
        )}
      </div>
    </Section>
  );
}

function PriceRecommendation({ econ, productId, currency, roundingStep }: { econ: ProductEconomics; productId: string; currency: string; roundingStep: Dec }) {
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const presetValues = TARGET_MARGIN_PRESETS.map((p) => p.toString());
  const current = econ.targetMargin.toString();
  const [mode, setMode] = useState(presetValues.includes(current) ? current : 'custom');
  const [custom, setCustom] = useState(presetValues.includes(current) ? '' : fractionToPercentInput(current));
  const [customError, setCustomError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refresh = () => invalidateBusinessData(queryClient, business.id);
  const saveTarget = useMutation({
    mutationFn: (fraction: string) => updateProduct(productId, { target_margin: fraction }),
    onSuccess: refresh,
    onError: (e) => setSaveError(dataErrorMessage(e)),
  });
  const applyPrice = useMutation({
    mutationFn: (price: string) => updateProduct(productId, { price }),
    onSuccess: async () => { await refresh(); await queryClient.invalidateQueries({ queryKey: queryKeys.productHistory(productId) }); },
    onError: (e) => setSaveError(dataErrorMessage(e)),
  });

  const rec = recommendForMargin(econ, econ.targetMargin, roundingStep);

  const onPreset = (value: string) => {
    setMode(value);
    setCustomError(null);
    if (value !== 'custom') saveTarget.mutate(value);
  };
  const onCustomSave = () => {
    const parsed = customMarginSchema.safeParse(custom);
    if (!parsed.success) return setCustomError(parsed.error.issues[0]!.message);
    setCustomError(null);
    saveTarget.mutate(customMarginToFraction(custom)!);
  };

  return (
    <Section title="Precio recomendado" footnote={GLOSSARY.markupVsMargin}>
      <div className="space-y-4 px-4 py-4">
        {saveError && <Banner tone="warning">{saveError}</Banner>}
        <div>
          <p className="mb-2 text-sm font-medium">¿Qué margen querés ganar?</p>
          <Segmented
            ariaLabel="Margen objetivo"
            value={mode}
            onChange={onPreset}
            options={[...TARGET_MARGIN_PRESETS.map((p) => ({ value: p.toString(), label: formatPercent(p, 0) })), { value: 'custom', label: 'Otro' }]}
          />
          {mode === 'custom' && (
            <div className="mt-3 flex items-start gap-2">
              <div className="flex-1">
                <AffixInput aria-label="Margen objetivo personalizado" suffix="%" placeholder="35" value={custom} onChange={(e) => setCustom(e.target.value)} aria-invalid={!!customError} />
                {customError && <p role="alert" className="mt-1 text-[13px] font-medium text-negative">{customError}</p>}
              </div>
              <Button variant="secondary" size="lg" loading={saveTarget.isPending} onClick={onCustomSave}>Aplicar</Button>
            </div>
          )}
        </div>

        {rec.ok ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-[13px] text-muted">Precio actual</p>
                <p className="text-lg font-semibold tabular">{econ.price ? formatMoney(econ.price, currency) : '—'}</p>
                <p className="text-[13px] text-muted">Margen {econ.margin ? formatPercent(econ.margin, 1) : '—'}</p>
              </div>
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-[13px] text-brand-700">Recomendado</p>
                <p className="text-lg font-semibold text-brand-900 tabular">{formatMoney(rec.recommended, currency)}</p>
                <p className="text-[13px] text-brand-700">Margen {rec.marginAtRecommended ? formatPercent(rec.marginAtRecommended, 1) : '—'}</p>
              </div>
            </div>
            {rec.difference && !rec.difference.isZero() && (
              <p className="text-sm">
                Diferencia:{' '}
                <span className={cn('font-semibold tabular', rec.difference.gt(0) ? 'text-low' : 'text-healthy')}>
                  {rec.difference.gt(0) ? '+' : ''}{formatMoney(rec.difference, currency)}
                </span>{' '}
                ({rec.difference.gt(0) ? 'deberías subir el precio' : 'tenés margen de sobra'})
              </p>
            )}
            {(!econ.price || !rec.recommended.eq(econ.price)) && (
              <Button
                block
                size="lg"
                loading={applyPrice.isPending}
                onClick={() => {
                  if (window.confirm(`¿Cambiar el precio de venta a ${formatMoney(rec.recommended, currency)}? El precio anterior queda en el historial.`)) {
                    applyPrice.mutate(rec.recommended.toString());
                  }
                }}
              >
                Usar {formatMoney(rec.recommended, currency)}
              </Button>
            )}
            <p className="text-[12px] text-muted">{GLOSSARY.recommendedPrice} Redondeado hacia arriba (cálculo exacto: {formatMoney(rec.exact, currency)}).</p>
          </>
        ) : (
          <Banner tone="warning">
            {financeErrorMessage(rec.code)}
            {rec.maxAchievableMargin && ` El margen máximo posible es ${formatPercent(dec(rec.maxAchievableMargin), 1)}.`}
          </Banner>
        )}
      </div>
    </Section>
  );
}

function PriceHistory({ productId, currency }: { productId: string; currency: string }) {
  const history = useQuery({ queryKey: queryKeys.productHistory(productId), queryFn: () => listProductPriceHistory(productId) });
  if (!history.data || history.data.length < 2) return null;
  return (
    <Section title="Historial de precio de venta">
      <ol className="divide-y divide-line">
        {history.data.map((h) => (
          <li key={h.id} className="flex justify-between px-4 py-2.5 text-sm">
            <span className="text-muted">{formatDate(h.effective_at)}</span>
            <span className="font-medium tabular">{formatMoney(h.price, currency)}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}
