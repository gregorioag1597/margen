-- =====================================================================
-- Margen · Limpieza total (SOLO para desarrollo)
-- Borra todas las tablas, funciones y tipos creados por las migraciones
-- 001, 002 y 003, para poder ejecutarlas de nuevo desde cero.
-- ATENCIÓN: borra todos los datos de Margen. No toca los usuarios de Auth.
-- =====================================================================
begin;

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists
  public.scenarios,
  public.variable_cost_products,
  public.product_price_history,
  public.product_components,
  public.products,
  public.variable_costs,
  public.fixed_costs,
  public.labor_rates,
  public.ingredient_price_history,
  public.ingredients,
  public.business_members,
  public.businesses,
  public.profiles
cascade;

drop function if exists public.create_demo_business() cascade;
drop function if exists public.create_business(text, public.business_type, text, boolean) cascade;
drop function if exists public.is_business_member(uuid) cascade;
drop function if exists public.is_business_owner(uuid) cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.ingredients_touch_price() cascade;
drop function if exists public.ingredients_log_price() cascade;
drop function if exists public.products_touch_price() cascade;
drop function if exists public.products_log_price() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.unit_family_of(public.unit_code) cascade;
drop function if exists public.unit_factor(public.unit_code) cascade;

drop type if exists
  public.business_type,
  public.member_role,
  public.unit_family,
  public.unit_code,
  public.component_kind,
  public.fixed_cost_category,
  public.variable_cost_category,
  public.variable_cost_scope,
  public.scenario_status
cascade;

commit;
