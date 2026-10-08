import type { QueryClient } from '@tanstack/react-query';

/**
 * Claves de TanStack Query centralizadas. Todo lo de un negocio lleva su id
 * en la posición 1, así cambiar de negocio no mezcla datos en caché.
 */
export const queryKeys = {
  ingredients: (businessId: string) => ['ingredients', businessId] as const,
  ingredientUsage: (businessId: string) => ['ingredients', businessId, 'usage'] as const,
  ingredientHistory: (ingredientId: string) => ['ingredient-history', ingredientId] as const,
  fixedCosts: (businessId: string) => ['fixed-costs', businessId] as const,
  variableCosts: (businessId: string) => ['variable-costs', businessId] as const,
  laborRates: (businessId: string) => ['labor-rates', businessId] as const,
  laborUsage: (businessId: string) => ['labor-usage', businessId] as const,
  productOptions: (businessId: string) => ['product-options', businessId] as const,
  products: (businessId: string) => ['products', businessId] as const,
  productHistory: (productId: string) => ['product-history', productId] as const,
  movements: (businessId: string, month: string) => ['movements', businessId, month] as const,
};

/**
 * Invalida todos los datos de un negocio. Como los resultados se calculan a
 * partir de los datos actuales, recargar todo garantiza que cada pantalla
 * muestre números coherentes después de cualquier cambio.
 */
export function invalidateBusinessData(queryClient: QueryClient, businessId: string) {
  return queryClient.invalidateQueries({ predicate: (q) => q.queryKey[1] === businessId });
}
