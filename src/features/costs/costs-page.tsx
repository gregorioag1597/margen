import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { Segmented } from '@/components/ui/form';
import { Banner, PageHeader } from '@/components/ui/surfaces';
import { GLOSSARY } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { dec } from '@/domain/finance';
import { queryKeys } from '@/lib/query-keys';
import { countLaborComponents, listFixedCosts } from './api';
import { FixedCostsSection } from './fixed-costs-section';
import { LaborSection } from './labor-section';
import { VariableCostsSection } from './variable-costs-section';

type Tab = 'fijos' | 'venta' | 'mano-de-obra';
const TABS: { value: Tab; label: string }[] = [
  { value: 'fijos', label: 'Fijos' },
  { value: 'venta', label: 'De venta' },
  { value: 'mano-de-obra', label: 'Mano de obra' },
];

export function CostsPage() {
  const business = useCurrentBusiness();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'fijos') as Tab;

  // Aviso de doble conteo: sueldos en fijos + mano de obra en productos.
  const fixed = useQuery({ queryKey: queryKeys.fixedCosts(business.id), queryFn: () => listFixedCosts(business.id) });
  const laborUsage = useQuery({ queryKey: queryKeys.laborUsage(business.id), queryFn: () => countLaborComponents(business.id) });
  const hasSalaries = (fixed.data ?? []).some((f) => f.is_active && f.category === 'salaries' && dec(f.monthly_amount).gt(0));
  const showDoubleCount = hasSalaries && (laborUsage.data ?? 0) > 0;

  return (
    <>
      <PageHeader title="Costos" description="Lo que pagás para que el negocio funcione y para vender." />
      <div className="mb-5">
        <Segmented ariaLabel="Tipo de costo" value={tab} options={TABS} onChange={(v) => setParams({ tab: v }, { replace: true })} />
      </div>
      {showDoubleCount && (
        <div className="mb-4">
          <Banner tone="warning">{GLOSSARY.laborDoubleCount}</Banner>
        </div>
      )}
      {tab === 'fijos' && <FixedCostsSection />}
      {tab === 'venta' && <VariableCostsSection />}
      {tab === 'mano-de-obra' && <LaborSection />}
    </>
  );
}
