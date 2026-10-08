# Margen · Arquitectura y decisiones

Propuesta de valor: **COSTO → PRECIO → MARGEN → RENTABILIDAD**, con datos conectados.
Caso de uso central: cambia el precio de un insumo → productos afectados, aumento de costo,
cambio de margen, ganancia perdida y precio recomendado para mantener el margen.

## Stack

React + TypeScript + Vite · Tailwind + shadcn/ui · React Router · TanStack Query ·
React Hook Form + Zod · decimal.js · Recharts (solo si aporta) · Supabase (Postgres, Auth, RLS) ·
Vitest + Playwright · Vercel.

## Principios

1. **La base guarda entradas, el motor calcula resultados.** Costos, márgenes, precios
   recomendados y punto de equilibrio se derivan siempre de los datos actuales, con el
   motor puro en `src/domain/finance/`. Nunca de snapshots.
2. **Un solo motor para todo.** `BusinessSnapshot → BusinessModel`. El simulador y el impacto
   de cambio de insumo aplican cambios a una copia del snapshot y comparan antes/después.
3. **Dinero exacto.** decimal.js en TypeScript; `numeric` en Postgres; redondeo solo al
   mostrar o guardar. Ninguna función devuelve NaN/Infinity: devuelven errores tipados.
4. **Seguridad en la base.** RLS por membresía (`business_members`); FKs compuestas
   `(id, business_id)` impiden referencias entre negocios; historiales solo por trigger.

## Decisiones aprobadas (2026-10-08)

| Tema | Decisión |
|---|---|
| Asignación de costos fijos | Por **costo directo × ventas estimadas**. No depende del precio (sin circularidad). Arquitectura abierta a otros métodos (`settings.fixedCostAllocation`); el MVP implementa solo este. Siempre se muestra como "asignación estimada de costos fijos". |
| Costos variables | Aplican a todos o a productos seleccionados (`variable_cost_products`), y opcionalmente a un % de las ventas (`share_of_sales`). % efectivo = `percent_of_sale × share_of_sales`. |
| Mano de obra | Costo directo del producto (dueño, empleados o ambos). Advertencia no bloqueante si hay costos fijos de categoría `salaries` y componentes de mano de obra. |
| Impuestos | Precios finales. Sin liquidación de IVA. Impuestos sobre la venta (ej. Ingresos Brutos) como costo variable %. `businesses.prices_include_taxes` es informativo. |
| Demo | A: demo pública sin cuenta, datos en el frontend, nunca toca la base. B: `create_demo_business()` crea "Pastelería Demo" (`is_demo = true`) dentro de una cuenta. |
| Confirmación de email | Desactivada en el MVP (`supabase/config.toml`). |
| Estados de margen | Saludable ≥ 25 % · Bajo ≥ 0 % y < 25 % · Negativo < 0 %. Centralizado en `src/domain/finance/config.ts`, sobreescribible por `settings.marginThresholds`. |
| Ventas estimadas | Solo `products.monthly_units_estimate`. `sales_estimates` queda para el futuro. |
| Snapshots de costo | `product_cost_snapshots` solo cuando se construya la evolución de costos. Nunca para cálculos actuales. |
| Historial de precios de venta | `product_price_history`, escrito por trigger. |
| Precio recomendado | Redondeo hacia arriba con `roundRecommendedPrice(price, step)`; pasos 10/50/100/500. Default MVP: 50 (ARS). |

## Fórmulas del motor

Por producto (P = precio, q = ventas estimadas por mes, m = margen objetivo):

- Costo unitario del insumo = precio de compra ÷ cantidad en unidad base
- Costo directo D = Σ componentes
- Costos de venta = P × p + F_v (p = Σ % efectivos, F_v = Σ montos por unidad × share)
- Contribución por unidad MC = P − D − (P × p + F_v)
- Asignación de fijos A_i = Fijos × (D_i × q_i) ÷ Σ(D_j × q_j)  → por unidad: ÷ q_i
- Ganancia por unidad = MC − A · Margen real = ganancia ÷ P · Markup = ganancia ÷ costo total
- **Precio recomendado = (D + F_v + A) ÷ (1 − m − p)** · si m + p ≥ 1 → `TARGET_MARGIN_UNREACHABLE`
- Ganancia mensual = Σ(MC × q) − Fijos
- Punto de equilibrio: facturación = Fijos ÷ (Σ MC·q ÷ Σ P·q); unidades = Fijos ÷ (Σ MC·q ÷ Σ q)
- Facturación para ganancia objetivo G = (Fijos + G) ÷ ratio de contribución

Caso de control: D = 4.200, p = 6,39 %, A = 0, m = 30 % → 4.200 ÷ 0,6361 = **$6.602,74**.

> Ojo con decimal.js: `isPositive()`/`isNegative()` tratan el 0 como +0/−0 y devuelven `true`.
> En el motor se usa siempre `gt(0)` / `lt(0)`.

## Roadmap

1. Base de datos + seguridad ✅ (migraciones aplicadas en Supabase; tests pgTAP pendientes de correr)
2. Motor financiero + tests ✅ (`src/domain/finance`, 105 tests con Vitest, `npm run demo:report`)
3. Insumos + costos ✅ (base de app, auth, onboarding, insumos con historial, costos fijos/de venta/mano de obra, configuración). Pendiente: probar contra Supabase real y E2E con Playwright (fase 8).
4. Productos + componentes ✅ (`useBusinessModel` = filas → `toBusinessSnapshot` → motor; ficha con desglose y precio recomendado)
5. Recalculo automático + impacto ✅ (aviso en vivo al editar un insumo + informe posterior con "Usar precio" por producto)
6. Dashboard ✅ (5 métricas, atención, rankings margen vs ganancia, objetivo de ganancia, primeros pasos; sin Recharts: barras CSS alcanzan)
7. Simulador ✅ (palancas → plan concreto → motor; `apply_scenario()` transaccional en migración 004; escenarios borrador en `scenarios`)
8. QA + UX + deploy — en curso:
   - 8.1 ✅ E2E Playwright sobre la demo pública (`npm run test:e2e`, celular + computadora). Auth E2E: contra Supabase local, nunca contra producción.
   - 8.2 ✅ Rutas con carga diferida + librerías en chunks propios (app 25 KB gz). Sin scroll horizontal (test E2E).
   - 8.3 ✅ Demo pública (`/demo`): `src/lib/demo-store.ts` en memoria, por pestaña; las funciones de `api.ts` se desvían ahí con `isDemoMode()`.
   - 8.4 ⏳ Tests pgTAP (`npm run test:db`) — requiere Docker + Supabase CLI.
   - 8.5 ⏳ Deploy en Vercel (`vercel.json` listo: SPA rewrites + headers).

9. Módulo administrativo ✅ — tabla `movements` (migración 005): ingresos/egresos reales, separados de los costos planificados.
   Resumen = "Tu mes real" (movimientos) + "Tu estimación" (motor). Navegación mobile: 4 + "Más".
   Los costos fijos NO generan egresos automáticos; vincular plan ↔ real queda para más adelante.

Antes de cada fase: resumen de lo que se construye y archivos principales; se espera aprobación.
