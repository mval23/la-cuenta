-- Unir personas repetidas: la voz a veces creó a la misma persona dos veces
-- ("Reibi" y "Raybin"). Todo lo de `origen` pasa a `destino` y `origen` se archiva.
--
-- Como compras y pagos no se editan, cada uno se anota de nuevo a nombre de
-- `destino` (mismo valor, día, descripción, quién y cuándo) y el original se
-- anula con motivo 'corregida', que la app no muestra. Todo o nada.

create function public.unir_personas(origen bigint, destino bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.mi_rol()::text, '') not in ('admin', 'operador') then
    raise exception 'Sin permiso para unir personas' using errcode = '42501';
  end if;
  if origen = destino then
    raise exception 'Es la misma persona' using errcode = '22023';
  end if;
  if not exists (select 1 from public.personas where id = destino and activo) then
    raise exception 'La persona con la que se une no existe o está archivada' using errcode = '22023';
  end if;
  if not exists (select 1 from public.personas where id = origen and activo) then
    raise exception 'La persona que se une no existe o ya está archivada' using errcode = '22023';
  end if;

  insert into public.compras (persona_id, descripcion, valor_pesos, fecha, texto_original, creada_en, creada_por)
  select destino, descripcion, valor_pesos, fecha, texto_original, creada_en, creada_por
  from public.compras
  where persona_id = origen and not anulada;

  update public.compras set anulada = true, anulada_motivo = 'corregida'
  where persona_id = origen and not anulada;

  insert into public.pagos (persona_id, valor_pesos, tipo, fecha, creado_en, creado_por)
  select destino, valor_pesos, tipo, fecha, creado_en, creado_por
  from public.pagos
  where persona_id = origen and not anulado;

  update public.pagos set anulado = true, anulado_motivo = 'corregida'
  where persona_id = origen and not anulado;

  update public.personas set activo = false where id = origen;
end;
$$;

revoke execute on function public.unir_personas(bigint, bigint) from public, anon;
grant execute on function public.unir_personas(bigint, bigint) to authenticated;
