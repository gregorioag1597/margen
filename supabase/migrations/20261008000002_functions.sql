-- =====================================================================
-- Margen · Fase 1 · Triggers y funciones (RPC)
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'businesses', 'ingredients', 'labor_rates', 'fixed_costs',
    'variable_costs', 'products', 'product_components', 'scenarios'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Perfil al registrarse. El nombre llega en options.data.full_name
-- de supabase.auth.signUp().
-- ---------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Historial de precios de insumos
-- BEFORE: marca la fecha del cambio. AFTER: agrega la fila al historial.
-- security definer: el cliente no tiene permiso de escribir el historial,
-- así nadie puede falsearlo ni borrarlo.
-- ---------------------------------------------------------------------
create function public.ingredients_touch_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or (new.purchase_price, new.purchase_qty, new.purchase_unit)
        is distinct from (old.purchase_price, old.purchase_qty, old.purchase_unit) then
    new.price_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger ingredients_touch_price
  before insert or update on public.ingredients
  for each row execute function public.ingredients_touch_price();

create function public.ingredients_log_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or (new.purchase_price, new.purchase_qty, new.purchase_unit)
        is distinct from (old.purchase_price, old.purchase_qty, old.purchase_unit) then
    insert into public.ingredient_price_history
      (business_id, ingredient_id, purchase_unit, purchase_qty, purchase_price, effective_at)
    values
      (new.business_id, new.id, new.purchase_unit, new.purchase_qty, new.purchase_price, new.price_updated_at);
  end if;
  return null;
end;
$$;

create trigger ingredients_log_price
  after insert or update on public.ingredients
  for each row execute function public.ingredients_log_price();

-- ---------------------------------------------------------------------
-- Historial de precios de venta
-- ---------------------------------------------------------------------
create function public.products_touch_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.price is not null
     and (tg_op = 'INSERT' or new.price is distinct from old.price) then
    new.price_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger products_touch_price
  before insert or update on public.products
  for each row execute function public.products_touch_price();

create function public.products_log_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.price is not null
     and (tg_op = 'INSERT' or new.price is distinct from old.price) then
    insert into public.product_price_history (business_id, product_id, price, effective_at)
    values (new.business_id, new.id, new.price, new.price_updated_at);
  end if;
  return null;
end;
$$;

create trigger products_log_price
  after insert or update on public.products
  for each row execute function public.products_log_price();

-- ---------------------------------------------------------------------
-- RPC: crear negocio (negocio + membresía owner en una sola transacción).
-- Es la única forma de crear un negocio: no hay política INSERT directa.
-- ---------------------------------------------------------------------
create function public.create_business(
  p_name                  text,
  p_business_type         public.business_type,
  p_currency              text default 'ARS',
  p_prices_include_taxes  boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_business_id uuid;
begin
  if v_user is null then
    raise exception 'Necesitás iniciar sesión' using errcode = '28000';
  end if;

  insert into public.businesses (name, business_type, currency, prices_include_taxes, created_by)
  values (btrim(p_name), p_business_type, upper(p_currency), p_prices_include_taxes, v_user)
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role)
  values (v_business_id, v_user, 'owner');

  return v_business_id;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: negocio demo dentro de una cuenta real (opción B).
-- Separado de los datos reales por businesses.is_demo y por ser otro negocio.
-- Idempotente: si el usuario ya tiene uno, devuelve ese.
-- La demo pública (opción A) no usa la base: corre con datos en el frontend.
-- ---------------------------------------------------------------------
create function public.create_demo_business()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_biz uuid;
  i_choc uuid; i_ddl uuid; i_harina uuid; i_azucar uuid;
  i_manteca uuid; i_huevo uuid; i_caja uuid; i_etiqueta uuid;
  v_labor uuid;
  p_alfajor uuid; p_brownie uuid; p_torta uuid; p_cookie uuid;
  v_meli uuid;
begin
  if v_user is null then
    raise exception 'Necesitás iniciar sesión' using errcode = '28000';
  end if;

  select b.id into v_biz
  from public.businesses b
  join public.business_members m on m.business_id = b.id
  where m.user_id = v_user and b.is_demo
  limit 1;

  if v_biz is not null then
    return v_biz;
  end if;

  insert into public.businesses (name, business_type, currency, prices_include_taxes, is_demo, created_by)
  values ('Pastelería Demo', 'gastronomia', 'ARS', true, true, v_user)
  returning id into v_biz;

  insert into public.business_members (business_id, user_id, role)
  values (v_biz, v_user, 'owner');

  -- Insumos
  insert into public.ingredients (business_id, name, supplier, purchase_unit, purchase_qty, purchase_price)
  values (v_biz, 'Chocolate semiamargo', 'Distribuidora Sur', 'kg', 1, 18000) returning id into i_choc;
  insert into public.ingredients (business_id, name, purchase_unit, purchase_qty, purchase_price)
  values (v_biz, 'Dulce de leche', 'kg', 1, 4500) returning id into i_ddl;
  insert into public.ingredients (business_id, name, purchase_unit, purchase_qty, purchase_price)
  values (v_biz, 'Harina 0000', 'kg', 1, 1500) returning id into i_harina;
  insert into public.ingredients (business_id, name, purchase_unit, purchase_qty, purchase_price)
  values (v_biz, 'Azúcar', 'kg', 1, 1200) returning id into i_azucar;
  insert into public.ingredients (business_id, name, purchase_unit, purchase_qty, purchase_price)
  values (v_biz, 'Manteca', 'g', 500, 5000) returning id into i_manteca;
  insert into public.ingredients (business_id, name, purchase_unit, purchase_qty, purchase_price)
  values (v_biz, 'Huevos', 'unit', 30, 6000) returning id into i_huevo;
  insert into public.ingredients (business_id, name, supplier, purchase_unit, purchase_qty, purchase_price)
  values (v_biz, 'Caja individual', 'Packaging Express', 'unit', 100, 25000) returning id into i_caja;
  insert into public.ingredients (business_id, name, purchase_unit, purchase_qty, purchase_price)
  values (v_biz, 'Etiqueta', 'unit', 100, 5000) returning id into i_etiqueta;

  -- Historia previa del chocolate para poder ver su evolución.
  insert into public.ingredient_price_history
    (business_id, ingredient_id, purchase_unit, purchase_qty, purchase_price, effective_at)
  values
    (v_biz, i_choc, 'kg', 1, 16000, now() - interval '120 days'),
    (v_biz, i_choc, 'kg', 1, 17000, now() - interval '60 days');

  -- Mano de obra
  insert into public.labor_rates (business_id, name, hourly_rate, is_default)
  values (v_biz, 'Mano de obra general', 6000, true) returning id into v_labor;

  -- Costos fijos ($630.000/mes)
  insert into public.fixed_costs (business_id, name, category, monthly_amount) values
    (v_biz, 'Alquiler del local', 'rent', 450000),
    (v_biz, 'Contador', 'accounting', 60000),
    (v_biz, 'Internet', 'internet', 25000),
    (v_biz, 'Software de gestión', 'software', 15000),
    (v_biz, 'Publicidad en redes', 'advertising', 80000);

  -- Productos
  insert into public.products (business_id, name, category, price, monthly_units_estimate, target_margin)
  values (v_biz, 'Alfajor Premium', 'Alfajores', 6000, 400, 0.30) returning id into p_alfajor;
  insert into public.products (business_id, name, category, price, monthly_units_estimate, target_margin)
  values (v_biz, 'Brownie', 'Individuales', 4500, 300, 0.30) returning id into p_brownie;
  insert into public.products (business_id, name, category, price, monthly_units_estimate, target_margin)
  values (v_biz, 'Torta Chocolate', 'Tortas', 32000, 30, 0.30) returning id into p_torta;
  insert into public.products (business_id, name, category, price, monthly_units_estimate, target_margin)
  values (v_biz, 'Cookie de chocolate', 'Individuales', 1800, 600, 0.30) returning id into p_cookie;

  -- Historia previa del precio del alfajor.
  insert into public.product_price_history (business_id, product_id, price, effective_at) values
    (v_biz, p_alfajor, 5000, now() - interval '120 days'),
    (v_biz, p_alfajor, 5500, now() - interval '60 days');

  -- Componentes
  insert into public.product_components
    (business_id, product_id, kind, ingredient_id, labor_rate_id, quantity, unit, position)
  values
    -- Alfajor Premium: costo directo $3.050
    (v_biz, p_alfajor, 'ingredient', i_choc,     null,    80,  'g',    1),
    (v_biz, p_alfajor, 'ingredient', i_ddl,      null,    100, 'g',    2),
    (v_biz, p_alfajor, 'ingredient', i_harina,   null,    40,  'g',    3),
    (v_biz, p_alfajor, 'packaging',  i_caja,     null,    1,   'unit', 4),
    (v_biz, p_alfajor, 'packaging',  i_etiqueta, null,    1,   'unit', 5),
    (v_biz, p_alfajor, 'labor',      null,       v_labor, 8,   'min',  6),
    -- Brownie: costo directo $2.673
    (v_biz, p_brownie, 'ingredient', i_choc,     null,    60,  'g',    1),
    (v_biz, p_brownie, 'ingredient', i_harina,   null,    30,  'g',    2),
    (v_biz, p_brownie, 'ingredient', i_azucar,   null,    40,  'g',    3),
    (v_biz, p_brownie, 'ingredient', i_manteca,  null,    40,  'g',    4),
    (v_biz, p_brownie, 'ingredient', i_huevo,    null,    1,   'unit', 5),
    (v_biz, p_brownie, 'packaging',  i_caja,     null,    1,   'unit', 6),
    (v_biz, p_brownie, 'packaging',  i_etiqueta, null,    1,   'unit', 7),
    (v_biz, p_brownie, 'labor',      null,       v_labor, 6,   'min',  8),
    -- Torta Chocolate: costo directo $19.465
    (v_biz, p_torta,   'ingredient', i_choc,     null,    300, 'g',    1),
    (v_biz, p_torta,   'ingredient', i_ddl,      null,    300, 'g',    2),
    (v_biz, p_torta,   'ingredient', i_harina,   null,    250, 'g',    3),
    (v_biz, p_torta,   'ingredient', i_azucar,   null,    200, 'g',    4),
    (v_biz, p_torta,   'ingredient', i_manteca,  null,    200, 'g',    5),
    (v_biz, p_torta,   'ingredient', i_huevo,    null,    4,   'unit', 6),
    (v_biz, p_torta,   'packaging',  i_caja,     null,    1,   'unit', 7),
    (v_biz, p_torta,   'packaging',  i_etiqueta, null,    1,   'unit', 8),
    (v_biz, p_torta,   'labor',      null,       v_labor, 90,  'min',  9),
    -- Cookie: costo directo $915,50 (margen bajo a propósito)
    (v_biz, p_cookie,  'ingredient', i_choc,     null,    20,  'g',    1),
    (v_biz, p_cookie,  'ingredient', i_harina,   null,    25,  'g',    2),
    (v_biz, p_cookie,  'ingredient', i_azucar,   null,    15,  'g',    3),
    (v_biz, p_cookie,  'ingredient', i_manteca,  null,    15,  'g',    4),
    (v_biz, p_cookie,  'packaging',  i_etiqueta, null,    1,   'unit', 5),
    (v_biz, p_cookie,  'labor',      null,       v_labor, 3,   'min',  6);

  -- Costos variables
  insert into public.variable_costs (business_id, name, category, percent_of_sale, applies_to, share_of_sales)
  values
    (v_biz, 'Mercado Pago', 'payment_fee', 0.0639, 'all', 0.7),
    (v_biz, 'Ingresos Brutos', 'tax', 0.035, 'all', 1);

  insert into public.variable_costs (business_id, name, category, percent_of_sale, applies_to, share_of_sales)
  values (v_biz, 'MercadoLibre', 'marketplace', 0.15, 'selected', 0.6)
  returning id into v_meli;

  insert into public.variable_cost_products (variable_cost_id, product_id, business_id) values
    (v_meli, p_alfajor, v_biz),
    (v_meli, p_brownie, v_biz);

  return v_biz;
end;
$$;
