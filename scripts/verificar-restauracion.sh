#!/usr/bin/env bash
# Revisa que una base restaurada desde el respaldo diario esté completa y que
# la app pueda seguir trabajando con ella.
#
# Uso: verificar-restauracion.sh <cadena-de-conexión> <carpeta-del-respaldo> <referencia.sql>
#
# <referencia.sql> es el esquema public que dejan las migraciones en una base
# limpia (pg_dump --schema-only). La base restaurada debe quedar idéntica.
#
# Solo imprime conteos y diferencias de esquema, nunca nombres ni valores:
# los registros de GitHub Actions no deben llevar datos de la cocina.

set -uo pipefail

db=$1
carpeta=$2
referencia=$3
fallas=0

falla() {
  echo "::error::$1"
  fallas=$((fallas + 1))
}

consulta() {
  psql "$db" -v ON_ERROR_STOP=1 -tAq -c "$1"
}

# Una fila de CSV puede tener saltos de línea (texto dictado), así que no se
# cuentan con wc -l.
filas_csv() {
  python3 -c 'import csv, sys; print(sum(1 for _ in csv.reader(open(sys.argv[1], newline=""))) - 1)' "$1"
}

echo "== Filas por tabla"
for tabla in perfiles departamentos personas compras pagos; do
  esperadas=$(filas_csv "$carpeta/csv/$tabla.csv")
  restauradas=$(consulta "select count(*) from public.$tabla" 2>&1)
  if [ "$esperadas" = "$restauradas" ]; then
    echo "$tabla: $restauradas, igual que el respaldo"
  else
    falla "$tabla: el respaldo tiene $esperadas filas y la base restaurada $restauradas"
  fi
done

echo "== Usuarias"
sin_cuenta=$(consulta "select count(*) from public.perfiles p where not exists (select 1 from auth.users u where u.id = p.id)")
sin_clave=$(consulta "select count(*) from auth.users u join public.perfiles p on p.id = u.id where coalesce(u.encrypted_password, '') = ''")
[ "$sin_cuenta" = 0 ] || falla "$sin_cuenta perfiles no tienen su cuenta en auth.users"
[ "$sin_clave" = 0 ] || falla "$sin_clave usuarias quedaron sin contraseña"
echo "Perfiles sin cuenta: $sin_cuenta. Usuarias sin contraseña: $sin_clave."

echo "== Esquema igual al de las migraciones"
# \restrict trae una clave al azar en cada pg_dump; los comentarios, la versión.
limpiar() { grep -vE '^(\\(un)?restrict |--|$)'; }
pg_dump "$db" --schema=public --schema-only --no-owner | limpiar > restaurado.sql
if diff -u <(limpiar < "$referencia") restaurado.sql > esquema.diff; then
  echo "Idéntico: tablas, reglas de acceso (RLS), permisos, funciones y triggers."
else
  cat esquema.diff
  falla "El esquema restaurado no es igual al de las migraciones (diferencias arriba)"
fi

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
  # Mismas columnas y orden que csv/saldos.csv del respaldo.
  como_admin "copy (select departamento, nombre, activo, comprado, pagado, saldo
                    from public.saldos order by departamento, nombre)
              to stdout with csv header;" > saldos-restaurados.csv
  if python3 - "$carpeta/csv/saldos.csv" saldos-restaurados.csv <<'PY'
import csv, sys
from collections import Counter
a, b = (Counter(tuple(f) for f in csv.reader(open(p, newline=""))) for p in sys.argv[1:])
print(f"Saldos en el respaldo: {sum(a.values()) - 1}. Vistos por la app: {sum(b.values()) - 1}. Distintos: {sum((a - b).values()) + sum((b - a).values())}.")
sys.exit(0 if a == b else 1)
PY
  then
    echo "Cada persona debe lo mismo que en el respaldo."
  else
    falla "Los saldos restaurados no son iguales a los del respaldo"
  fi

  echo "== La app puede seguir anotando"
  # Si los contadores de id no se restauraron, estas filas chocan con las viejas.
  if como_admin "
      insert into public.departamentos (nombre) values ('Ensayo de restauración');
      insert into public.personas (nombre, departamento_id)
        select 'Persona de ensayo', max(id) from public.departamentos;
      insert into public.compras (persona_id, valor_pesos)
        select max(id), 1000 from public.personas;
      insert into public.pagos (persona_id, valor_pesos, tipo)
        select max(id), 1000, 'total' from public.personas;
      update public.compras set anulada = true where id = (select max(id) from public.compras);" > /dev/null
  then
    echo "Crear departamento, persona, compra y pago, y anular: funciona."
  else
    falla "La app no podría registrar en la base restaurada"
  fi
fi

echo
if [ "$fallas" -eq 0 ]; then
  echo "La restauración está completa."
else
  echo "La restauración tiene $fallas problemas."
  exit 1
fi
