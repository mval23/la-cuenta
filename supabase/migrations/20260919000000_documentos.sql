-- Documentos en PDF: la cuenta de la quincena (quién debe cuánto) y las
-- cuentas de cobro que Amparo le pasa a la empresa.

-- Cuenta de la quincena --------------------------------------------------
-- Para cada persona: lo que venía debiendo antes de `desde`, lo que compró y
-- pagó entre `desde` y `hasta`, y lo que debía al terminar `hasta`. Se suma en
-- la base porque la API entrega máximo 1000 filas y en una quincena hay más.

create function public.cuenta_de_quincena(desde date, hasta date)
returns table (
  persona_id      bigint,
  nombre          text,
  departamento_id bigint,
  departamento    text,
  anterior        bigint,
  comprado        bigint,
  pagado          bigint,
  saldo           bigint
)
language sql
stable
set search_path = ''
as $$
  with movimientos as (
    select c.persona_id, c.fecha, c.valor_pesos as compra, 0 as pago
    from public.compras c
    where not c.anulada and c.fecha <= hasta
    union all
    select p.persona_id, p.fecha, 0, p.valor_pesos
    from public.pagos p
    where not p.anulado and p.fecha <= hasta
  ),
  por_persona as (
    select
      m.persona_id,
      coalesce(sum(m.compra - m.pago) filter (where m.fecha < desde), 0)::bigint as anterior,
      coalesce(sum(m.compra) filter (where m.fecha >= desde), 0)::bigint as comprado,
      coalesce(sum(m.pago) filter (where m.fecha >= desde), 0)::bigint as pagado,
      sum(m.compra - m.pago)::bigint as saldo
    from movimientos m
    group by m.persona_id
  )
  select p.id, p.nombre, p.departamento_id, d.nombre, m.anterior, m.comprado, m.pagado, m.saldo
  from por_persona m
  join public.personas p on p.id = m.persona_id
  join public.departamentos d on d.id = p.departamento_id
  -- Igual que la vista de saldos: la cocina no ve deudas.
  where public.mi_rol() in ('admin', 'operador');
$$;

revoke execute on function public.cuenta_de_quincena(date, date) from public, anon;
grant execute on function public.cuenta_de_quincena(date, date) to authenticated;

-- Datos de la cuenta de cobro ---------------------------------------------
-- Una sola fila. Quién cobra (nombre, cédula, dónde consignar) va aquí y no
-- en el código de la app, que es público. También recuerda la última empresa
-- a la que se le cobró, para no escribirla cada vez.

create table public.datos_de_cobro (
  id             boolean primary key default true check (id),
  nombre         text not null default '',
  documento      text not null default '',
  ciudad         text not null default 'Neiva',
  -- "Consignar en la cuenta de ahorros Bancolombia No. ..."
  nota           text not null default '',
  cliente_nombre text not null default '',
  cliente_nit    text not null default '',
  concepto       text not null default 'Servicio de comedor y otros',
  cambiado_en    timestamptz not null default now()
);

insert into public.datos_de_cobro default values;

revoke insert, delete, truncate on public.datos_de_cobro from anon, authenticated;
revoke update on public.datos_de_cobro from anon, authenticated;
grant update (nombre, documento, ciudad, nota, cliente_nombre, cliente_nit, concepto, cambiado_en)
  on public.datos_de_cobro to authenticated;

alter table public.datos_de_cobro enable row level security;

create policy "ver datos de cobro" on public.datos_de_cobro
  for select to authenticated
  using ((select public.mi_rol()) in ('admin', 'operador'));

create policy "cambiar datos de cobro" on public.datos_de_cobro
  for update to authenticated
  using ((select public.mi_rol()) in ('admin', 'operador'))
  with check ((select public.mi_rol()) in ('admin', 'operador'));
