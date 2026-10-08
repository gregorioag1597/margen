-- =====================================================================
-- Fase 1 · Tests de seguridad multi-tenant
-- Ejecutar con: supabase test db
-- Todo corre dentro de una transacción que se revierte al final.
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- Usuarios de prueba (como superusuario)
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@test.local',  '{"full_name":"Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'beto@test.local', '{"full_name":"Beto"}');

select is(
  (select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Ana',
  'El registro crea el perfil con el nombre'
);

-- ---------------------------------------------------------------- Ana
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$ begin
  perform set_config('test.biz_a', public.create_business('Negocio Ana', 'gastronomia')::text, true);
end $$;

insert into public.ingredients (id, business_id, name, purchase_unit, purchase_qty, purchase_price)
values ('aaaaaaaa-0000-0000-0000-000000000001', current_setting('test.biz_a')::uuid, 'Chocolate', 'kg', 1, 18000);

-- ---------------------------------------------------------------- Beto
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$ begin
  perform set_config('test.biz_b', public.create_business('Negocio Beto', 'comercio')::text, true);
end $$;

insert into public.ingredients (id, business_id, name, purchase_unit, purchase_qty, purchase_price)
values ('bbbbbbbb-0000-0000-0000-000000000001', current_setting('test.biz_b')::uuid, 'Caja', 'unit', 100, 25000);

select is(
  (select count(*)::int from public.businesses),
  1,
  'Beto ve solo su propio negocio'
);

select is(
  (select count(*)::int from public.ingredients where business_id = current_setting('test.biz_a')::uuid),
  0,
  'Beto no ve insumos de Ana'
);

select is(
  (select count(*)::int from public.ingredient_price_history where business_id = current_setting('test.biz_a')::uuid),
  0,
  'Beto no ve el historial de Ana'
);

select throws_ok(
  $$ insert into public.ingredients (business_id, name, purchase_unit, purchase_qty, purchase_price)
     values (current_setting('test.biz_a')::uuid, 'Intruso', 'g', 1, 1) $$,
  '42501', null,
  'Beto no puede crear insumos en el negocio de Ana'
);

update public.businesses set name = 'Hackeado' where id = current_setting('test.biz_a')::uuid;
update public.ingredients set purchase_price = 1 where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------- Ana otra vez
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select name from public.businesses where id = current_setting('test.biz_a')::uuid),
  'Negocio Ana',
  'Beto no pudo renombrar el negocio de Ana'
);

select is(
  (select purchase_price from public.ingredients where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  18000.00::numeric,
  'Beto no pudo cambiar precios de Ana'
);

-- Referencias cruzadas: producto de Ana con la caja de Beto
insert into public.products (id, business_id, name, price, monthly_units_estimate)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', current_setting('test.biz_a')::uuid, 'Alfajor', 6000, 100);

select throws_ok(
  $$ insert into public.product_components (business_id, product_id, kind, ingredient_id, quantity, unit)
     values (current_setting('test.biz_a')::uuid, 'aaaaaaaa-0000-0000-0000-0000000000a1',
             'packaging', 'bbbbbbbb-0000-0000-0000-000000000001', 1, 'unit') $$,
  '23503', null,
  'No se puede usar un insumo de otro negocio'
);

-- Historial
update public.ingredients set purchase_price = 22000 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.ingredients set notes = 'sin cambio de precio' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select results_eq(
  $$ select purchase_price from public.ingredient_price_history
     where ingredient_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by effective_at, purchase_price $$,
  $$ values (18000.00::numeric), (22000.00::numeric) $$,
  'Cambiar el precio agrega historial; cambiar otra cosa no'
);

select throws_ok(
  $$ insert into public.ingredient_price_history (business_id, ingredient_id, purchase_unit, purchase_qty, purchase_price)
     values (current_setting('test.biz_a')::uuid, 'aaaaaaaa-0000-0000-0000-000000000001', 'kg', 1, 1) $$,
  '42501', null,
  'El cliente no puede escribir el historial'
);

select throws_ok(
  $$ delete from public.ingredient_price_history $$,
  '42501', null,
  'El cliente no puede borrar el historial'
);

update public.products set price = 6600 where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
select is(
  (select count(*)::int from public.product_price_history where product_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  2,
  'Cambiar el precio de venta agrega historial'
);

select throws_ok(
  $$ insert into public.businesses (name, business_type) values ('Directo', 'otro') $$,
  '42501', null,
  'Los negocios solo se crean con create_business()'
);

-- Demo dentro de la cuenta
do $$ begin
  perform set_config('test.demo', public.create_demo_business()::text, true);
end $$;

select is(
  (select count(*)::int from public.products where business_id = current_setting('test.demo')::uuid),
  4,
  'El negocio demo trae 4 productos'
);

select is(
  public.create_demo_business(),
  current_setting('test.demo')::uuid,
  'create_demo_business() no duplica la demo'
);

-- ---------------------------------------------------------------- Sin sesión
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$ select count(*) from public.businesses $$,
  '42501', null,
  'Sin sesión no se accede a ningún dato'
);

reset role;
select * from finish();
rollback;
