-- =====================================================================
-- Margen · Fase 7 · Aplicar un escenario del simulador
--
-- Aplica todos los cambios en una sola transacción: o se aplican todos o
-- ninguno. security invoker: corre con los permisos del usuario, así la
-- RLS sigue protegiendo cada UPDATE. Los historiales de precios se generan
-- solos por los triggers existentes.
--
-- p_items: [{"target":"product_price","id":"<uuid>","value":"6600"}, ...]
-- =====================================================================
create function public.apply_scenario(p_business_id uuid, p_name text, p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  affected integer;
  total integer := 0;
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'No tenés acceso a este negocio' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El escenario no tiene cambios' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_items) loop
    case item ->> 'target'
      when 'product_price' then
        update public.products set price = (item ->> 'value')::numeric
        where id = (item ->> 'id')::uuid and business_id = p_business_id;
      when 'product_units' then
        update public.products set monthly_units_estimate = (item ->> 'value')::integer
        where id = (item ->> 'id')::uuid and business_id = p_business_id;
      when 'ingredient_price' then
        update public.ingredients set purchase_price = (item ->> 'value')::numeric
        where id = (item ->> 'id')::uuid and business_id = p_business_id;
      when 'variable_cost_percent' then
        update public.variable_costs set percent_of_sale = (item ->> 'value')::numeric
        where id = (item ->> 'id')::uuid and business_id = p_business_id;
      when 'fixed_cost_amount' then
        update public.fixed_costs set monthly_amount = (item ->> 'value')::numeric
        where id = (item ->> 'id')::uuid and business_id = p_business_id;
      else
        raise exception 'Cambio no reconocido: %', item ->> 'target' using errcode = '22023';
    end case;

    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'No se encontró uno de los datos a cambiar' using errcode = 'P0002';
    end if;
    total := total + 1;
  end loop;

  insert into public.scenarios (business_id, name, changes, status, applied_at)
  values (p_business_id, left(coalesce(nullif(btrim(p_name), ''), 'Escenario'), 120), p_items, 'applied', now());

  return total;
end;
$$;

revoke execute on function public.apply_scenario(uuid, text, jsonb) from public, anon;
grant execute on function public.apply_scenario(uuid, text, jsonb) to authenticated;
