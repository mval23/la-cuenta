-- Cuentas atrasadas: a veces las compras del martes se anotan el viernes.
-- Se puede registrar una compra con fecha de hasta 60 días atrás, nunca del
-- futuro. La cocina solo registra lo de hoy.

drop policy "registrar compras" on public.compras;

create policy "registrar compras" on public.compras
  for insert to authenticated
  with check (
    (select public.mi_rol()) is not null
    and creada_por = (select auth.uid())
    and fecha <= public.hoy_bogota()
    and (
      fecha = public.hoy_bogota()
      or (
        (select public.mi_rol()) in ('admin', 'operador')
        and fecha >= public.hoy_bogota() - 60
      )
    )
  );
