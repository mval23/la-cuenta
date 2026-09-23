// Prueba las migraciones en un Postgres embebido (PGlite), incluyendo los
// permisos por rol. Simula lo mínimo de Supabase: roles, auth.users y auth.uid().
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const ADMIN = '00000000-0000-0000-0000-000000000001'
const OPERADOR = '00000000-0000-0000-0000-000000000002'
const COCINA = '00000000-0000-0000-0000-000000000003'
const SIN_PERFIL = '00000000-0000-0000-0000-000000000004'

const db = new PGlite()

async function como<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('app.uid', '${uid}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role;')
  }
}

const filas = async (sql: string) => (await db.query<Record<string, unknown>>(sql)).rows

beforeAll(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `)

  const carpeta = join(import.meta.dirname, '..', 'migrations')
  for (const archivo of readdirSync(carpeta).sort()) {
    await db.exec(readFileSync(join(carpeta, archivo), 'utf8'))
  }

  await db.exec(`
    insert into auth.users values ('${ADMIN}'), ('${OPERADOR}'), ('${COCINA}'), ('${SIN_PERFIL}');
    insert into public.perfiles (id, nombre, rol) values
      ('${ADMIN}', 'Admin', 'admin'),
      ('${OPERADOR}', 'Operador', 'operador'),
      ('${COCINA}', 'Cocina', 'cocina');
  `)
})

describe('operador', () => {
  let tdh: number
  let insumos: number
  let juanTdh: number
  let juanInsumos: number
  const saldoDe = async (id: number) =>
    (await filas(`select saldo, departamento from saldos where persona_id = ${id}`))[0]

  it('crea departamentos con alias', async () => {
    await como(OPERADOR, async () => {
      await db.query(`insert into departamentos (nombre, alias) values ('TDH', '{te de hache}'), ('Insumos', '{}')`)
      const deps = await filas('select id, nombre from departamentos')
      tdh = deps.find((d) => d.nombre === 'TDH')!.id as number
      insumos = deps.find((d) => d.nombre === 'Insumos')!.id as number
    })
    expect(tdh).toBeDefined()
    expect(insumos).toBeDefined()
  })

  it('no repite nombres de departamento, sin importar mayúsculas', async () => {
    await como(OPERADOR, async () => {
      await expect(db.query(`insert into departamentos (nombre) values ('tdh')`)).rejects.toThrow()
    })
  })

  it('permite el mismo nombre en distinto departamento, no en el mismo', async () => {
    await como(OPERADOR, async () => {
      await db.query(`insert into personas (nombre, departamento_id) values ('Juan', ${tdh}), ('Juan', ${insumos})`)
      await expect(
        db.query(`insert into personas (nombre, departamento_id) values ('juan', ${tdh})`),
      ).rejects.toThrow()
      const juanes = await filas(`select id, departamento_id from personas where nombre = 'Juan'`)
      juanTdh = juanes.find((p) => p.departamento_id === tdh)!.id as number
      juanInsumos = juanes.find((p) => p.departamento_id === insumos)!.id as number
    })
  })

  it('la compra toma el departamento de la persona y quién la creó', async () => {
    await como(OPERADOR, async () => {
      await db.query(`insert into compras (persona_id, descripcion, valor_pesos, texto_original)
        values (${juanTdh}, 'almuerzo', 10000, 'Juan TDH almuerzo a 10 mil'),
               (${juanTdh}, 'pandeyuca', 2200, null),
               (${juanInsumos}, 'desayuno', 10000, null)`)
      const [c] = await filas(`select departamento_id, creada_por from compras where persona_id = ${juanTdh} limit 1`)
      expect(c.departamento_id).toBe(tdh)
      expect(c.creada_por).toBe(OPERADOR)
    })
  })

  it('permite compras sin decir qué se compró, pero no con descripción vacía', async () => {
    await como(OPERADOR, async () => {
      await db.exec('begin')
      const [c] = await filas(`insert into compras (persona_id, valor_pesos) values (${juanInsumos}, 1500) returning descripcion`)
      await db.exec('rollback')
      expect(c.descripcion).toBeNull()
      await expect(
        db.query(`insert into compras (persona_id, descripcion, valor_pesos) values (${juanTdh}, '  ', 1500)`),
      ).rejects.toThrow()
    })
  })

  it('rechaza valores en cero y compras a nombre de otra usuaria', async () => {
    await como(OPERADOR, async () => {
      await expect(
        db.query(`insert into compras (persona_id, descripcion, valor_pesos) values (${juanTdh}, 'x', 0)`),
      ).rejects.toThrow()
      await expect(
        db.query(`insert into compras (persona_id, descripcion, valor_pesos, creada_por)
                  values (${juanTdh}, 'x', 100, '${ADMIN}')`),
      ).rejects.toThrow()
    })
  })

  it('registra cuentas atrasadas hasta 60 días, pero no del futuro', async () => {
    await como(OPERADOR, async () => {
      await db.exec('begin')
      const [c] = await filas(`insert into compras (persona_id, valor_pesos, fecha)
        values (${juanTdh}, 1000, public.hoy_bogota() - 3) returning fecha = public.hoy_bogota() - 3 as ok`)
      await db.exec('rollback')
      expect(c.ok).toBe(true)
      await expect(
        db.query(`insert into compras (persona_id, valor_pesos, fecha) values (${juanTdh}, 1000, public.hoy_bogota() + 1)`),
      ).rejects.toThrow()
      await expect(
        db.query(`insert into compras (persona_id, valor_pesos, fecha) values (${juanTdh}, 1000, public.hoy_bogota() - 61)`),
      ).rejects.toThrow()
    })
  })

  it('saldo = compras - pagos', async () => {
    await como(OPERADOR, async () => {
      await db.query(`insert into pagos (persona_id, valor_pesos, tipo) values (${juanTdh}, 5000, 'abono')`)
      expect(Number((await saldoDe(juanTdh)).saldo)).toBe(12200 - 5000)
    })
  })

  it('anular registra quién y cuándo, y saca la compra del saldo', async () => {
    await como(OPERADOR, async () => {
      await db.query(`update compras set anulada = true, anulada_motivo = 'error'
                      where persona_id = ${juanTdh} and descripcion = 'pandeyuca'`)
      const [c] = await filas(`select anulada_por, anulada_en from compras where descripcion = 'pandeyuca'`)
      expect(c.anulada_por).toBe(OPERADOR)
      expect(c.anulada_en).not.toBeNull()
      expect(Number((await saldoDe(juanTdh)).saldo)).toBe(10000 - 5000)
    })
  })

  it('no permite cambiar valores ni borrar', async () => {
    await como(OPERADOR, async () => {
      await expect(db.query(`update compras set valor_pesos = 1`)).rejects.toThrow()
      await expect(db.query(`update pagos set valor_pesos = 1`)).rejects.toThrow()
      await expect(db.query('delete from compras')).rejects.toThrow()
      await expect(db.query('delete from pagos')).rejects.toThrow()
      await expect(db.query('delete from personas')).rejects.toThrow()
      await expect(db.query('delete from departamentos')).rejects.toThrow()
    })
  })

  it('al cambiar de departamento, la deuda viaja con la persona y la historia se conserva', async () => {
    await como(OPERADOR, async () => {
      await db.query(`update personas set departamento_id = ${insumos}, nombre = 'Juan Pablo' where id = ${juanTdh}`)
      const [c] = await filas(`select departamento_id from compras where persona_id = ${juanTdh} and not anulada`)
      expect(c.departamento_id).toBe(tdh)
      const s = await saldoDe(juanTdh)
      expect(Number(s.saldo)).toBe(5000)
      expect(s.departamento).toBe('Insumos')
    })
  })
})

describe('cocina', () => {
  it('no ve saldos, pagos ni compras de otras', async () => {
    await como(COCINA, async () => {
      expect(await filas('select * from saldos')).toHaveLength(0)
      expect(await filas('select * from pagos')).toHaveLength(0)
      expect(await filas('select * from compras')).toHaveLength(0)
    })
  })

  it('ve personas, registra compras y ve las suyas de hoy', async () => {
    await como(COCINA, async () => {
      const [p] = await filas('select id from personas limit 1')
      expect(p).toBeDefined()
      await db.query(`insert into compras (persona_id, descripcion, valor_pesos) values (${p.id}, 'almuerzo', 10000)`)
      expect(await filas('select * from compras')).toHaveLength(1)
    })
  })

  it('no registra pagos, no anula ni crea departamentos', async () => {
    await como(COCINA, async () => {
      await expect(
        db.query(`insert into pagos (persona_id, valor_pesos, tipo) values (1, 100, 'abono')`),
      ).rejects.toThrow()
      expect((await db.query('update compras set anulada = true')).affectedRows).toBe(0)
      await expect(db.query(`insert into departamentos (nombre) values ('Nuevo')`)).rejects.toThrow()
      const [p] = await filas('select id from personas limit 1')
      await expect(
        db.query(`insert into compras (persona_id, valor_pesos, fecha) values (${p.id}, 1000, public.hoy_bogota() - 1)`),
      ).rejects.toThrow()
    })
  })
})

describe('usuario sin perfil', () => {
  it('no ve nada', async () => {
    await como(SIN_PERFIL, async () => {
      for (const tabla of ['departamentos', 'personas', 'compras', 'pagos', 'saldos', 'perfiles']) {
        expect(await filas(`select * from ${tabla}`), tabla).toHaveLength(0)
      }
    })
  })

  it('no puede crear personas', async () => {
    await como(SIN_PERFIL, async () => {
      await expect(
        db.query(`insert into personas (nombre, departamento_id) values ('X', 1)`),
      ).rejects.toThrow()
    })
  })
})

describe('admin', () => {
  it('ve todos los perfiles', async () => {
    await como(ADMIN, async () => {
      expect(await filas('select * from perfiles')).toHaveLength(3)
    })
  })
})

describe('documentos', () => {
  let ana: number

  it('la cuenta de la quincena separa lo anterior, lo del periodo y lo que queda', async () => {
    await como(OPERADOR, async () => {
      const [d] = await filas(`insert into departamentos (nombre) values ('Gerencia') returning id`)
      const [p] = await filas(`insert into personas (nombre, departamento_id) values ('Ana', ${d.id}) returning id`)
      ana = p.id as number
      await db.query(`insert into compras (persona_id, valor_pesos, fecha) values
        (${ana}, 8000, public.hoy_bogota() - 20),
        (${ana}, 3000, public.hoy_bogota() - 5)`)
      await db.query(`insert into compras (persona_id, valor_pesos, fecha, anulada) values
        (${ana}, 999, public.hoy_bogota() - 4, true)`)
      await db.query(`insert into pagos (persona_id, valor_pesos, tipo, fecha) values
        (${ana}, 2000, 'abono', public.hoy_bogota() - 20),
        (${ana}, 1000, 'abono', public.hoy_bogota() - 2),
        (${ana}, 500, 'abono', public.hoy_bogota())`)
      const [c] = await filas(`select * from cuenta_de_quincena(public.hoy_bogota() - 10, public.hoy_bogota() - 1)
                               where persona_id = ${ana}`)
      expect(c.departamento).toBe('Gerencia')
      expect([c.anterior, c.comprado, c.pagado, c.saldo].map(Number)).toEqual([6000, 3000, 1000, 8000])
    })
  })

  it('la cocina y quien no tiene perfil no ven la cuenta de la quincena', async () => {
    for (const uid of [COCINA, SIN_PERFIL]) {
      await como(uid, async () => {
        expect(await filas(`select * from cuenta_de_quincena('2000-01-01', public.hoy_bogota())`)).toHaveLength(0)
      })
    }
  })

  it('los datos de cobro son una sola fila que se cambia, no se crea ni se borra', async () => {
    await como(OPERADOR, async () => {
      await db.query(`update datos_de_cobro set nombre = 'Amparo', cliente_nombre = 'ORF S.A. BIC'`)
      const datos = await filas('select nombre, cliente_nombre, concepto from datos_de_cobro')
      expect(datos).toEqual([{ nombre: 'Amparo', cliente_nombre: 'ORF S.A. BIC', concepto: 'Servicio de comedor y otros' }])
      await expect(db.query('insert into datos_de_cobro (id) values (false)')).rejects.toThrow()
      await expect(db.query('delete from datos_de_cobro')).rejects.toThrow()
    })
  })

  it('la cocina no ve ni cambia los datos de cobro', async () => {
    await como(COCINA, async () => {
      expect(await filas('select * from datos_de_cobro')).toHaveLength(0)
      expect((await db.query(`update datos_de_cobro set nombre = 'X'`)).affectedRows).toBe(0)
    })
  })
})

describe('unir personas', () => {
  let raybin: number
  let reibi: number

  it('pasa compras y pagos a la otra persona, conserva quién y cuándo, y archiva la repetida', async () => {
    await como(OPERADOR, async () => {
      const [d] = await filas(`insert into departamentos (nombre) values ('Sistemas') returning id`)
      ;[raybin, reibi] = (
        await filas(`insert into personas (nombre, departamento_id) values ('Raybin', ${d.id}), ('Reibi', ${d.id}) returning id`)
      ).map((p) => p.id as number)
      await db.query(`insert into compras (persona_id, valor_pesos, descripcion, fecha) values
        (${raybin}, 4000, null, public.hoy_bogota()),
        (${reibi}, 10000, 'almuerzo', public.hoy_bogota() - 1),
        (${reibi}, 7000, null, public.hoy_bogota())`)
      await db.query(`update compras set anulada = true where persona_id = ${reibi} and valor_pesos = 7000`)
      await db.query(`insert into pagos (persona_id, valor_pesos, tipo) values (${reibi}, 3000, 'abono')`)

      await db.query(`select unir_personas(${reibi}, ${raybin})`)

      const saldo = await filas(`select persona_id, saldo, activo from saldos where persona_id in (${raybin}, ${reibi})`)
      expect(saldo.find((s) => s.persona_id === raybin)).toMatchObject({ activo: true })
      expect(Number(saldo.find((s) => s.persona_id === raybin)!.saldo)).toBe(4000 + 10000 - 3000)
      expect(saldo.find((s) => s.persona_id === reibi)).toMatchObject({ activo: false })
      expect(Number(saldo.find((s) => s.persona_id === reibi)!.saldo)).toBe(0)

      const [pasada] = await filas(`select descripcion, fecha = public.hoy_bogota() - 1 as ayer, creada_por
                                    from compras where persona_id = ${raybin} and valor_pesos = 10000`)
      expect(pasada).toEqual({ descripcion: 'almuerzo', ayer: true, creada_por: OPERADOR })
      const motivos = await filas(`select anulada_motivo from compras where persona_id = ${reibi} order by valor_pesos`)
      // La anulada antes queda como estaba; la otra se anula como corregida.
      expect(motivos.map((m) => m.anulada_motivo)).toEqual([null, 'corregida'])
    })
  })

  it('no une a una persona consigo misma ni con una archivada', async () => {
    await como(OPERADOR, async () => {
      await expect(db.query(`select unir_personas(${raybin}, ${raybin})`)).rejects.toThrow()
      await expect(db.query(`select unir_personas(${raybin}, ${reibi})`)).rejects.toThrow()
    })
  })

  it('la cocina y quien no tiene perfil no pueden unir', async () => {
    const [p] = await filas(`insert into personas (nombre, departamento_id)
                             select 'Rabin', departamento_id from personas where id = ${raybin} returning id`)
    for (const uid of [COCINA, SIN_PERFIL]) {
      await como(uid, async () => {
        await expect(db.query(`select unir_personas(${p.id}, ${raybin})`)).rejects.toThrow()
      })
    }
  })
})
