-- =====================================================================
-- Fase 1 · Tests de integridad de datos (unidades, componentes, límites)
-- Ejecutar con: supabase test db
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'caro@test.local');
insert into public.businesses (id, name, business_type)
values ('cccccccc-0000-0000-0000-000000000000', 'Negocio Caro', 'fabricacion');

insert into public.ingredients (id, business_id, name, purchase_unit, purchase_qty, purchase_price) values
  ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000000', 'Chocolate', 'kg', 1, 18000),
  ('cccccccc-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000000', 'Leche', 'l', 2, 3000);
insert into public.labor_rates (id, business_id, hourly_rate, is_default)
values ('cccccccc-0000-0000-0000-0000000000f1', 'cccccccc-0000-0000-0000-000000000000', 6000, true);
insert into public.products (id, business_id, name, price)
values ('cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000000', 'Alfajor', 6000);

-- Unidades
select is(
  (select purchase_qty_base from public.ingredients where id = 'cccccccc-0000-0000-0000-000000000001'),
  1000.0000::numeric,
  '1 kg se guarda como 1000 g'
);

select is(
  (select purchase_qty_base from public.ingredients where id = 'cccccccc-0000-0000-0000-000000000002'),
  2000.0000::numeric,
  '2 l se guardan como 2000 ml'
);

insert into public.product_components (business_id, product_id, kind, ingredient_id, quantity, unit)
values ('cccccccc-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-0000000000a1',
        'ingredient', 'cccccccc-0000-0000-0000-000000000001', 0.08, 'kg');

select is(
  (select quantity_base from public.product_components
   where ingredient_id = 'cccccccc-0000-0000-0000-000000000001'),
  80.0000::numeric,
  'Un componente de 0,08 kg se guarda como 80 g'
);

select throws_ok(
  $$ insert into public.product_components (business_id, product_id, kind, ingredient_id, quantity, unit)
     values ('cccccccc-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-0000000000a1',
             'ingredient', 'cccccccc-0000-0000-0000-000000000001', 80, 'ml') $$,
  '23503', null,
  'No se puede usar en ml un insumo comprado en kg'
);

select throws_ok(
  $$ update public.ingredients set purchase_unit = 'l'
     where id = 'cccccccc-0000-0000-0000-000000000001' $$,
  '23503', null,
  'No se puede cambiar de kg a litros un insumo que está en uso'
);

select throws_ok(
  $$ delete from public.ingredients where id = 'cccccccc-0000-0000-0000-000000000001' $$,
  '23503', null,
  'No se puede borrar un insumo en uso (hay que archivarlo)'
);

-- Componentes
insert into public.product_components (business_id, product_id, kind, labor_rate_id, quantity, unit)
values ('cccccccc-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-0000000000a1',
        'labor', 'cccccccc-0000-0000-0000-0000000000f1', 0.2, 'h');

select is(
  (select quantity_base from public.product_components where kind = 'labor'),
  12.0000::numeric,
  '0,2 h de mano de obra se guardan como 12 minutos'
);

select throws_ok(
  $$ insert into public.product_components (business_id, product_id, kind, labor_rate_id, quantity, unit)
     values ('cccccccc-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-0000000000a1',
             'labor', 'cccccccc-0000-0000-0000-0000000000f1', 10, 'g') $$,
  '23514', null,
  'La mano de obra solo acepta horas o minutos'
);

-- Límites
select throws_ok(
  $$ insert into public.ingredients (business_id, name, purchase_unit, purchase_qty, purchase_price)
     values ('cccccccc-0000-0000-0000-000000000000', 'Vacío', 'kg', 0, 100) $$,
  '23514', null,
  'La cantidad comprada no puede ser 0'
);

select throws_ok(
  $$ update public.products set target_margin = 1
     where id = 'cccccccc-0000-0000-0000-0000000000a1' $$,
  '23514', null,
  'El margen objetivo debe ser menor a 100 %'
);

select throws_ok(
  $$ insert into public.variable_costs (business_id, name, percent_of_sale, amount_per_unit)
     values ('cccccccc-0000-0000-0000-000000000000', 'Nada', 0, 0) $$,
  '23514', null,
  'Un costo variable necesita un % o un monto por unidad'
);

select throws_ok(
  $$ insert into public.variable_costs (business_id, name, percent_of_sale, share_of_sales)
     values ('cccccccc-0000-0000-0000-000000000000', 'MercadoLibre', 0.15, 1.2) $$,
  '23514', null,
  'El % de ventas al que aplica no puede superar 100 %'
);

select * from finish();
rollback;
