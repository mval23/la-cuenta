-- Datos para la prueba con Amparo (docs/prueba-con-amparo.md). Se corre justo
-- antes de la prueba:
--
--   npx supabase db query --linked "$(cat scripts/prueba-preparar.sql)"
--
-- Crea los departamentos "Prueba" y "Prueba 2", y en "Prueba" a Carlos Pérez,
-- Carlos Gómez (mismo primer nombre, para ver si elige bien) y Marta Ruiz.
-- A Carlos Gómez le anota dos compras recientes y una de hace cuatro meses,
-- para que su historial muestre "Antes del …: debía $11.000". La app no deja
-- anotar compras de más de 60 días atrás; por eso se hace aquí.
--
-- Se puede correr otra vez: reactiva lo que ya existía y no repite compras.
-- Todo se deshace con scripts/prueba-limpiar.sql.

do $$
declare
  -- Las compras quedan a nombre de la administradora: aquí no hay sesión.
  admin uuid := (select id from public.perfiles where rol = 'admin' order by creado_en limit 1);
  prueba bigint;
  gomez bigint;
  un_nombre text;
begin
  if admin is null then
    raise exception 'No hay una usuaria administradora en perfiles.';
  end if;

  foreach un_nombre in array array['Prueba', 'Prueba 2'] loop
    update public.departamentos set activo = true where lower(btrim(nombre)) = lower(un_nombre);
    if not found then
      insert into public.departamentos (nombre) values (un_nombre);
    end if;
  end loop;
  select id into prueba from public.departamentos where lower(btrim(nombre)) = 'prueba';

  foreach un_nombre in array array['Carlos Pérez', 'Carlos Gómez', 'Marta Ruiz'] loop
    update public.personas set activo = true
    where departamento_id = prueba and lower(btrim(nombre)) = lower(un_nombre);
    if not found then
      insert into public.personas (nombre, departamento_id) values (un_nombre, prueba);
    end if;
  end loop;
  select id into gomez from public.personas where departamento_id = prueba and nombre = 'Carlos Gómez';

  if not exists (select 1 from public.compras where persona_id = gomez and not anulada) then
    insert into public.compras (persona_id, descripcion, valor_pesos, fecha, creada_por) values
      (gomez, 'Almuerzo', 11000, public.hoy_bogota() - 120, admin),
      (gomez, 'Almuerzo', 12000, public.hoy_bogota() - 2, admin),
      (gomez, 'Desayuno', 6000, public.hoy_bogota() - 1, admin);
  end if;
end;
$$;

-- Lo que quedó, para revisar antes de empezar. (La vista saldos no sirve
-- aquí: solo responde a quien entra con sesión de la app.)
select d.nombre as departamento, p.nombre as persona,
       coalesce((select sum(valor_pesos) from public.compras c where c.persona_id = p.id and not c.anulada), 0)
       - coalesce((select sum(valor_pesos) from public.pagos g where g.persona_id = p.id and not g.anulado), 0) as debe
from public.departamentos d
left join public.personas p on p.departamento_id = d.id and p.activo
where lower(btrim(d.nombre)) in ('prueba', 'prueba 2')
order by d.nombre, p.nombre;
