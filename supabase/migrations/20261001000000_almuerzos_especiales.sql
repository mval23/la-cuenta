-- Almuerzos especiales: una compra puede marcarse como especial para que
-- salga aparte de lo normal. Se suma a la deuda igual que cualquier compra.
-- Lo anotado antes queda como normal.

alter table public.compras add column especial boolean not null default false;

-- Cuenta de la quincena ----------------------------------------------------
-- Igual que antes, más `especiales`: la parte de `comprado` que fue especial.
-- Cambia lo que devuelve, así que hay que borrarla y crearla de nuevo.

drop function public.cuenta_de_quincena(date, date);

create function public.cuenta_de_quincena(desde date, hasta date)
returns table (
  persona_id      bigint,
  nombre          text,
  departamento_id bigint,
  departamento    text,
  anterior        bigint,
  comprado        bigint,
  especiales      bigint,
  pagado          bigint,
  saldo           bigint
)
language sql
stable
set search_path = ''
as $$
  with movimientos as (
    select c.persona_id, c.fecha, c.valor_pesos as compra, c.especial, 0 as pago
    from public.compras c
    where not c.anulada and c.fecha <= hasta
    union all
    select p.persona_id, p.fecha, 0, false, p.valor_pesos
    from public.pagos p
    where not p.anulado and p.fecha <= hasta
  ),
  por_persona as (
    select
      m.persona_id,
      coalesce(sum(m.compra - m.pago) filter (where m.fecha < desde), 0)::bigint as anterior,
      coalesce(sum(m.compra) filter (where m.fecha >= desde), 0)::bigint as comprado,
      coalesce(sum(m.compra) filter (where m.fecha >= desde and m.especial), 0)::bigint as especiales,
      coalesce(sum(m.pago) filter (where m.fecha >= desde), 0)::bigint as pagado,
      sum(m.compra - m.pago)::bigint as saldo
    from movimientos m
    group by m.persona_id
  )
  select p.id, p.nombre, p.departamento_id, d.nombre, m.anterior, m.comprado, m.especiales, m.pagado, m.saldo
  from por_persona m
  join public.personas p on p.id = m.persona_id
  join public.departamentos d on d.id = p.departamento_id
  -- Igual que la vista de saldos: la cocina no ve deudas.
  where public.mi_rol() in ('admin', 'operador');
$$;

revoke execute on function public.cuenta_de_quincena(date, date) from public, anon;
grant execute on function public.cuenta_de_quincena(date, date) to authenticated;

-- Unir personas --------------------------------------------------------------
-- Igual que antes, pero lo especial sigue siendo especial al pasar a la otra.

create or replace function public.unir_personas(origen bigint, destino bigint)
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

  insert into public.compras (persona_id, descripcion, valor_pesos, fecha, texto_original, especial, creada_en, creada_por)
  select destino, descripcion, valor_pesos, fecha, texto_original, especial, creada_en, creada_por
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
