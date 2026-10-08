-- =====================================================================
-- Fase 9 · Movimientos: aislamiento por negocio y reglas por tipo
-- Ejecutar con: supabase test db
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666666', 'fede@test.local'),
  ('77777777-7777-7777-7777-777777777777', 'gabi@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
do $$ begin
  perform set_config('test.biz', public.create_business('Negocio Fede', 'comercio')::text, true);
end $$;
insert into public.products (id, business_id, name, price)
values ('ffffffff-0000-0000-0000-000000000001', current_setting('test.biz')::uuid, 'Alfajor', 6000);

select lives_ok(
  $$ insert into public.movements (business_id, kind, occurred_on, concept, category, amount, product_id, payment_method)
     values (current_setting('test.biz')::uuid, 'income', '2026-10-05', 'Venta mostrador', 'sale', 12000,
             'ffffffff-0000-0000-0000-000000000001', 'cash') $$,
  'Registra un ingreso con producto y medio de pago'
);

select lives_ok(
  $$ insert into public.movements (business_id, kind, occurred_on, concept, category, amount, supplier)
     values (current_setting('test.biz')::uuid, 'expense', '2026-10-06', 'Compra chocolate', 'raw_materials', 18000, 'Distribuidora Sur') $$,
  'Registra un egreso con proveedor'
);

select throws_ok(
  $$ insert into public.movements (business_id, kind, concept, category, amount)
     values (current_setting('test.biz')::uuid, 'income', 'Mal', 'rent', 100) $$,
  '23514', null,
  'Un ingreso no puede usar una categoría de egreso'
);

select throws_ok(
  $$ insert into public.movements (business_id, kind, concept, category, amount, payment_method)
     values (current_setting('test.biz')::uuid, 'expense', 'Mal', 'rent', 100, 'cash') $$,
  '23514', null,
  'Un egreso no puede tener medio de pago (campo de ingresos)'
);

select throws_ok(
  $$ insert into public.movements (business_id, kind, concept, category, amount)
     values (current_setting('test.biz')::uuid, 'expense', 'Cero', 'other', 0) $$,
  '23514', null,
  'El importe tiene que ser mayor a 0'
);

-- Borrar el producto no borra el ingreso: solo se pierde el vínculo.
delete from public.products where id = 'ffffffff-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.movements where business_id = current_setting('test.biz')::uuid and kind = 'income' and product_id is null),
  1,
  'Al borrar el producto el ingreso queda, sin vínculo'
);

-- Otro usuario
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
select is(
  (select count(*)::int from public.movements),
  0,
  'Otro usuario no ve los movimientos'
);
select throws_ok(
  $$ insert into public.movements (business_id, kind, concept, category, amount)
     values (current_setting('test.biz')::uuid, 'expense', 'Intruso', 'other', 1) $$,
  '42501', null,
  'Otro usuario no puede registrar movimientos en tu negocio'
);

reset role;
select * from finish();
rollback;
