import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { buildBusinessModel, type BusinessModel, type BusinessSnapshot } from '@/domain/finance';
import { listFixedCosts, listLaborRates, listVariableCosts } from '@/features/costs/api';
import { listIngredients } from '@/features/ingredients/api';
import { listProducts } from '@/features/products/api';
import type { ProductRow } from '@/features/products/schemas';
import { queryKeys } from '@/lib/query-keys';
import { useCurrentBusiness } from './business-provider';
import { toBusinessSnapshot } from './snapshot';

export interface BusinessModelState {
  model: BusinessModel | null;
  snapshot: BusinessSnapshot | null;
  /** Filas crudas de productos (incluye archivados y datos que el motor no usa). */
  productRows: ProductRow[];
  isPending: boolean;
  error: unknown;
}

/**
 * Punto único de lectura para pantallas con números: trae los datos del
 * negocio (con las mismas claves de caché que cada sección) y los pasa por
 * el motor. Cualquier cambio en insumos, costos o productos recalcula todo.
 */
export function useBusinessModel(): BusinessModelState {
  const business = useCurrentBusiness();
  const id = business.id;

  const [ingredients, laborRates, products, fixedCosts, variableCosts] = useQueries({
    queries: [
      { queryKey: queryKeys.ingredients(id), queryFn: () => listIngredients(id) },
      { queryKey: queryKeys.laborRates(id), queryFn: () => listLaborRates(id) },
      { queryKey: queryKeys.products(id), queryFn: () => listProducts(id) },
      { queryKey: queryKeys.fixedCosts(id), queryFn: () => listFixedCosts(id) },
      { queryKey: queryKeys.variableCosts(id), queryFn: () => listVariableCosts(id) },
    ],
  });

  const all = [ingredients, laborRates, products, fixedCosts, variableCosts];
  const ready = all.every((q) => q.data !== undefined);

  const snapshot = useMemo(
    () =>
      ready
        ? toBusinessSnapshot({
            business,
            ingredients: ingredients.data!,
            laborRates: laborRates.data!,
            products: products.data!,
            fixedCosts: fixedCosts.data!,
            variableCosts: variableCosts.data!,
          })
        : null,
    [ready, business, ingredients.data, laborRates.data, products.data, fixedCosts.data, variableCosts.data],
  );

  const model = useMemo(() => (snapshot ? buildBusinessModel(snapshot) : null), [snapshot]);

  return {
    model,
    snapshot,
    productRows: products.data ?? [],
    isPending: !ready && !all.some((q) => q.error),
    error: all.find((q) => q.error)?.error ?? null,
  };
}
