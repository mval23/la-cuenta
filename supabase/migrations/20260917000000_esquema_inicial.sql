-- Esquema inicial de La Cuenta: crédito y cobro de la cocina.
-- Reglas clave:
--   * El dinero se guarda en pesos enteros (sin decimales).
--   * Nada se borra: compras y pagos se anulan.
--   * El saldo es continuo: compras activas menos pagos activos (no hay "quincenas").
--   * La compra guarda el departamento que tenía la persona en ese momento.
--   * Solo acceden usuarias con fila en `perfiles`; sin perfil no se ve nada.

-- Roles ------------------------------------------------------------------

create type public.rol_usuario as enum ('admin', 'operador', 'cocina');

create table public.perfiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  nombre    text not null,
  rol       public.rol_usuario not null,
  creado_en timestamptz not null default now()
);

create function public.mi_rol()
returns public.rol_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select rol from public.perfiles where id = (select auth.uid());
$$;

create function public.hoy_bogota()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

-- Departamentos ----------------------------------------------------------

create table public.departamentos (
  id        bigint generated always as identity primary key,
  nombre    text not null check (btrim(nombre) <> ''),
  -- Otras formas de decir el nombre al dictar, p. ej. {"te de hache"} para TDH.
  alias     text[] not null default '{}',
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

create unique index departamentos_nombre_unico
  on public.departamentos (lower(btrim(nombre)));

-- Personas ---------------------------------------------------------------

create table public.personas (
  id              bigint generated always as identity primary key,
  nombre          text not null check (btrim(nombre) <> ''),
  departamento_id bigint not null references public.departamentos (id),
  activo          boolean not null default true,
  creada_en       timestamptz not null default now()
);

-- Dos personas activas no pueden llamarse igual en el mismo departamento.
create unique index personas_nombre_departamento_unico
  on public.personas (lower(btrim(nombre)), departamento_id)
  where activo;

create index personas_departamento_idx on public.personas (departamento_id);

-- Compras ----------------------------------------------------------------

create table public.compras (
  id              bigint generated always as identity primary key,
  persona_id      bigint not null references public.personas (id),
  -- Lo llena el trigger con el departamento actual de la persona.
  departamento_id bigint not null references public.departamentos (id),
  descripcion     text not null check (btrim(descripcion) <> ''),
  valor_pesos     integer not null check (valor_pesos > 0),
  fecha           date not null default public.hoy_bogota(),
  -- Lo que se dictó, tal cual, para revisar errores del reconocimiento.
  texto_original  text,
  creada_en       timestamptz not null default now(),
  creada_por      uuid not null default auth.uid() references auth.users (id),
  anulada         boolean not null default false,
  anulada_motivo  text,
  anulada_en      timestamptz,
  anulada_por     uuid references auth.users (id)
);

create index compras_persona_idx on public.compras (persona_id) where not anulada;
create index compras_fecha_idx on public.compras (fecha);

create function public.compras_fijar_departamento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select departamento_id into new.departamento_id
  from public.personas
  where id = new.persona_id;
  return new;
end;
$$;

create trigger compras_fijar_departamento
  before insert on public.compras
  for each row execute function public.compras_fijar_departamento();

-- Pagos ------------------------------------------------------------------

create type public.tipo_pago as enum ('total', 'abono');

create table public.pagos (
  id             bigint generated always as identity primary key,
  persona_id     bigint not null references public.personas (id),
  valor_pesos    integer not null check (valor_pesos > 0),
  tipo           public.tipo_pago not null,
  fecha          date not null default public.hoy_bogota(),
  creado_en      timestamptz not null default now(),
  creado_por     uuid not null default auth.uid() references auth.users (id),
  anulado        boolean not null default false,
  anulado_motivo text,
  anulado_en     timestamptz,
  anulado_por    uuid references auth.users (id)
);

create index pagos_persona_idx on public.pagos (persona_id) where not anulado;

-- Anulación: registra quién y cuándo -------------------------------------

create function public.compras_registrar_anulacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.anulada and not old.anulada then
    new.anulada_en := now();
    new.anulada_por := auth.uid();
  elsif not new.anulada then
    new.anulada_en := null;
    new.anulada_por := null;
    new.anulada_motivo := null;
  end if;
  return new;
end;
$$;

create trigger compras_registrar_anulacion
  before update on public.compras
  for each row execute function public.compras_registrar_anulacion();

create function public.pagos_registrar_anulacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.anulado and not old.anulado then
    new.anulado_en := now();
    new.anulado_por := auth.uid();
  elsif not new.anulado then
    new.anulado_en := null;
    new.anulado_por := null;
    new.anulado_motivo := null;
  end if;
  return new;
end;
$$;

create trigger pagos_registrar_anulacion
  before update on public.pagos
  for each row execute function public.pagos_registrar_anulacion();

-- Saldos -----------------------------------------------------------------

create view public.saldos
with (security_invoker = true)
as
select
  p.id              as persona_id,
  p.nombre,
  p.departamento_id,
  d.nombre          as departamento,
  p.activo,
  coalesce(c.total, 0)                         as comprado,
  coalesce(pg.total, 0)                        as pagado,
  coalesce(c.total, 0) - coalesce(pg.total, 0) as saldo
from public.personas p
join public.departamentos d on d.id = p.departamento_id
left join (
  select persona_id, sum(valor_pesos)::bigint as total
  from public.compras where not anulada group by persona_id
) c on c.persona_id = p.id
left join (
  select persona_id, sum(valor_pesos)::bigint as total
  from public.pagos where not anulado group by persona_id
) pg on pg.persona_id = p.id
-- La cocina no debe ver saldos.
where public.mi_rol() in ('admin', 'operador');

-- Permisos de columnas ---------------------------------------------------
-- Compras y pagos no se editan: se anulan y se registran de nuevo.

revoke update on public.compras from anon, authenticated;
grant update (anulada, anulada_motivo) on public.compras to authenticated;

revoke update on public.pagos from anon, authenticated;
grant update (anulado, anulado_motivo) on public.pagos to authenticated;

revoke delete on public.compras, public.pagos, public.personas, public.departamentos
  from anon, authenticated;

-- Row Level Security -----------------------------------------------------

alter table public.perfiles      enable row level security;
alter table public.departamentos enable row level security;
alter table public.personas      enable row level security;
alter table public.compras       enable row level security;
alter table public.pagos         enable row level security;

create policy "ver mi perfil o todos si soy admin" on public.perfiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.mi_rol()) = 'admin');

create policy "ver departamentos" on public.departamentos
  for select to authenticated
  using ((select public.mi_rol()) is not null);

create policy "crear departamentos" on public.departamentos
  for insert to authenticated
  with check ((select public.mi_rol()) in ('admin', 'operador'));

create policy "editar departamentos" on public.departamentos
  for update to authenticated
  using ((select public.mi_rol()) in ('admin', 'operador'))
  with check ((select public.mi_rol()) in ('admin', 'operador'));

create policy "ver personas" on public.personas
  for select to authenticated
  using ((select public.mi_rol()) is not null);

create policy "crear personas" on public.personas
  for insert to authenticated
  with check ((select public.mi_rol()) is not null);

create policy "editar personas" on public.personas
  for update to authenticated
  using ((select public.mi_rol()) in ('admin', 'operador'))
  with check ((select public.mi_rol()) in ('admin', 'operador'));

create policy "ver compras" on public.compras
  for select to authenticated
  using (
    (select public.mi_rol()) in ('admin', 'operador')
    or (creada_por = (select auth.uid()) and fecha = public.hoy_bogota())
  );

create policy "registrar compras" on public.compras
  for insert to authenticated
  with check (
    (select public.mi_rol()) is not null
    and creada_por = (select auth.uid())
  );

create policy "anular compras" on public.compras
  for update to authenticated
  using ((select public.mi_rol()) in ('admin', 'operador'))
  with check ((select public.mi_rol()) in ('admin', 'operador'));

create policy "ver pagos" on public.pagos
  for select to authenticated
  using ((select public.mi_rol()) in ('admin', 'operador'));

create policy "registrar pagos" on public.pagos
  for insert to authenticated
  with check (
    (select public.mi_rol()) in ('admin', 'operador')
    and creado_por = (select auth.uid())
  );

create policy "anular pagos" on public.pagos
  for update to authenticated
  using ((select public.mi_rol()) in ('admin', 'operador'))
  with check ((select public.mi_rol()) in ('admin', 'operador'));
