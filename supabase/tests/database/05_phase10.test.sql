-- =====================================================================
-- Fase 10 · rinde, merma y vínculos de movimientos
-- Ejecutar con: supabase test db
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values ('88888888-8888-8888-8888-888888888888', 'hana@test.local');
insert into public.businesses (id, name, business_type) values ('88888888-0000-0000-0000-000000000000', 'Negocio Hana', 'gastronomia');
insert into public.businesses (id, name, business_type) values ('99999999-0000-0000-0000-000000000000', 'Otro negocio', 'otro');
insert into public.fixed_costs (id, business_id, name, category, monthly_amount)
values ('88888888-0000-0000-0000-0000000000f1', '88888888-0000-0000-0000-000000000000', 'Alquiler', 'rent', 450000);
insert into public.ingredients (id, business_id, name, purchase_unit, purchase_qty, purchase_price)
values ('88888888-0000-0000-0000-0000000000a1', '88888888-0000-0000-0000-000000000000', 'Frutillas', 'kg', 1, 4000);

select has_column('public', 'products', 'batch_yield', 'La columna batch_yield existe');

select throws_ok(
  $$ insert into public.products (business_id, name, batch_yield) values ('88888888-0000-0000-0000-000000000000', 'Mal', 0) $$,
  '23514', null, 'El rinde tiene que ser mayor a 0'
);

select throws_ok(
  $$ update public.ingredients set waste_pct = 0.95 where id = '88888888-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'La merma no puede superar el 90 %'
);

select lives_ok(
  $$ insert into public.movements (business_id, kind, concept, category, amount, fixed_cost_id)
     values ('88888888-0000-0000-0000-000000000000', 'expense', 'Alquiler octubre', 'rent', 450000, '88888888-0000-0000-0000-0000000000f1') $$,
  'Un egreso se vincula a su costo fijo'
);

select throws_ok(
  $$ insert into public.movements (business_id, kind, concept, category, amount, fixed_cost_id)
     values ('99999999-0000-0000-0000-000000000000', 'expense', 'Cruzado', 'rent', 1, '88888888-0000-0000-0000-0000000000f1') $$,
  '23503', null, 'No se puede vincular un costo fijo de otro negocio'
);

select throws_ok(
  $$ insert into public.movements (business_id, kind, concept, category, amount, ingredient_id)
     values ('88888888-0000-0000-0000-000000000000', 'expense', 'Sin cantidad', 'raw_materials', 1, '88888888-0000-0000-0000-0000000000a1') $$,
  '23514', null, 'Una compra de insumo necesita cantidad y unidad'
);

select throws_ok(
  $$ insert into public.movements (business_id, kind, concept, category, amount, fixed_cost_id)
     values ('88888888-0000-0000-0000-000000000000', 'income', 'Mal', 'sale', 1, '88888888-0000-0000-0000-0000000000f1') $$,
  '23514', null, 'Un ingreso no se vincula a costos fijos'
);

select * from finish();
rollback;
