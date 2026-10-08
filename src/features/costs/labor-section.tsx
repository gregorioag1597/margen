import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { AffixInput, Field } from '@/components/ui/form';
import { Banner, Card, Skeleton } from '@/components/ui/surfaces';
import { dataErrorMessage, GLOSSARY } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { calculateLaborCost } from '@/domain/finance';
import { formatMoney } from '@/lib/format';
import { numberToInput, parseLocaleNumber } from '@/lib/number-input';
import { queryKeys } from '@/lib/query-keys';
import { listLaborRates, saveDefaultLaborRate } from './api';
import { laborFormSchema } from './schemas';

const EXAMPLE_MINUTES = [6, 12, 30, 60];

export function LaborSection() {
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const rates = useQuery({ queryKey: queryKeys.laborRates(business.id), queryFn: () => listLaborRates(business.id) });
  const current = rates.data?.find((r) => r.is_default) ?? rates.data?.[0] ?? null;

  const form = useForm({ resolver: zodResolver(laborFormSchema), defaultValues: { hourlyRate: '' } });
  useEffect(() => {
    if (current) form.reset({ hourlyRate: numberToInput(current.hourly_rate) });
  }, [current, form]);

  const hourlyRate = useWatch({ control: form.control, name: 'hourlyRate' });
  const parsedRate = parseLocaleNumber(hourlyRate);

  const save = useMutation({
    mutationFn: (rate: string) => saveDefaultLaborRate(business.id, current?.id ?? null, rate),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: queryKeys.laborRates(business.id) });
    },
    onError: (e) => setServerError(dataErrorMessage(e)),
  });

  if (rates.isPending) return <Skeleton className="h-64" />;
  if (rates.isError) return <Banner tone="warning">{dataErrorMessage(rates.error)}</Banner>;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((v) => { setServerError(null); setSaved(false); save.mutate(parseLocaleNumber(v.hourlyRate)!); })}
        >
          {serverError && <Banner tone="warning">{serverError}</Banner>}
          <Field label="¿Cuánto vale una hora de trabajo?" hint={GLOSSARY.labor} error={form.formState.errors.hourlyRate?.message}>
            {(id, d) => (
              <AffixInput
                id={id}
                aria-describedby={d}
                prefix="$"
                suffix="/ hora"
                placeholder="6.000"
                aria-invalid={!!form.formState.errors.hourlyRate}
                {...form.register('hourlyRate', { onChange: () => setSaved(false) })}
              />
            )}
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" loading={save.isPending}>{current ? 'Guardar cambios' : 'Guardar tarifa'}</Button>
            {saved && <span className="text-sm font-medium text-healthy" role="status">Guardado ✓</span>}
          </div>
        </form>
      </Card>

      {parsedRate && (
        <Card className="p-5">
          <p className="mb-3 text-sm font-medium">Así se calcula en tus productos</p>
          <ul className="grid grid-cols-2 gap-2">
            {EXAMPLE_MINUTES.map((min) => {
              const cost = calculateLaborCost(parsedRate, min, 'min');
              return (
                <li key={min} className="rounded-xl bg-canvas px-3 py-2.5">
                  <p className="text-[13px] text-muted">{min} minutos</p>
                  <p className="font-semibold tabular">{cost.ok ? formatMoney(cost.value, business.currency) : '—'}</p>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[13px] text-muted">Cuando armes un producto vas a indicar cuántos minutos lleva hacerlo.</p>
        </Card>
      )}
    </div>
  );
}
