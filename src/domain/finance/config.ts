import { dec, type Dec } from './money';
import type { BusinessSettings, FixedCostAllocationMethod } from './types';

/**
 * Valores por defecto centralizados. Ningún componente de UI debe repetir
 * estos números: siempre se leen de acá (o de los settings del negocio).
 */
export const DEFAULT_MARGIN_THRESHOLDS = {
  healthy: dec('0.25'),
  low: dec('0'),
} as const;

export const DEFAULT_TARGET_MARGIN = dec('0.30');

export const TARGET_MARGIN_PRESETS = [dec('0.20'), dec('0.30'), dec('0.40')] as const;

/** Pasos de redondeo disponibles para el precio recomendado. */
export const PRICE_ROUNDING_STEPS = [10, 50, 100, 500] as const;

/** Paso por defecto según moneda (ARS: precios de miles → $50). */
export function defaultRoundingStep(currency: string): Dec {
  switch (currency) {
    case 'ARS':
    case 'CLP':
    case 'COP':
    case 'PYG':
      return dec(50);
    default:
      return dec('0.5');
  }
}

export const DEFAULT_ALLOCATION_METHOD: FixedCostAllocationMethod = 'direct_cost_weighted';

export interface ResolvedSettings {
  defaultTargetMargin: Dec;
  thresholds: { healthy: Dec; low: Dec };
  roundingStep: Dec;
  allocationMethod: FixedCostAllocationMethod;
}

export function resolveSettings(settings: BusinessSettings, currency: string): ResolvedSettings {
  return {
    defaultTargetMargin: dec(settings.defaultTargetMargin ?? DEFAULT_TARGET_MARGIN),
    thresholds: settings.marginThresholds
      ? { healthy: dec(settings.marginThresholds.healthy), low: dec(settings.marginThresholds.low) }
      : { ...DEFAULT_MARGIN_THRESHOLDS },
    roundingStep:
      settings.priceRoundingStep !== undefined
        ? dec(settings.priceRoundingStep)
        : defaultRoundingStep(currency),
    allocationMethod: settings.fixedCostAllocation ?? DEFAULT_ALLOCATION_METHOD,
  };
}
