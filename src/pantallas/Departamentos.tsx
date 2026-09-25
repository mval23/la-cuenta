import type { PostgrestError } from '@supabase/supabase-js'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Boton } from '../componentes/Boton'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { campo } from '../componentes/estilos'
import type { DatosAviso } from '../componentes/useAviso'
import { supabase } from '../lib/supabase'
import type { Departamento } from '../lib/tipos'

function mensajeDeError(error: PostgrestError): string {
  if (error.code === '23505') return 'Ya existe un departamento con ese nombre.'
  return 'No se pudo guardar. Revisa la conexión e intenta de nuevo.'
}

function aliasDesdeTexto(texto: string): string[] {
  return texto
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a !== '')
}

/** Qué pasa al archivar un departamento con `personas` activas. */
function consecuencia(personas: number): string {
  if (personas === 0) return 'Ya no aparece al registrar.'
  const quienes = personas === 1 ? 'Su única persona deja' : `Sus ${personas} personas dejan`
  return `${quienes} de aparecer al registrar y al dictar. Lo que deban sigue en Cobrar.`
}

export function Departamentos({ mostrar }: { mostrar: (aviso: DatosAviso) => void }) {
  const [lista, setLista] = useState<Departamento[] | null>(null)
  const [nuevo, setNuevo] = useState('')
  const [editando, setEditando] = useState<number | null>(null)
  const [porArchivar, setPorArchivar] = useState<number | null>(null)
  // Cuántas personas activas tiene cada uno: al archivarlo dejan de aparecer al registrar.
  const [cuantas, setCuantas] = useState<ReadonlyMap<number, number>>(new Map())
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [{ data, error }, personas] = await Promise.all([
      supabase.from('departamentos').select('id, nombre, alias, activo').order('nombre'),
      supabase.from('personas').select('departamento_id').eq('activo', true),
    ])
    if (error) setError('No se pudieron cargar los departamentos.')
    else setLista(data)
    if (personas.data) {
      const conteo = new Map<number, number>()
      for (const { departamento_id } of personas.data) conteo.set(departamento_id, (conteo.get(departamento_id) ?? 0) + 1)
      setCuantas(conteo)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function agregar(e: FormEvent) {
    e.preventDefault()
    const nombre = nuevo.trim()
    if (!nombre) return
    setError(null)
    const { error } = await supabase.from('departamentos').insert({ nombre })
    if (error) return setError(mensajeDeError(error))
    setNuevo('')
    mostrar({ tipo: 'ok', texto: `Departamento agregado: ${nombre}` })
    cargar()
  }

  async function actualizar(id: number, cambios: Partial<Omit<Departamento, 'id'>>) {
    setError(null)
    const { error } = await supabase.from('departamentos').update(cambios).eq('id', id)
    if (error) {
      setError(mensajeDeError(error))
      return false
    }
    await cargar()
    return true
  }

  async function archivar(d: Departamento) {
    setPorArchivar(null)
    if (!(await actualizar(d.id, { activo: false }))) return
    mostrar({
      tipo: 'ok',
      texto: `Se archivó ${d.nombre}. Ya no aparece al registrar.`,
      deshacer: async () => {
        await reactivar(d)
      },
    })
  }

  async function reactivar(d: Departamento) {
    if (await actualizar(d.id, { activo: true })) {
      mostrar({ tipo: 'ok', texto: `${d.nombre} volvió a estar activo.` })
    }
  }

  if (lista === null) {
    return error ? (
      <ErrorDeCarga texto={error} onReintentar={cargar} />
    ) : (
      <p className="text-lg text-tinta-suave">Cargando departamentos...</p>
    )
  }

  const activos = lista.filter((d) => d.activo)
  const archivados = lista.filter((d) => !d.activo)

  return (
    <div className="flex flex-col gap-5">
      <p className="text-lg text-tinta-suave">
        Agrupan a las personas en Cobrar. En «Otras formas de decirlo» van los nombres con que se
        dicen, para que el dictado los reconozca.
      </p>

      {error && <p className="text-lg text-peligro">{error}</p>}

      {activos.length === 0 && (
        <p className="text-lg text-tinta-suave">Todavía no hay departamentos. Agrega el primero.</p>
      )}

      {activos.length > 0 && (
        <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
          {activos.map((d) =>
            editando === d.id ? (
              <EditarDepartamento
                key={d.id}
                departamento={d}
                onGuardar={async (cambios) => {
                  if (await actualizar(d.id, cambios)) setEditando(null)
                }}
                onCancelar={() => setEditando(null)}
              />
            ) : (
              <li key={d.id}>
                <div className="flex flex-wrap items-center gap-3 py-2 pr-3 pl-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold">{d.nombre}</p>
                    {d.alias.length > 0 && (
                      <p className="text-base text-tinta-suave">También: {d.alias.join(', ')}</p>
                    )}
                  </div>
                  <Boton
                    variante="secundario"
                    compacto
                    aria-label={`Cambiar: ${d.nombre}`}
                    onClick={() => {
                      setPorArchivar(null)
                      setEditando(d.id)
                    }}
                  >
                    Cambiar
                  </Boton>
                  <Boton
                    variante="peligro"
                    compacto
                    aria-label={`Archivar: ${d.nombre}`}
                    disabled={porArchivar === d.id}
                    onClick={() => setPorArchivar(d.id)}
                  >
                    Archivar
                  </Boton>
                </div>
                {porArchivar === d.id && (
                  <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 bg-peligro-suave px-4 py-3">
                    <span className="mr-auto text-lg">
                      ¿Archivar <span className="font-semibold">{d.nombre}</span>? {consecuencia(cuantas.get(d.id) ?? 0)}
                    </span>
                    <Boton variante="secundario" compacto onClick={() => setPorArchivar(null)}>
                      No
                    </Boton>
                    <Boton variante="peligro" compacto onClick={() => archivar(d)}>
                      Sí, archivar
                    </Boton>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      <form onSubmit={agregar} className="flex flex-wrap gap-3">
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="Nombre del departamento"
          aria-label="Nombre del nuevo departamento"
          className={`${campo} min-w-0 flex-1`}
        />
        <Boton type="submit" disabled={!nuevo.trim()}>
          Agregar
        </Boton>
      </form>

      {archivados.length > 0 && (
        <details className="rounded-xl border border-linea bg-superficie p-4">
          <summary className="min-h-11 cursor-pointer content-center text-lg font-semibold text-tinta-suave">
            Archivados ({archivados.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {archivados.map((d) => (
              <li key={d.id} className="flex items-center gap-3">
                <span className="flex-1 text-lg text-tinta-suave">{d.nombre}</span>
                <Boton variante="secundario" compacto onClick={() => reactivar(d)}>
                  Reactivar
                </Boton>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function EditarDepartamento({
  departamento,
  onGuardar,
  onCancelar,
}: {
  departamento: Departamento
  onGuardar: (cambios: { nombre: string; alias: string[] }) => void
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(departamento.nombre)
  const [alias, setAlias] = useState(departamento.alias.join(', '))

  function guardar(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    onGuardar({ nombre: nombre.trim(), alias: aliasDesdeTexto(alias) })
  }

  return (
    <li className="bg-marca-suave p-4">
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-tinta-suave">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-tinta-suave">Otras formas de decirlo (separadas por coma)</span>
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="te de hache, talento humano"
            className={campo}
          />
        </label>
        <div className="flex gap-3">
          <Boton type="submit">Guardar</Boton>
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
        </div>
      </form>
    </li>
  )
}
