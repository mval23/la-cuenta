// Los scripts que preparan y limpian los datos de la prueba con Amparo
// (scripts/prueba-*.sql) se corren contra la base real con el usuario
// postgres, sin sesión de la app. Aquí se prueban igual: sobre las migraciones,
// sin rol y sin auth.uid().
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const ADMIN = '00000000-0000-0000-0000-000000000001'
const raiz = join(import.meta.dirname, '..', '..')
const preparar = readFileSync(join(raiz, 'scripts', 'prueba-preparar.sql'), 'utf8')
const limpiar = readFileSync(join(raiz, 'scripts', 'prueba-limpiar.sql'), 'utf8')

const db = new PGlite()

/** Corre un script y devuelve las filas de su última consulta. */
async function correr(sql: string) {
  const resultados = await db.exec(sql)
  return resultados.at(-1)?.rows ?? []
}

beforeAll(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  `)
  const carpeta = join(raiz, 'supabase', 'migrations')
  for (const archivo of readdirSync(carpeta).sort()) {
    await db.exec(readFileSync(join(carpeta, archivo), 'utf8'))
  }
  await db.exec(`
    insert into auth.users values ('${ADMIN}');
    insert into public.perfiles (id, nombre, rol) values ('${ADMIN}', 'Mariana', 'admin');
  `)
})

describe('datos de la prueba con Amparo', () => {
  it('prepara los departamentos, las personas y la deuda vieja de Carlos Gómez', async () => {
    const filas = await correr(preparar)
    expect(filas).toEqual([
      { departamento: 'Prueba', persona: 'Carlos Gómez', debe: 29000 },
      { departamento: 'Prueba', persona: 'Carlos Pérez', debe: 0 },
      { departamento: 'Prueba', persona: 'Marta Ruiz', debe: 0 },
      { departamento: 'Prueba 2', persona: null, debe: 0 },
    ])
    const [vieja] = await correr(
      `select public.hoy_bogota() - min(fecha) as dias from public.compras where valor_pesos = 11000`,
    )
    expect(vieja.dias).toBe(120)
  })

  it('se puede correr otra vez sin repetir personas ni compras', async () => {
    const filas = await correr(preparar)
    expect(filas).toHaveLength(4)
    const [compras] = await correr('select count(*)::int as n from public.compras')
    expect(compras.n).toBe(3)
  })

  it('limpiar anula todo lo anotado y archiva personas y departamentos', async () => {
    // Lo que Amparo anotaría durante la prueba.
    await db.exec(`
      insert into public.personas (nombre, departamento_id)
        select 'Luisa Rojas', id from public.departamentos where nombre = 'Prueba 2';
      insert into public.compras (persona_id, descripcion, valor_pesos, creada_por)
        select id, 'Almuerzo', 12000, '${ADMIN}' from public.personas where nombre = 'Carlos Pérez';
      insert into public.pagos (persona_id, valor_pesos, tipo, creado_por)
        select id, 5000, 'abono', '${ADMIN}' from public.personas where nombre = 'Carlos Gómez';
    `)
    const filas = await correr(limpiar)
    // Las tres de Prueba y Luisa, en Prueba 2.
    expect(filas).toHaveLength(4)
    for (const fila of filas) {
      expect(fila).toMatchObject({ activo: false, persona_activa: false, debe: 0 })
    }
    const [vivas] = await correr(`
      select (select count(*) from public.compras where not anulada)::int
           + (select count(*) from public.pagos where not anulado)::int as n
    `)
    expect(vivas.n).toBe(0)
  })

  it('después de limpiar se puede preparar otra vez', async () => {
    const filas = await correr(preparar)
    expect(filas.map((f) => f.persona)).toEqual(['Carlos Gómez', 'Carlos Pérez', 'Marta Ruiz', null])
    expect(filas[0].debe).toBe(29000)
  })
})
