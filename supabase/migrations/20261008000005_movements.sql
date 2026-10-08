-- =====================================================================
-- Margen · Fase 9 · Movimientos reales de dinero (ingresos y egresos)
--
-- Distinto de los costos del módulo "Costos":
--   * fixed_costs / variable_costs = lo PLANIFICADO (estructura del negocio)
--   * movements                    = lo que REALMENTE entró o salió
-- Los costos fijos no generan movimientos automáticos (evita duplicar).
-- Sin contabilidad: no hay cuentas, asientos ni impuestos automáticos.
-- =====================================================================

create type public.movement_kind as enum ('income', 'expense');

create type public.payment_method as enum ('cash', 'transfer', 'debit', 'credit', 'mercado_pago', 'other');

create table public.movements (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  kind            public.movement_kind not null,
  occurred_on     date not null default current_date,
  concept         text not null check (char_length(btrim(concept)) between 1 and 160),
  category        text not null,
  -- Siempre positivo: el signo lo da el tipo (ingreso / egreso).
  amount          numeric(14,2) not null check (amount > 0),
  -- Solo ingresos
  product_id      uuid,
  payment_method  public.payment_method,
  -- Solo egresos
  supplier        text check (char_length(supplier) <= 120),
  notes           text check (char_length(notes) <= 1000),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- El producto tiene que ser del mismo negocio. Si se borra el producto,
  -- el ingreso queda (solo se pierde el vínculo).
  foreign key (product_id, business_id)
    references public.products (id, business_id) on delete set null (product_id),

  -- Categorías válidas según el tipo.
  check (
    (kind = 'income' and category in ('sale', 'service', 'other_income'))
    or
    (kind = 'expense' and category in (
      'raw_materials', 'packaging', 'rent', 'salaries', 'utilities',
      'advertising', 'transport', 'taxes', 'software', 'other'))
  ),
  -- Campos exclusivos de cada tipo.
  check (kind = 'income' or (product_id is null and payment_method is null)),
  check (kind = 'expense' or supplier is null)
);

create index movements_business_date_idx on public.movements (business_id, occurred_on desc);
create index movements_business_kind_date_idx on public.movements (business_id, kind, occurred_on);
create index movements_product_idx on public.movements (product_id);

create trigger set_updated_at before update on public.movements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Seguridad: mismas reglas que el resto de los datos del negocio.
-- ---------------------------------------------------------------------
alter table public.movements enable row level security;

create policy movements_select_member on public.movements
  for select to authenticated using (public.is_business_member(business_id));
create policy movements_insert_member on public.movements
  for insert to authenticated with check (public.is_business_member(business_id));
create policy movements_update_member on public.movements
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy movements_delete_member on public.movements
  for delete to authenticated using (public.is_business_member(business_id));

revoke all on public.movements from anon;
