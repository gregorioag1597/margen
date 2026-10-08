import { Badge } from '@/components/ui/surfaces';
import { MARGIN_STATUS_LABEL } from '@/copy/messages';
import type { ProductEconomics } from '@/domain/finance';

/** Estado de un producto: saludable / bajo / negativo / sin precio / con error. */
export function MarginBadge({ product }: { product: ProductEconomics }) {
  if (product.error) return <Badge tone="negative">Revisar costos</Badge>;
  if (!product.marginStatus) return <Badge>Sin precio</Badge>;
  return <Badge tone={product.marginStatus}>{MARGIN_STATUS_LABEL[product.marginStatus]}</Badge>;
}
