import type { PostgrestError } from '@supabase/supabase-js'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Boton } from '../componentes/Boton'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { campo } from '../componentes/estilos'
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

export function Departamentos() {
  const [lista, setLista] = useState<Departamento[] | null>(null)
  const [nuevo, setNuevo] = useState('')
  const [editando, setEditando] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('departamentos')
      .select('id, nombre, alias, activo')
      .order('nombre')
    if (error) setError('No se pudieron cargar los departamentos.')
    else setLista(data)
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

  if (lista === null) {
    return error ? (
      <ErrorDeCarga texto={error} onReintentar={cargar} />
    ) : (
      <p className="text-lg text-stone-600">Cargando departamentos...</p>
    )
  }

  const activos = lista.filter((d) => d.activo)
  const archivados = lista.filter((d) => !d.activo)

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-xl font-semibold">Departamentos</h2>

      {error && <p className="text-lg text-red-800">{error}</p>}

      {activos.length === 0 && (
        <p className="text-lg text-stone-600">Todavía no hay departamentos. Agrega el primero.</p>
      )}

      {activos.length > 0 && (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
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
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2 pr-3 pl-4">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">{d.nombre}</p>
                  {d.alias.length > 0 && (
                    <p className="text-base text-stone-600">También: {d.alias.join(', ')}</p>
                  )}
                </div>
                <Boton variante="secundario" compacto onClick={() => setEditando(d.id)}>
                  Cambiar
                </Boton>
                <Boton variante="peligro" compacto onClick={() => actualizar(d.id, { activo: false })}>
                  Archivar
                </Boton>
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
        <details className="rounded-xl border border-stone-200 bg-white p-4">
          <summary className="min-h-11 cursor-pointer content-center text-lg font-semibold text-stone-600">
            Archivados ({archivados.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {archivados.map((d) => (
              <li key={d.id} className="flex items-center gap-3">
                <span className="flex-1 text-lg text-stone-600">{d.nombre}</span>
                <Boton variante="secundario" compacto onClick={() => actualizar(d.id, { activo: true })}>
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
    <li className="bg-amber-50 p-4">
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-stone-600">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-stone-600">Otras formas de decirlo (separadas por coma)</span>
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
