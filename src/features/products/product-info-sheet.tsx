import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { AffixInput, Field, Input, Textarea } from '@/components/ui/form';
import { Banner, Sheet } from '@/components/ui/surfaces';
import { dataErrorMessage, GLOSSARY } from '@/copy/messages';
import { useCurrentBusiness } from '@/features/business/business-provider';
import { numberToInput } from '@/lib/number-input';
import { invalidateBusinessData } from '@/lib/query-keys';
import { createProduct, deleteProduct, updateProduct } from './api';
import { productFormSchema, toProductPayload, type ProductFormValues, type ProductRow } from './schemas';

/** Alta y edición de los datos básicos de un producto (los componentes van aparte). */
export function ProductInfoSheet({ product, open, onClose }: { product: ProductRow | null; open: boolean; onClose: () => void }) {
  const business = useCurrentBusiness();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const isNew = product === null;

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product
      ? {
          name: product.name,
          category: product.category ?? '',
          price: numberToInput(product.price),
          monthlyUnits: String(product.monthly_units_estimate),
          notes: product.notes ?? '',
        }
      : { name: '', category: '', price: '', monthlyUnits: '', notes: '' },
  });
  const errors = form.formState.errors;
  const refresh = () => invalidateBusinessData(queryClient, business.id);

  const save = useMutation({
    mutationFn: async (v: ProductFormValues) => {
      const payload = toProductPayload(v);
      if (isNew) return createProduct(business.id, payload);
      await updateProduct(product.id, payload);
      return product.id;
    },
    onSuccess: async (id) => {
      await refresh();
      onClose();
      if (isNew) navigate(`/productos/${id}`);
    },
    onError: (e) => setServerError(dataErrorMessage(e)),
  });

  const archive = useMutation({
    mutationFn: () => updateProduct(product!.id, { archived_at: product!.archived_at ? null : new Date().toISOString() }),
    onSuccess: async () => { await refresh(); onClose(); },
    onError: (e) => setServerError(dataErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => deleteProduct(product!.id),
    onSuccess: async () => { await refresh(); onClose(); navigate('/productos', { replace: true }); },
    onError: (e) => setServerError(dataErrorMessage(e)),
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isNew ? 'Nuevo producto' : 'Editar producto'}
      footer={
        <Button size="lg" block loading={save.isPending} onClick={form.handleSubmit((v) => { setServerError(null); save.mutate(v); })}>
          {isNew ? 'Crear y cargar qué lleva' : 'Guardar cambios'}
        </Button>
      }
    >
      <form className="space-y-4" noValidate onSubmit={(e) => e.preventDefault()}>
        {serverError && <Banner tone="warning">{serverError}</Banner>}
        <Field label="Nombre" error={errors.name?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} placeholder="Ej.: Alfajor Premium" aria-invalid={!!errors.name} {...form.register('name')} />}
        </Field>
        <Field label="Categoría (opcional)" error={errors.category?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} placeholder="Ej.: Alfajores" {...form.register('category')} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio de venta" hint="Podés dejarlo vacío y te sugerimos uno." error={errors.price?.message}>
            {(id, d) => <AffixInput id={id} aria-describedby={d} prefix="$" placeholder="6.000" aria-invalid={!!errors.price} {...form.register('price')} />}
          </Field>
          <Field label="Ventas por mes" hint={GLOSSARY.monthlyUnits} error={errors.monthlyUnits?.message}>
            {(id, d) => <AffixInput id={id} aria-describedby={d} inputMode="numeric" suffix="u." placeholder="400" aria-invalid={!!errors.monthlyUnits} {...form.register('monthlyUnits')} />}
          </Field>
        </div>
        {!isNew && product.price && <p className="text-[13px] text-muted">Si cambiás el precio, el anterior queda guardado en el historial.</p>}
        <Field label="Notas (opcional)" error={errors.notes?.message}>
          {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} {...form.register('notes')} />}
        </Field>

        {!isNew && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button variant="outline" size="sm" loading={archive.isPending} onClick={() => archive.mutate()}>
              {product.archived_at ? <><ArchiveRestore /> Restaurar</> : <><Archive /> Archivar</>}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={remove.isPending}
              onClick={() => { if (window.confirm(`¿Eliminar "${product.name}" con sus componentes e historial? No se puede deshacer.`)) remove.mutate(); }}
            >
              <Trash2 /> Eliminar
            </Button>
          </div>
        )}
      </form>
    </Sheet>
  );
}
