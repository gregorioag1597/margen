-- =====================================================================
-- Margen · Fase 1 · Seguridad (Row Level Security)
--
-- Regla única: un usuario ve y modifica datos de un negocio solo si es
-- miembro de ese negocio (business_members). El frontend no filtra nada
-- por seguridad; la base es la que decide.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones de membresía
-- security definer: leen business_members sin pasar por su propia RLS
-- (evita recursión). stable + (select auth.uid()) para que Postgres
-- las evalúe una vez por consulta y no por fila.
-- ---------------------------------------------------------------------
create function public.is_business_member(p_business_id uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
  )
$$;

create function public.is_business_owner(p_business_id uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
$$;

-- ---------------------------------------------------------------------
-- Activar RLS en todas las tablas
-- ---------------------------------------------------------------------
alter table public.profiles                 enable row level security;
alter table public.businesses               enable row level security;
alter table public.business_members         enable row level security;
alter table public.ingredients              enable row level security;
alter table public.ingredient_price_history enable row level security;
alter table public.labor_rates              enable row level security;
alter table public.fixed_costs              enable row level security;
alter table public.variable_costs           enable row level security;
alter table public.products                 enable row level security;
alter table public.product_components       enable row level security;
alter table public.product_price_history    enable row level security;
alter table public.variable_cost_products   enable row level security;
alter table public.scenarios                enable row level security;

-- ---------------------------------------------------------------------
-- Perfil: cada uno el suyo
-- ---------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Negocios: se crean solo vía create_business(). Edita/borra el owner.
-- ---------------------------------------------------------------------
create policy businesses_select_member on public.businesses
  for select to authenticated
  using (public.is_business_member(id));

create policy businesses_update_owner on public.businesses
  for update to authenticated
  using (public.is_business_owner(id))
  with check (public.is_business_owner(id));

create policy businesses_delete_owner on public.businesses
  for delete to authenticated
  using (public.is_business_owner(id));

-- Membresías: solo lectura de las propias. Las escriben las RPC.
create policy business_members_select_own on public.business_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Tablas de datos del negocio: CRUD completo para miembros.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'ingredients', 'labor_rates', 'fixed_costs', 'variable_costs',
    'products', 'product_components', 'variable_cost_products', 'scenarios'
  ] loop
    execute format(
      'create policy %1$s_select_member on public.%1$I for select to authenticated
         using (public.is_business_member(business_id))', t);
    execute format(
      'create policy %1$s_insert_member on public.%1$I for insert to authenticated
         with check (public.is_business_member(business_id))', t);
    execute format(
      'create policy %1$s_update_member on public.%1$I for update to authenticated
         using (public.is_business_member(business_id))
         with check (public.is_business_member(business_id))', t);
    execute format(
      'create policy %1$s_delete_member on public.%1$I for delete to authenticated
         using (public.is_business_member(business_id))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Historiales: solo lectura. Los escriben los triggers (security definer).
-- ---------------------------------------------------------------------
create policy ingredient_price_history_select_member on public.ingredient_price_history
  for select to authenticated
  using (public.is_business_member(business_id));

create policy product_price_history_select_member on public.product_price_history
  for select to authenticated
  using (public.is_business_member(business_id));

-- ---------------------------------------------------------------------
-- Privilegios (defensa adicional a la RLS)
-- ---------------------------------------------------------------------
-- Sin sesión no se accede a ninguna tabla. La demo pública no usa la base.
revoke all on all tables in schema public from anon;

-- Historiales inalterables desde el cliente.
revoke insert, update, delete on public.ingredient_price_history from authenticated;
revoke insert, update, delete on public.product_price_history from authenticated;

-- Negocios y membresías solo se crean por RPC.
revoke insert on public.businesses from authenticated;
revoke insert, update, delete on public.business_members from authenticated;

-- Funciones: nadie anónimo puede ejecutar RPC.
revoke execute on function public.create_business(text, public.business_type, text, boolean) from public, anon;
revoke execute on function public.create_demo_business() from public, anon;
revoke execute on function public.is_business_member(uuid) from public, anon;
revoke execute on function public.is_business_owner(uuid) from public, anon;
grant execute on function public.create_business(text, public.business_type, text, boolean) to authenticated;
grant execute on function public.create_demo_business() to authenticated;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.is_business_owner(uuid) to authenticated;

-- Funciones internas de triggers: no invocables por la API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.ingredients_log_price() from public, anon, authenticated;
revoke execute on function public.products_log_price() from public, anon, authenticated;
