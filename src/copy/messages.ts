import type { FinanceErrorCode, FinanceWarningCode, MarginStatus } from '@/domain/finance';
import { DataError } from '@/lib/supabase';

/** Explicaciones cortas de conceptos. Un solo lugar para todo el vocabulario. */
export const GLOSSARY = {
  margin: 'Margen: porcentaje del precio de venta que te queda después de cubrir los costos.',
  unitCost: 'Cuánto te cuesta cada gramo, mililitro o unidad de este insumo.',
  fixedCosts: 'Costos fijos: lo que pagás todos los meses aunque no vendas nada (alquiler, contador, internet…).',
  variableCosts:
    'Costos de venta: se pagan cada vez que vendés. Pueden ser un % del precio (Mercado Pago, MercadoLibre, Ingresos Brutos) o un monto por unidad (envío, bolsa).',
  shareOfSales:
    'Si solo una parte de tus ventas paga este costo (por ejemplo, el 60 % se cobra con Mercado Pago), indicalo acá.',
  labor:
    'El valor de una hora de trabajo para hacer tus productos. Puede ser tu tiempo, el de empleados o ambos.',
  laborDoubleCount:
    'Atención: podrías estar contabilizando parte de la mano de obra dos veces. Revisá si los sueldos incluidos en costos fijos corresponden al mismo trabajo que estás cargando en los productos.',
  pricesIncludeTaxes:
    'Solo informativo por ahora. Los impuestos que se pagan sobre la venta (como Ingresos Brutos) cargalos como costo de venta.',
  fixedAllocation: 'Distribuimos tus costos fijos según las ventas estimadas que cargaste.',
  contribution: 'Lo que te deja cada venta para pagar los costos fijos.',
  recommendedPrice:
    'El precio que te deja el margen objetivo después de pagar todo: insumos, mano de obra, comisiones y tu parte de costos fijos.',
  markupVsMargin: 'Ojo: sumarle un 30 % al costo no te deja un 30 % de margen. Por eso calculamos el precio sobre el margen.',
  monthlyUnits: 'Cuántas unidades vendés en un mes normal. Se usa para repartir los costos fijos.',
} as const;

export const MARGIN_STATUS_LABEL: Record<MarginStatus, string> = {
  healthy: 'Margen saludable',
  low: 'Margen bajo',
  negative: 'Margen negativo',
};

export const PRODUCT_WARNINGS: Partial<Record<FinanceWarningCode, string>> = {
  NO_COMPONENTS: 'Todavía no cargaste qué lleva este producto, así que su costo figura en $0.',
  NO_SALES_ESTIMATE:
    'Sin ventas estimadas: no entra en el reparto de costos fijos del mes. La asignación que ves es solo de referencia.',
  NO_PRICE: 'Todavía no tiene precio de venta. Abajo te sugerimos uno.',
  VARIABLE_PERCENT_TOO_HIGH: 'Los costos de venta suman 100 % o más del precio: cada venta pierde plata.',
};

const FINANCE_ERRORS: Record<FinanceErrorCode, string> = {
  INVALID_INPUT: 'Hay un dato que no es un número válido.',
  INVALID_QUANTITY: 'La cantidad tiene que ser mayor a 0.',
  INCOMPATIBLE_UNITS: 'Las unidades no son compatibles (por ejemplo, gramos con litros).',
  MISSING_REFERENCE: 'Falta un insumo o una tarifa que este producto usa.',
  MISSING_PRICE: 'Todavía no cargaste un precio de venta.',
  ZERO_COST: 'El costo es 0, así que no se puede calcular el markup.',
  INVALID_TARGET_MARGIN: 'El margen objetivo tiene que estar entre 0 % y 99 %.',
  TARGET_MARGIN_UNREACHABLE: 'Con estos costos de venta no hay precio que alcance ese margen.',
  NO_SALES_DATA: 'Cargá ventas estimadas para poder calcular esto.',
  NO_CONTRIBUTION: 'Con los precios actuales cada venta pierde plata, así que no hay punto de equilibrio.',
};

export function financeErrorMessage(code: FinanceErrorCode): string {
  return FINANCE_ERRORS[code];
}

/** Traduce errores de Supabase/Postgres a mensajes para personas. */
export function dataErrorMessage(error: unknown): string {
  if (error instanceof DataError) {
    switch (error.code) {
      case '23503':
        return 'No se puede hacer este cambio porque el dato se usa en algún producto. Probá archivarlo en lugar de borrarlo.';
      case '23514':
        return 'Algún valor está fuera de rango. Revisá los números.';
      case '23505':
        return 'Ya existe un registro igual.';
      case '42501':
        return 'No tenés permiso para hacer esto.';
      case '28000':
        return 'Tu sesión expiró. Volvé a ingresar.';
    }
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
    if (msg.includes('user already registered')) return 'Ya hay una cuenta con ese email. Probá ingresar.';
    if (msg.includes('password should be')) return 'La contraseña tiene que tener al menos 6 caracteres.';
    if (msg.includes('email not confirmed')) return 'Tenés que confirmar tu email antes de ingresar. Revisá tu correo.';
    if (msg.includes('failed to fetch')) return 'No hay conexión con el servidor. Revisá tu internet.';
  }
  if (error instanceof Error && error.message.toLowerCase().includes('failed to fetch')) {
    return 'No hay conexión con el servidor. Revisá tu internet.';
  }
  return 'Algo salió mal. Probá de nuevo en un momento.';
}
