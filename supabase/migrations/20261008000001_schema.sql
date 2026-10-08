-- =====================================================================
-- Margen · Fase 1 · Esquema base
--
-- Principios:
--   * La base guarda SOLO datos de entrada. Costos, márgenes y precios
--     recomendados se calculan en el motor financiero (TypeScript).
--   * Todo dato privado pertenece a un business_id.
--   * Las referencias entre tablas usan claves foráneas compuestas
--     (id, business_id) para que sea imposible mezclar datos de dos negocios.
--   * Dinero: numeric(14,2). Porcentajes: fracción numeric(7,6) (6,39 % = 0.0639).
--   * Cantidades: se guarda lo que cargó el usuario (cantidad + unidad) y
--     una columna generada en unidad base (g, ml, unidad, cm, min).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.business_type as enum (
  'gastronomia', 'fabricacion', 'ecommerce', 'servicios', 'comercio', 'otro'
);

-- Solo 'owner' se usa en el MVP; los demás roles quedan para multiusuario.
create type public.member_role as enum ('owner', 'editor', 'viewer');

create type public.unit_family as enum ('mass', 'volume', 'count', 'length', 'time');

create type public.unit_code as enum ('kg', 'g', 'l', 'ml', 'unit', 'm', 'cm', 'h', 'min');

create type public.component_kind as enum ('ingredient', 'packaging', 'labor', 'other');

create type public.fixed_cost_category as enum (
  'rent', 'salaries', 'accounting', 'internet', 'software',
  'insurance', 'utilities', 'advertising', 'transport', 'other'
);

create type public.variable_cost_category as enum (
  'payment_fee', 'marketplace', 'tax', 'shipping', 'packaging', 'other'
);

create type public.variable_cost_scope as enum ('all', 'selected');

create type public.scenario_status as enum ('draft', 'applied');

-- ---------------------------------------------------------------------
-- Unidades
-- Espejo de src/domain/finance/units.ts. Nunca se convierte entre
-- familias (ej. g ↔ ml requiere densidad y es ambiguo).
-- ---------------------------------------------------------------------
create function public.unit_family_of(u public.unit_code)
returns public.unit_family
language sql immutable parallel safe
set search_path = ''
as $$
  select (case u
    when 'kg'   then 'mass'
    when 'g'    then 'mass'
    when 'l'    then 'volume'
    when 'ml'   then 'volume'
    when 'unit' then 'count'
    when 'm'    then 'length'
    when 'cm'   then 'length'
    when 'h'    then 'time'
    when 'min'  then 'time'
  end)::public.unit_family
$$;

-- Factor para pasar a la unidad base de la familia.
create function public.unit_factor(u public.unit_code)
returns numeric
language sql immutable parallel safe
set search_path = ''
as $$
  select case u
    when 'kg'   then 1000
    when 'g'    then 1
    when 'l'    then 1000
    when 'ml'   then 1
    when 'unit' then 1
    when 'm'    then 100
    when 'cm'   then 1
    when 'h'    then 60
    when 'min'  then 1
  end::numeric
$$;

-- ---------------------------------------------------------------------
-- Cuenta y negocio
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.businesses (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null check (char_length(btrim(name)) between 1 and 120),
  business_type          public.business_type not null,
  currency               char(3) not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  -- "¿Tus precios incluyen impuestos?" Informativo en el MVP (null = sin responder).
  prices_include_taxes   boolean,
  default_target_margin  numeric(7,6) not null default 0.30
                         check (default_target_margin >= 0 and default_target_margin < 1),
  -- Ajustes opcionales validados con Zod en el frontend:
  -- marginThresholds, priceRounding, fixedCostAllocation.
  -- Si una clave falta se usa el default de src/domain/finance/config.ts.
  settings               jsonb not null default '{}'::jsonb
                         check (jsonb_typeof(settings) = 'object'),
  is_demo                boolean not null default false,
  created_by             uuid references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.business_members (
  business_id  uuid not null references public.businesses (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         public.member_role not null default 'owner',
  created_at   timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_id_idx on public.business_members (user_id);

-- ---------------------------------------------------------------------
-- Insumos
-- ---------------------------------------------------------------------
create table public.ingredients (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 1 and 120),
  supplier           text check (char_length(supplier) <= 120),
  purchase_unit      public.unit_code not null,
  purchase_qty       numeric(14,4) not null check (purchase_qty > 0),
  purchase_price     numeric(14,2) not null check (purchase_price >= 0),
  unit_family        public.unit_family
                     generated always as (public.unit_family_of(purchase_unit)) stored,
  purchase_qty_base  numeric(18,4)
                     generated always as (purchase_qty * public.unit_factor(purchase_unit)) stored,
  price_updated_at   timestamptz not null default now(),
  notes              text check (char_length(notes) <= 1000),
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, business_id),
  -- Permite que los componentes exijan la misma familia de unidad (ver product_components).
  unique (id, business_id, unit_family)
);
create index ingredients_business_id_idx on public.ingredients (business_id);

-- Historial: solo se agregan filas (lo escribe un trigger, nunca el cliente).
create table public.ingredient_price_history (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null,
  ingredient_id   uuid not null,
  purchase_unit   public.unit_code not null,
  purchase_qty    numeric(14,4) not null,
  purchase_price  numeric(14,2) not null,
  effective_at    timestamptz not null default now(),
  foreign key (ingredient_id, business_id)
    references public.ingredients (id, business_id) on delete cascade
);
create index ingredient_price_history_lookup_idx
  on public.ingredient_price_history (ingredient_id, effective_at desc);
create index ingredient_price_history_business_idx
  on public.ingredient_price_history (business_id);

-- ---------------------------------------------------------------------
-- Costos
-- ---------------------------------------------------------------------
create table public.labor_rates (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null default 'Mano de obra' check (char_length(btrim(name)) between 1 and 120),
  hourly_rate  numeric(14,2) not null check (hourly_rate >= 0),
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, business_id)
);
create index labor_rates_business_id_idx on public.labor_rates (business_id);
create unique index labor_rates_one_default_idx
  on public.labor_rates (business_id) where is_default;

create table public.fixed_costs (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  category        public.fixed_cost_category not null default 'other',
  monthly_amount  numeric(14,2) not null check (monthly_amount >= 0),
  is_active       boolean not null default true,
  notes           text check (char_length(notes) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index fixed_costs_business_id_idx on public.fixed_costs (business_id);

create table public.variable_costs (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  category         public.variable_cost_category not null default 'other',
  percent_of_sale  numeric(7,6) not null default 0
                   check (percent_of_sale >= 0 and percent_of_sale < 1),
  amount_per_unit  numeric(14,2) not null default 0 check (amount_per_unit >= 0),
  applies_to       public.variable_cost_scope not null default 'all',
  -- Parte de las ventas estimadas a la que aplica (ej. MercadoLibre en el 60 % = 0.6).
  share_of_sales   numeric(7,6) not null default 1
                   check (share_of_sales > 0 and share_of_sales <= 1),
  is_active        boolean not null default true,
  notes            text check (char_length(notes) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (percent_of_sale > 0 or amount_per_unit > 0),
  unique (id, business_id)
);
create index variable_costs_business_id_idx on public.variable_costs (business_id);

-- ---------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------
create table public.products (
  id                      uuid primary key default gen_random_uuid(),
  business_id             uuid not null references public.businesses (id) on delete cascade,
  name                    text not null check (char_length(btrim(name)) between 1 and 120),
  category                text check (char_length(category) <= 60),
  -- null = todavía sin precio de venta.
  price                   numeric(14,2) check (price is null or price > 0),
  monthly_units_estimate  integer not null default 0 check (monthly_units_estimate >= 0),
  -- null = usa businesses.default_target_margin.
  target_margin           numeric(7,6)
                          check (target_margin is null or (target_margin >= 0 and target_margin < 1)),
  notes                   text check (char_length(notes) <= 1000),
  price_updated_at        timestamptz,
  archived_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (id, business_id)
);
create index products_business_id_idx on public.products (business_id);

create table public.product_components (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null,
  product_id     uuid not null,
  kind           public.component_kind not null,
  ingredient_id  uuid,
  labor_rate_id  uuid,
  quantity       numeric(14,4),
  unit           public.unit_code,
  unit_family    public.unit_family
                 generated always as (public.unit_family_of(unit)) stored,
  quantity_base  numeric(18,4)
                 generated always as (quantity * public.unit_factor(unit)) stored,
  -- Solo para kind = 'other': monto directo por unidad de producto.
  fixed_amount   numeric(14,2),
  label          text check (char_length(label) <= 120),
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  foreign key (product_id, business_id)
    references public.products (id, business_id) on delete cascade,
  -- Mismo negocio Y misma familia de unidad que el insumo.
  -- Además impide cambiar un insumo de kg a litros mientras se esté usando.
  foreign key (ingredient_id, business_id, unit_family)
    references public.ingredients (id, business_id, unit_family) on delete restrict,
  foreign key (labor_rate_id, business_id)
    references public.labor_rates (id, business_id) on delete restrict,

  check (
    (kind in ('ingredient', 'packaging')
      and ingredient_id is not null and labor_rate_id is null
      and quantity > 0 and unit is not null and fixed_amount is null)
    or
    (kind = 'labor'
      and labor_rate_id is not null and ingredient_id is null
      and quantity > 0 and unit in ('h', 'min') and fixed_amount is null)
    or
    (kind = 'other'
      and ingredient_id is null and labor_rate_id is null
      and quantity is null and unit is null
      and fixed_amount >= 0 and label is not null)
  )
);
create index product_components_product_idx on public.product_components (product_id, position);
create index product_components_ingredient_idx on public.product_components (ingredient_id);
create index product_components_labor_rate_idx on public.product_components (labor_rate_id);
create index product_components_business_idx on public.product_components (business_id);

create table public.product_price_history (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null,
  product_id    uuid not null,
  price         numeric(14,2) not null,
  effective_at  timestamptz not null default now(),
  foreign key (product_id, business_id)
    references public.products (id, business_id) on delete cascade
);
create index product_price_history_lookup_idx
  on public.product_price_history (product_id, effective_at desc);
create index product_price_history_business_idx
  on public.product_price_history (business_id);

-- Qué productos usan un costo variable con applies_to = 'selected'.
create table public.variable_cost_products (
  variable_cost_id  uuid not null,
  product_id        uuid not null,
  business_id       uuid not null,
  primary key (variable_cost_id, product_id),
  foreign key (variable_cost_id, business_id)
    references public.variable_costs (id, business_id) on delete cascade,
  foreign key (product_id, business_id)
    references public.products (id, business_id) on delete cascade
);
create index variable_cost_products_product_idx on public.variable_cost_products (product_id);
create index variable_cost_products_business_idx on public.variable_cost_products (business_id);

-- ---------------------------------------------------------------------
-- Simulador
-- changes: lista tipada de cambios (validada con Zod), ej.
--   [{"type":"product_price_pct","productIds":"all","pct":0.10}]
-- ---------------------------------------------------------------------
create table public.scenarios (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  changes      jsonb not null default '[]'::jsonb check (jsonb_typeof(changes) = 'array'),
  status       public.scenario_status not null default 'draft',
  applied_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((status = 'applied') = (applied_at is not null))
);
create index scenarios_business_id_idx on public.scenarios (business_id);

-- Diferidas a fases futuras (decisión aprobada):
--   * sales_estimates: en el MVP alcanza con products.monthly_units_estimate.
--   * product_cost_snapshots: se agregarán con la vista de evolución de costos;
--     nunca se usan para los cálculos actuales.
