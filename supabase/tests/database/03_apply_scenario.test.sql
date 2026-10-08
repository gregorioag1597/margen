-- =====================================================================
-- Fase 7 · apply_scenario(): todo o nada, y solo dentro del propio negocio
-- Ejecutar con: supabase test db
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'dani@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'eva@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
do $$ begin
  perform set_config('test.biz', public.create_business('Negocio Dani', 'gastronomia')::text, true);
end $$;
insert into public.products (id, business_id, name, price, monthly_units_estimate)
values ('dddddddd-0000-0000-0000-000000000001', current_setting('test.biz')::uuid, 'Alfajor', 6000, 100);

select is(
  public.apply_scenario(current_setting('test.biz')::uuid, 'Precios +10 %',
    '[{"target":"product_price","id":"dddddddd-0000-0000-0000-000000000001","value":"6600"},
      {"target":"product_units","id":"dddddddd-0000-0000-0000-000000000001","value":"110"}]'::jsonb),
  2,
  'Aplica los dos cambios'
);

select results_eq(
  $$ select price, monthly_units_estimate from public.products where id = 'dddddddd-0000-0000-0000-000000000001' $$,
  $$ values (6600.00::numeric(14,2), 110) $$,
  'Los datos quedan actualizados'
);

select is(
  (select count(*)::int from public.product_price_history where product_id = 'dddddddd-0000-0000-0000-000000000001'),
  2,
  'El cambio de precio queda en el historial'
);

select throws_ok(
  $$ select public.apply_scenario(current_setting('test.biz')::uuid, 'Malo',
       '[{"target":"product_price","id":"dddddddd-0000-0000-0000-000000000001","value":"7000"},
         {"target":"product_price","id":"dddddddd-0000-0000-0000-000000000001","value":"0"}]'::jsonb) $$,
  '23514', null,
  'Si un cambio falla, no se aplica ninguno'
);

select is(
  (select price from public.products where id = 'dddddddd-0000-0000-0000-000000000001'),
  6600.00::numeric,
  'El precio sigue en 6600 (nada a medias)'
);

-- Eva no puede aplicar escenarios en el negocio de Dani
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select throws_ok(
  $$ select public.apply_scenario(current_setting('test.biz')::uuid, 'Intruso',
       '[{"target":"product_price","id":"dddddddd-0000-0000-0000-000000000001","value":"1"}]'::jsonb) $$,
  '42501', null,
  'Otro usuario no puede aplicar escenarios en tu negocio'
);

reset role;
select * from finish();
rollback;
