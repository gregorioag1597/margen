import type { DecimalInput } from './money';

/**
 * Datos de entrada del motor. Espejan las tablas de Supabase, pero el motor
 * no depende de Supabase: los services mapean filas → estos tipos.
 */

export type UnitCode = 'kg' | 'g' | 'l' | 'ml' | 'unit' | 'm' | 'cm' | 'h' | 'min';
export type UnitFamily = 'mass' | 'volume' | 'count' | 'length' | 'time';

export interface Ingredient {
  id: string;
  name: string;
  purchaseUnit: UnitCode;
  purchaseQty: DecimalInput;
  purchasePrice: DecimalInput;
}

export interface LaborRate {
  id: string;
  name: string;
  hourlyRate: DecimalInput;
}

export type ProductComponent =
  | {
      id: string;
      kind: 'ingredient' | 'packaging';
      ingredientId: string;
      quantity: DecimalInput;
      unit: UnitCode;
    }
  | {
      id: string;
      kind: 'labor';
      laborRateId: string;
      quantity: DecimalInput;
      unit: UnitCode;
    }
  | {
      id: string;
      kind: 'other';
      label: string;
      /** Monto directo por unidad de producto. */
      amount: DecimalInput;
    };

export interface Product {
  id: string;
  name: string;
  category?: string | null;
  /** null = todavía sin precio. */
  price: DecimalInput | null;
  /** Ventas estimadas por mes (products.monthly_units_estimate). */
  monthlyUnits: DecimalInput;
  /** Fracción (0.30 = 30 %). null = usa el default del negocio. */
  targetMargin: DecimalInput | null;
  components: ProductComponent[];
}

export type FixedCostCategory =
  | 'rent'
  | 'salaries'
  | 'accounting'
  | 'internet'
  | 'software'
  | 'insurance'
  | 'utilities'
  | 'advertising'
  | 'transport'
  | 'other';

export interface FixedCost {
  id: string;
  name: string;
  category: FixedCostCategory;
  monthlyAmount: DecimalInput;
  isActive: boolean;
}

export interface VariableCost {
  id: string;
  name: string;
  /** Fracción del precio (0.0639 = 6,39 %). */
  percentOfSale: DecimalInput;
  amountPerUnit: DecimalInput;
  appliesTo: 'all' | 'selected';
  /** Productos a los que aplica cuando appliesTo = 'selected'. */
  productIds: string[];
  /** Parte de las ventas a la que aplica (0.6 = 60 %). */
  shareOfSales: DecimalInput;
  isActive: boolean;
}

export type FixedCostAllocationMethod = 'direct_cost_weighted';

export interface MarginThresholds {
  /** Desde este margen (inclusive) es "saludable". */
  healthy: DecimalInput;
  /** Desde este margen (inclusive) es "bajo"; por debajo, "negativo". */
  low: DecimalInput;
}

export interface BusinessSettings {
  defaultTargetMargin: DecimalInput;
  marginThresholds?: MarginThresholds;
  priceRoundingStep?: DecimalInput;
  fixedCostAllocation?: FixedCostAllocationMethod;
}

/** Foto completa del negocio: lo único que necesita el motor. */
export interface BusinessSnapshot {
  currency: string;
  settings: BusinessSettings;
  ingredients: Ingredient[];
  laborRates: LaborRate[];
  products: Product[];
  fixedCosts: FixedCost[];
  variableCosts: VariableCost[];
}
