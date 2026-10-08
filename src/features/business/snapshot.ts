import { z } from 'zod';
import type { BusinessSettings, BusinessSnapshot, ProductComponent } from '@/domain/finance';
import type { FixedCostRow, LaborRateRow, VariableCostRow } from '@/features/costs/schemas';
import type { IngredientRow } from '@/features/ingredients/schemas';
import type { ComponentRow, ProductRow } from '@/features/products/schemas';
import type { Business } from './api';

/** Ajustes opcionales guardados en businesses.settings (jsonb). Lo inválido se ignora. */
const settingsSchema = z.object({
  marginThresholds: z.object({ healthy: z.coerce.string(), low: z.coerce.string() }).optional().catch(undefined),
  priceRoundingStep: z.coerce.string().optional().catch(undefined),
  fixedCostAllocation: z.literal('direct_cost_weighted').optional().catch(undefined),
});

function toComponent(row: ComponentRow): ProductComponent | null {
  switch (row.kind) {
    case 'ingredient':
    case 'packaging':
      return row.ingredient_id && row.quantity !== null && row.unit
        ? { id: row.id, kind: row.kind, ingredientId: row.ingredient_id, quantity: row.quantity, unit: row.unit }
        : null;
    case 'labor':
      return row.labor_rate_id && row.quantity !== null && row.unit
        ? { id: row.id, kind: 'labor', laborRateId: row.labor_rate_id, quantity: row.quantity, unit: row.unit }
        : null;
    case 'other':
      return row.fixed_amount !== null ? { id: row.id, kind: 'other', label: row.label ?? 'Otro', amount: row.fixed_amount } : null;
  }
}

export interface SnapshotRows {
  business: Business;
  ingredients: IngredientRow[];
  laborRates: LaborRateRow[];
  products: ProductRow[];
  fixedCosts: FixedCostRow[];
  variableCosts: VariableCostRow[];
}

/**
 * Filas de Supabase → foto del negocio para el motor. Función pura.
 * - Los insumos archivados se incluyen (un producto puede seguir usándolos).
 * - Los productos archivados no participan de los cálculos.
 */
export function toBusinessSnapshot(rows: SnapshotRows): BusinessSnapshot {
  const parsed = settingsSchema.safeParse(rows.business.settings ?? {});
  const extra = parsed.success ? parsed.data : {};
  const settings: BusinessSettings = {
    defaultTargetMargin: rows.business.default_target_margin,
    ...(extra.marginThresholds && { marginThresholds: extra.marginThresholds }),
    ...(extra.priceRoundingStep && { priceRoundingStep: extra.priceRoundingStep }),
    ...(extra.fixedCostAllocation && { fixedCostAllocation: extra.fixedCostAllocation }),
  };

  return {
    currency: rows.business.currency,
    settings,
    ingredients: rows.ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      purchaseUnit: i.purchase_unit,
      purchaseQty: i.purchase_qty,
      purchasePrice: i.purchase_price,
    })),
    laborRates: rows.laborRates.map((r) => ({ id: r.id, name: r.name, hourlyRate: r.hourly_rate })),
    products: rows.products
      .filter((p) => !p.archived_at)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        monthlyUnits: p.monthly_units_estimate,
        targetMargin: p.target_margin,
        components: [...p.product_components]
          .sort((a, b) => a.position - b.position)
          .map(toComponent)
          .filter((c): c is ProductComponent => c !== null),
      })),
    fixedCosts: rows.fixedCosts.map((f) => ({
      id: f.id,
      name: f.name,
      category: f.category,
      monthlyAmount: f.monthly_amount,
      isActive: f.is_active,
    })),
    variableCosts: rows.variableCosts.map((v) => ({
      id: v.id,
      name: v.name,
      percentOfSale: v.percent_of_sale,
      amountPerUnit: v.amount_per_unit,
      appliesTo: v.applies_to,
      productIds: v.variable_cost_products.map((x) => x.product_id),
      shareOfSales: v.share_of_sales,
      isActive: v.is_active,
    })),
  };
}
