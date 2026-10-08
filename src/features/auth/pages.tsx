import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useForm, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Banner, Card } from '@/components/ui/surfaces';
import { dataErrorMessage } from '@/copy/messages';
import { createBusiness } from '@/features/business/api';
import { BUSINESS_TYPES, CURRENCIES, type BusinessType } from '@/features/business/constants';
import { Logo } from '@/app/logo';
import { enterDemoMode } from '@/lib/demo-mode';
import { signIn, signUp } from './api';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-10">
      <Logo className="mb-8" />
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
    </main>
  );
}

/** Acceso a la demo pública, sin cuenta. */
function DemoInvite() {
  return (
    <div className="mt-6 border-t border-line pt-5 text-center">
      <p className="mb-3 text-sm text-muted">¿Querés verla funcionando antes?</p>
      <Button variant="secondary" block onClick={() => enterDemoMode()}>Probar la demo sin registrarte</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.email('Ingresá un email válido.'),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
});

export function LoginPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    try {
      await signIn(email, password);
      navigate('/', { replace: true });
    } catch (e) {
      setServerError(dataErrorMessage(e));
    }
  });

  return (
    <AuthShell
      title="Ingresar"
      subtitle="Mirá cuánto ganás con cada producto."
      footer={<>¿No tenés cuenta? <Link to="/registro" className="font-medium text-brand-700">Creá una gratis</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && <Banner tone="warning">{serverError}</Banner>}
        <Field label="Email" error={formState.errors.email?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} type="email" autoComplete="email" aria-invalid={!!formState.errors.email} {...register('email')} />}
        </Field>
        <Field label="Contraseña" error={formState.errors.password?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register('password')} />}
        </Field>
        <Button type="submit" size="lg" block loading={formState.isSubmitting}>Ingresar</Button>
      </form>
      <DemoInvite />
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------

const businessFields = {
  businessName: z.string().trim().min(1, 'Poné el nombre de tu negocio.').max(120),
  businessType: z.enum(BUSINESS_TYPES.map((t) => t.value) as [BusinessType, ...BusinessType[]], 'Elegí un tipo de negocio.'),
  currency: z.string().length(3),
};

const signupSchema = z.object({
  fullName: z.string().trim().min(1, 'Contanos tu nombre.').max(120),
  email: z.email('Ingresá un email válido.'),
  password: z.string().min(8, 'Usá al menos 8 caracteres.'),
  ...businessFields,
});

export function SignupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { currency: 'ARS' },
  });
  const err = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const { hasSession } = await signUp(values);
      if (!hasSession) {
        setCheckEmail(true);
        return;
      }
      await createBusiness({ name: values.businessName, businessType: values.businessType, currency: values.currency });
      await queryClient.invalidateQueries({ queryKey: ['businesses'] });
      navigate('/', { replace: true });
    } catch (e) {
      setServerError(dataErrorMessage(e));
    }
  });

  if (checkEmail) {
    return (
      <AuthShell title="Revisá tu correo" subtitle="Te enviamos un enlace para confirmar tu cuenta. Después podés ingresar.">
        <Link to="/ingresar"><Button block size="lg">Ir a ingresar</Button></Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Creá tu cuenta"
      subtitle="Te lleva un minuto. Después cargás tus insumos y productos."
      footer={<>¿Ya tenés cuenta? <Link to="/ingresar" className="font-medium text-brand-700">Ingresá</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && <Banner tone="warning">{serverError}</Banner>}
        <Field label="Tu nombre" error={err.fullName?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} autoComplete="name" aria-invalid={!!err.fullName} {...register('fullName')} />}
        </Field>
        <Field label="Email" error={err.email?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} type="email" autoComplete="email" aria-invalid={!!err.email} {...register('email')} />}
        </Field>
        <Field label="Contraseña" hint="Al menos 8 caracteres." error={err.password?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" aria-invalid={!!err.password} {...register('password')} />}
        </Field>

        <div className="border-t border-line pt-4">
          <p className="mb-3 text-sm font-semibold">Tu negocio</p>
          <BusinessFields register={register as unknown as UseFormRegister<BusinessFieldValues>} errors={err} />
        </div>

        <Button type="submit" size="lg" block loading={formState.isSubmitting}>Crear cuenta</Button>
      </form>
      <DemoInvite />
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------

type BusinessFieldValues = z.infer<typeof onboardingSchema>;

function BusinessFields({ register, errors }: { register: UseFormRegister<BusinessFieldValues>; errors: FieldErrors<BusinessFieldValues> }) {
  return (
    <div className="space-y-4">
      <Field label="Nombre del negocio" error={errors.businessName?.message}>
        {(id, d) => <Input id={id} aria-describedby={d} placeholder="Ej.: Dulce Tentación" aria-invalid={!!errors.businessName} {...register('businessName')} />}
      </Field>
      <Field label="Tipo de negocio" error={errors.businessType?.message}>
        {(id, d) => (
          <Select id={id} aria-describedby={d} defaultValue="" aria-invalid={!!errors.businessType} {...register('businessType')}>
            <option value="" disabled>Elegí una opción</option>
            {BUSINESS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Moneda principal" error={errors.currency?.message}>
        {(id, d) => (
          <Select id={id} aria-describedby={d} {...register('currency')}>
            {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        )}
      </Field>
    </div>
  );
}

const onboardingSchema = z.object(businessFields);

/** Para usuarios con sesión pero sin negocio (ej. si se activa confirmación de email). */
export function OnboardingPage({ pending }: { pending?: { name?: string; business_type?: BusinessType; currency?: string } }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<BusinessFieldValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      businessName: pending?.name ?? '',
      businessType: pending?.business_type,
      currency: pending?.currency ?? 'ARS',
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      await createBusiness({ name: v.businessName, businessType: v.businessType, currency: v.currency });
      await queryClient.invalidateQueries({ queryKey: ['businesses'] });
      navigate('/', { replace: true });
    } catch (e) {
      setServerError(dataErrorMessage(e));
    }
  });

  return (
    <AuthShell title="Contanos de tu negocio" subtitle="Con esto armamos tu espacio.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && <Banner tone="warning">{serverError}</Banner>}
        <BusinessFields register={register} errors={formState.errors} />
        <Button type="submit" size="lg" block loading={formState.isSubmitting}>Empezar</Button>
      </form>
    </AuthShell>
  );
}
