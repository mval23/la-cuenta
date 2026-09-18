#!/usr/bin/env bash
# Revisa que una base restaurada desde el respaldo diario tenga exactamente los
# mismos datos y que la app pueda seguir trabajando con ella.
#
# Uso: verificar-restauracion.sh <cadena-de-conexión> <carpeta-del-respaldo>
#
# Solo imprime conteos, nunca nombres ni valores: los registros de GitHub
# Actions no deben llevar datos de la cocina.

set -uo pipefail

db=$1
carpeta=$2
fallas=0

falla() {
  echo "::error::$1"
  fallas=$((fallas + 1))
}

consulta() {
  psql "$db" -v ON_ERROR_STOP=1 -tAq -c "$1"
}

# Compara dos CSV fila por fila, sin importar el orden, y dice cuántas filas
# hay y cuántas difieren. Una fila puede tener saltos de línea (el texto
# dictado), por eso no se compara con diff.
comparar_csv() {
  python3 - "$1" "$2" <<'PY'
import csv, sys
from collections import Counter
a, b = (Counter(tuple(f) for f in csv.reader(open(p, newline=""))) for p in sys.argv[1:])
print(f"{sum(a.values()) - 1} en el respaldo, {sum(b.values()) - 1} restauradas, "
      f"{sum((a - b).values()) + sum((b - a).values())} distintas")
sys.exit(0 if a == b else 1)
PY
}

echo "== Cada tabla, fila por fila"
for tabla in perfiles departamentos personas compras pagos; do
  psql "$db" -v ON_ERROR_STOP=1 -q \
    -c "copy (select * from public.$tabla order by 1) to stdout with csv header" > "restaurada-$tabla.csv"
  if resumen=$(comparar_csv "$carpeta/csv/$tabla.csv" "restaurada-$tabla.csv"); then
    echo "$tabla: $resumen"
  else
    falla "$tabla: $resumen"
  fi
done

echo "== Usuarias"
sin_cuenta=$(consulta "select count(*) from public.perfiles p where not exists (select 1 from auth.users u where u.id = p.id)")
sin_clave=$(consulta "select count(*) from auth.users u join public.perfiles p on p.id = u.id where coalesce(u.encrypted_password, '') = ''")
[ "$sin_cuenta" = 0 ] || falla "$sin_cuenta perfiles no tienen su cuenta en auth.users"
[ "$sin_clave" = 0 ] || falla "$sin_clave usuarias quedaron sin contraseña"
echo "Perfiles sin cuenta: $sin_cuenta. Usuarias sin contraseña: $sin_clave."

echo "== Triggers encendidos"
apagados=$(consulta "select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and not t.tgisinternal and t.tgenabled = 'D'")
[ "$apagados" = 0 ] || falla "$apagados triggers quedaron apagados"
echo "Apagados: $apagados."

# Lo que sigue se hace como la app: con el rol authenticated y la sesión de una
# administradora, dentro de una transacción que se deshace al final.
admin=$(consulta "select id from public.perfiles where rol = 'admin' limit 1")
if [ -z "$admin" ]; then
  falla "No hay ninguna administradora para probar la app"
else
  como_admin() {
    psql "$db" -v ON_ERROR_STOP=1 -tAq <<SQL
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "$admin", "role": "authenticated"}';
$1
rollback;
SQL
  }

  echo "== Saldos vistos desde la app"
  # Mismas columnas que csv/saldos.csv del respaldo.
  como_admin "copy (select departamento, nombre, activo, comprado, pagado, saldo from public.saldos)
              to stdout with csv header;" > saldos-restaurados.csv
  if resumen=$(comparar_csv "$carpeta/csv/saldos.csv" saldos-restaurados.csv); then
    echo "Saldos: $resumen"
  else
    falla "Saldos: $resumen"
  fi

  echo "== La app puede seguir anotando y no puede cambiar valores"
  # Si los contadores de id no se restauraron, estas filas chocan con las viejas.
  if como_admin "
      insert into public.departamentos (nombre) values ('Ensayo de restauración');
      insert into public.personas (nombre, departamento_id)
        select 'Persona de ensayo', max(id) from public.departamentos;
      insert into public.compras (persona_id, valor_pesos)
        select max(id), 1000 from public.personas;
      insert into public.pagos (persona_id, valor_pesos, tipo)
        select max(id), 1000, 'total' from public.personas;
      update public.compras set anulada = true where id = (select max(id) from public.compras);
      do \$\$ begin
        update public.compras set valor_pesos = 1;
        raise exception 'se pudo cambiar el valor de una compra';
      exception when insufficient_privilege then null;
      end \$\$;
      do \$\$ begin
        delete from public.pagos;
        raise exception 'se pudo borrar un pago';
      exception when insufficient_privilege then null;
      end \$\$;" > /dev/null
  then
    echo "Crear departamento, persona, compra y pago, y anular: funciona. Cambiar valores y borrar: no se puede."
  else
    falla "La app no funcionaría bien con la base restaurada (error arriba)"
  fi
fi

echo
if [ "$fallas" -eq 0 ]; then
  echo "La restauración está completa."
else
  echo "La restauración tiene $fallas problemas."
  exit 1
fi
