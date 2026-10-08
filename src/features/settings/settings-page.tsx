import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, FlaskConical, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input, Segmented, Select } from '@/components/ui/form';
import { Badge, Banner, Card, PageHeader } from '@/components/ui/surfaces';
import { dataErrorMessage, GLOSSARY } from '@/copy/messages';
import { signOut } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-provider';
import { createDemoBusiness, updateBusiness } from '@/features/business/api';
import { useBusinesses, useCurrentBusiness } from '@/features/business/business-provider';
import { BUSINESS_TYPES, CURRENCIES, type BusinessType } from '@/features/business/constants';
import { exitDemoMode, isDemoMode } from '@/lib/demo-mode';

const schema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre.').max(120),
  businessType: z.enum(BUSINESS_TYPES.map((t) => t.value) as [BusinessType, ...BusinessType[]]),
  currency: z.string().length(3),
  pricesIncludeTaxes: z.enum(['yes', 'no', 'unknown']),
});
type Values = z.infer<typeof schema>;

const taxToForm = (v: boolean | null): Values['pricesIncludeTaxes'] => (v === null ? 'unknown' : v ? 'yes' : 'no');
const taxFromForm = (v: Values['pricesIncludeTaxes']) => (v === 'unknown' ? null : v === 'yes');

export function SettingsPage() {
  return isDemoMode() ? <DemoSettings /> : <AccountSettings />;
}

function DemoSettings() {
  return (
    <>
      <PageHeader title="Configuración" />
      <Card className="space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-semibold"><FlaskConical className="size-5 text-brand-600" /> Estás usando la demo</h2>
        <p className="text-sm text-muted">
          Todo lo que cambies acá queda solo en esta pestaña y se borra al cerrarla. Para cargar tu negocio real, creá una cuenta gratis.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => exitDemoMode('/registro')}>Crear mi cuenta</Button>
          <Button variant="outline" onClick={() => exitDemoMode('/ingresar')}><LogOut /> Salir de la demo</Button>
        </div>
      </Card>
    </>
  );
}

function AccountSettings() {
  const business = useCurrentBusiness();
  const { businesses, setCurrentId } = useBusinesses();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: business.name,
      businessType: business.business_type,
      currency: business.currency,
      pricesIncludeTaxes: taxToForm(business.prices_include_taxes),
    },
  });
  const errors = form.formState.errors;

  const save = useMutation({
    mutationFn: (v: Values) =>
      updateBusiness(business.id, {
        name: v.name,
        business_type: v.businessType,
        currency: v.currency,
        prices_include_taxes: taxFromForm(v.pricesIncludeTaxes),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['businesses'] });
      setMessage({ tone: 'info', text: 'Cambios guardados.' });
    },
    onError: (e) => setMessage({ tone: 'warning', text: dataErrorMessage(e) }),
  });

  const demo = useMutation({
    mutationFn: createDemoBusiness,
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['businesses'] });
      setCurrentId(id);
      navigate('/insumos');
    },
    onError: (e) => setMessage({ tone: 'warning', text: dataErrorMessage(e) }),
  });

  const logout = async () => {
    await signOut();
    queryClient.clear();
    navigate('/ingresar', { replace: true });
  };

  return (
    <>
      <PageHeader title="Configuración" />

      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Tu negocio</h2>
          <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => { setMessage(null); save.mutate(v); })}>
            {message && <Banner tone={message.tone}>{message.text}</Banner>}
            <Field label="Nombre" error={errors.name?.message}>
              {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors.name} {...form.register('name')} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo de negocio">
                {(id) => (
                  <Select id={id} {...form.register('businessType')}>
                    {BUSINESS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Moneda principal">
                {(id) => (
                  <Select id={id} {...form.register('currency')}>
                    {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </Select>
                )}
              </Field>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">¿Tus precios incluyen impuestos?</p>
              <Controller
                control={form.control}
                name="pricesIncludeTaxes"
                render={({ field }) => (
                  <Segmented
                    ariaLabel="¿Tus precios incluyen impuestos?"
                    value={field.value}
                    onChange={field.onChange}
                    options={[{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'No sé' }]}
                  />
                )}
              />
              <p className="text-[13px] text-muted">{GLOSSARY.pricesIncludeTaxes}</p>
            </div>
            <Button type="submit" loading={save.isPending}>Guardar cambios</Button>
          </form>
        </Card>

        {businesses.length > 1 && (
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Tus negocios</h2>
            <ul className="divide-y divide-line">
              {businesses.map((b) => (
                <li key={b.id}>
                  <button type="button" onClick={() => setCurrentId(b.id)} className="flex w-full items-center justify-between gap-3 py-3 text-left">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{b.name}</span>
                      {b.is_demo && <Badge tone="low">Datos de prueba</Badge>}
                    </span>
                    {b.id === business.id && <Check className="size-5 text-brand-600" aria-label="Activo" />}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {!businesses.some((b) => b.is_demo) && (
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><FlaskConical className="size-5 text-brand-600" /> Probar con datos de ejemplo</h2>
            <p className="mt-1 text-sm text-muted">
              Creamos una "Pastelería Demo" aparte, con insumos, costos y productos cargados. Tus datos reales no se tocan.
            </p>
            <Button variant="secondary" className="mt-4" loading={demo.isPending} onClick={() => demo.mutate()}>
              Crear negocio demo
            </Button>
          </Card>
        )}

        <Card className="flex items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-sm text-muted">Sesión iniciada como</p>
            <p className="truncate font-medium">{session?.user.email}</p>
          </div>
          <Button variant="outline" onClick={logout}><LogOut /> Cerrar sesión</Button>
        </Card>
      </div>
    </>
  );
}
