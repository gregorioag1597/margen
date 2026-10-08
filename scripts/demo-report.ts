/**
 * Imprime los números de la Pastelería Demo para revisarlos a mano.
 * Uso: npm run demo:report
 */
import {
  buildBusinessModel,
  calculateIngredientPriceImpact,
  DEMO_SNAPSHOT,
  type Dec,
} from '../src/domain/finance';

const $ = (d: Dec | null | undefined) =>
  d == null ? '—' : `$${Number(d.toFixed(2)).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const pc = (d: Dec | null | undefined) => (d == null ? '—' : `${d.times(100).toFixed(1)} %`);

const model = buildBusinessModel(DEMO_SNAPSHOT);

console.log('\nPASTELERÍA DEMO · por producto\n');
console.table(
  model.products.map((p) => ({
    Producto: p.name,
    Precio: $(p.price),
    'Costo directo': $(p.directCost?.total),
    'Costos de venta': $(p.variableCostPerUnit),
    'Fijos asignados (est.)': $(p.fixedAllocationPerUnit),
    'Ganancia/u': $(p.profitPerUnit),
    Margen: pc(p.margin),
    Estado: p.marginStatus,
    'Precio recomendado': p.recommendedPrice.ok ? $(p.recommendedPrice.value.rounded) : p.recommendedPrice.error.code,
    'Ventas/mes': p.monthlyUnits.toString(),
    'Ganancia/mes': $(p.monthlyProfit),
  })),
);

const s = model.summary;
console.log('\nRESUMEN DEL MES');
console.log(`  Facturación estimada: ${$(s.monthlyRevenue)}`);
console.log(`  Ganancia estimada:    ${$(s.monthlyProfit)}`);
console.log(`  Margen promedio:      ${pc(s.averageMargin)}`);
console.log(`  Costos fijos:         ${$(s.fixedCostsTotal)}`);
console.log(`  Punto de equilibrio:  ${s.breakEven.ok ? $(s.breakEven.value.revenue) : s.breakEven.error.code}`);

const impact = calculateIngredientPriceImpact(DEMO_SNAPSHOT, 'choc', { purchasePrice: 22000 });
if (impact.ok) {
  console.log(`\nCHOCOLATE $18.000 → $22.000/kg · ${impact.value.affectedProducts.length} productos afectados\n`);
  console.table(
    impact.value.affectedProducts.map((p) => ({
      Producto: p.name,
      'Costo antes': $(p.costBefore),
      'Costo después': $(p.costAfter),
      'Margen antes': pc(p.marginBefore),
      'Margen después': pc(p.marginAfter),
      'Ganancia perdida/mes': $(p.monthlyProfitLost),
      'Precio p/ mantener margen': $(p.priceToKeepMargin),
    })),
  );
  console.log(`  Ganancia mensual: ${$(impact.value.monthlyProfitBefore)} → ${$(impact.value.monthlyProfitAfter)} (−${$(impact.value.monthlyProfitLost)})\n`);
}
