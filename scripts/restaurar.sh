#!/usr/bin/env bash
# Restaura los datos de un respaldo diario (ver .github/workflows/respaldo.yml).
#
# Uso:
#   scripts/restaurar.sh "<cadena-de-conexión>" <carpeta-del-respaldo> [--reemplazar]
#
# La base ya debe tener el esquema: en un proyecto nuevo, primero
# `npx supabase db push`. El esquema sale de las migraciones y no del respaldo
# porque las migraciones traen los permisos (compras y pagos no se editan ni
# se borran) y el respaldo no.
#
# - Proyecto nuevo: trae también las usuarias, con sus contraseñas.
# - Mismo proyecto con datos dañados: con --reemplazar borra lo que haya en
#   las tablas de la app y pone lo del respaldo. Las usuarias no se tocan.
#
# Todo pasa en una sola transacción: si algo falla, la base queda como estaba.

set -euo pipefail

if [ $# -lt 2 ]; then
  echo 'Uso: scripts/restaurar.sh "<cadena-de-conexión>" <carpeta-del-respaldo> [--reemplazar]' >&2
  exit 2
fi
db=$1
carpeta=$2
reemplazar=${3:-}
tablas="perfiles departamentos personas compras pagos"

consulta() {
  psql "$db" -v ON_ERROR_STOP=1 -tAq -c "$1"
}

filas=$(consulta "select (select count(*) from public.perfiles) + (select count(*) from public.departamentos)
                       + (select count(*) from public.personas) + (select count(*) from public.compras)
                       + (select count(*) from public.pagos)")
if [ "$filas" != 0 ] && [ "$reemplazar" != --reemplazar ]; then
  echo "La base ya tiene $filas filas. Para cambiarlas por las del respaldo, agregar --reemplazar al final." >&2
  exit 1
fi

# En un proyecto nuevo no hay usuarias: se traen primero, porque las compras y
# los pagos guardan quién los registró.
if [ "$(consulta 'select count(*) from auth.users')" = 0 ]; then
  echo "Restaurando las usuarias..."
  pg_restore --data-only --no-owner --no-privileges --single-transaction -d "$db" "$carpeta/usuarias.dump"
fi

echo "Restaurando los datos..."
{
  echo "begin;"
  if [ "$reemplazar" = --reemplazar ]; then
    echo "truncate public.compras, public.pagos, public.personas, public.departamentos, public.perfiles;"
  fi
  # Los triggers de la app no deben correr al cargar: por ejemplo, el que pone
  # a cada compra el departamento actual de la persona cambiaría la historia.
  for tabla in $tablas; do echo "alter table public.$tabla disable trigger user;"; done
  pg_restore --data-only --no-owner --no-privileges -f - "$carpeta/la-cuenta.dump"
  for tabla in $tablas; do echo "alter table public.$tabla enable trigger user;"; done
  echo "commit;"
} | psql "$db" -v ON_ERROR_STOP=1 -q > /dev/null

for tabla in $tablas; do
  echo "$tabla: $(consulta "select count(*) from public.$tabla") filas"
done
echo "Listo."
