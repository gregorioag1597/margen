-- =====================================================================
-- Margen · Fase 10
--   10.1 Recetas por tanda: rinde del producto + componente por tanda/unidad
--   10.2 Merma por insumo
--   10.3 Pago real vinculado a un costo fijo
--   10.4 Compra de insumo vinculada a un egreso
-- Todos los campos tienen valores por defecto: los datos existentes no cambian.
-- =====================================================================

-- 10.1 ---------------------------------------------------------------
alter table public.products
  add column batch_yield numeric(12,3) not null default 1 check (batch_yield > 0);

create type public.component_basis as enum ('batch', 'unit');

alter table public.product_components
  add column basis public.component_basis not null default 'batch';

-- 10.2 ---------------------------------------------------------------
-- Fracción que se pierde (0.2 = 20 %). Costo usable = costo ÷ (1 − merma).
alter table public.ingredients
  add column waste_pct numeric(5,4) not null default 0 check (waste_pct >= 0 and waste_pct <= 0.9);

-- 10.3 y 10.4 -------------------------------------------------------
alter table public.fixed_costs
  add constraint fixed_costs_id_business_key unique (id, business_id);

alter table public.movements
  add column fixed_cost_id    uuid,
  add column ingredient_id    uuid,
  add column ingredient_qty   numeric(14,4),
  add column ingredient_unit  public.unit_code;

-- Mismo negocio. Si se borra el costo fijo o el insumo, el egreso queda.
alter table public.movements
  add constraint movements_fixed_cost_fk foreign key (fixed_cost_id, business_id)
    references public.fixed_costs (id, business_id) on delete set null (fixed_cost_id),
  add constraint movements_ingredient_fk foreign key (ingredient_id, business_id)
    references public.ingredients (id, business_id) on delete set null (ingredient_id),
  -- Solo los egresos se vinculan a costos fijos o compras de insumos.
  add constraint movements_links_only_expense
    check (kind = 'expense' or (fixed_cost_id is null and ingredient_id is null)),
  -- Una compra de insumo necesita cantidad y unidad.
  add constraint movements_ingredient_purchase_complete
    check (ingredient_id is null or (ingredient_qty > 0 and ingredient_unit is not null));

create index movements_fixed_cost_idx on public.movements (fixed_cost_id);
create index movements_ingredient_idx on public.movements (ingredient_id);
