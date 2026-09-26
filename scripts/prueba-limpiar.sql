-- Deshace los datos de la prueba con Amparo (ver scripts/prueba-preparar.sql).
-- Se corre al terminar la prueba:
--
--   npx supabase db query --linked "$(cat scripts/prueba-limpiar.sql)"
--
-- Nada se borra, como en toda la app: se anula todo lo que se anotó a las
-- personas de "Prueba" y "Prueba 2" (también lo que Amparo anotó durante la
-- prueba) y se archivan esas personas y los dos departamentos. Así no cuentan
-- en Cobrar, en los PDF ni en el dictado.
--
-- Ojo: si en la prueba se pasó a alguien de "Prueba" a un departamento real,
-- primero hay que devolverlo a "Prueba 2" desde la app.

do $$
declare
  departamentos_prueba bigint[] := array(
    select id from public.departamentos where lower(btrim(nombre)) in ('prueba', 'prueba 2')
  );
  personas_prueba bigint[] := array(
    select id from public.personas where departamento_id = any(departamentos_prueba)
  );
begin
  update public.compras set anulada = true, anulada_motivo = 'prueba'
  where persona_id = any(personas_prueba) and not anulada;
  update public.pagos set anulado = true, anulado_motivo = 'prueba'
  where persona_id = any(personas_prueba) and not anulado;
  update public.personas set activo = false where id = any(personas_prueba);
  update public.departamentos set activo = false where id = any(departamentos_prueba);
end;
$$;

-- Debe quedar todo archivado y en cero. (Sin la vista saldos: solo responde
-- a quien entra con sesión de la app.)
select d.nombre as departamento, d.activo, p.nombre as persona, p.activo as persona_activa,
       coalesce((select sum(valor_pesos) from public.compras c where c.persona_id = p.id and not c.anulada), 0)
       - coalesce((select sum(valor_pesos) from public.pagos g where g.persona_id = p.id and not g.anulado), 0) as debe
from public.departamentos d
left join public.personas p on p.departamento_id = d.id
where lower(btrim(d.nombre)) in ('prueba', 'prueba 2')
order by d.nombre, p.nombre;
