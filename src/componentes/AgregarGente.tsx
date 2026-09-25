// Agregar personas a un departamento y departamentos nuevos, desde Cobrar.
// Cambiar nombres, mover de departamento o archivar sigue en Ajustes.

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Boton } from './Boton'
import { campo } from './estilos'
import { Microfono } from './Microfono'
import { Parecidas } from './Parecidas'
import type { DatosAviso } from './useAviso'
import { nombreDictado } from '../lib/personas'
import { supabase } from '../lib/supabase'
import { hayMicrofono } from '../lib/voz'
import type { Persona } from '../lib/tipos'

export function AgregarPersona({
  departamento,
  personas,
  todas,
  nombreDepto,
  activa,
  mostrar,
  onAgregada,
  onCerrar,
}: {
  departamento: { id: number; nombre: string }
  /** Las del departamento, para que el dictado escriba bien los apellidos conocidos. */
  personas: Persona[]
  /** Todas las activas, para avisar si ya hay alguien que suena parecido. */
  todas: Persona[]
  nombreDepto: (id: number) => string
  activa: boolean
  mostrar: (aviso: DatosAviso) => void
  onAgregada: (personaId: number) => Promise<void>
  onCerrar: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  // "Cerrar" con un nombre escrito: se pregunta antes de perderlo.
  const [preguntando, setPreguntando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const conMicrofono = hayMicrofono()

  // Con micrófono no se abre el teclado solo: taparía media pantalla.
  useEffect(() => {
    if (!conMicrofono) entrada.current?.focus()
  }, [conMicrofono])

  function agregar(e: FormEvent) {
    e.preventDefault()
    void guardar()
  }

  async function guardar(): Promise<boolean> {
    const limpio = nombre.trim()
    if (!limpio || guardando) return false
    setGuardando(true)
    const { data, error } = await supabase
      .from('personas')
      .insert({ nombre: limpio, departamento_id: departamento.id })
      .select('id')
      .single()
    setGuardando(false)
    if (error) {
      mostrar({
        tipo: 'error',
        texto:
          error.code === '23505'
            ? `Ya hay una persona llamada ${limpio} en ${departamento.nombre}.`
            : 'No se pudo guardar. Revisa el internet e intenta otra vez.',
      })
      return false
    }
    // Se queda abierto: casi siempre se agregan varias del mismo departamento.
    setNombre('')
    mostrar({ tipo: 'ok', texto: `Se agregó a ${limpio} en ${departamento.nombre}.` })
    if (!conMicrofono) entrada.current?.focus()
    await onAgregada(data.id)
    return true
  }

  function cerrar() {
    if (nombre.trim()) setPreguntando(true)
    else onCerrar()
  }

  return (
    <form onSubmit={agregar} className="flex flex-col gap-3 rounded-xl bg-marca-suave p-4">
      <p className="text-lg font-semibold">Persona nueva en {departamento.nombre}</p>
      {/* Solo en la pestaña visible, para que el micrófono no quede encendido. */}
      {activa && (
        <Microfono
          texto="Tocar para decir el nombre"
          vocabulario={() => [departamento.nombre, ...personas.map((p) => p.nombre)].join(', ')}
          onTexto={(dicho) => setNombre(nombreDictado(dicho))}
          onError={(mensaje) => mostrar({ tipo: 'error', texto: mensaje })}
          sinVoz="Puedes escribir el nombre en el campo de abajo."
          onEmpezar={() => setNombre('')}
        />
      )}
      <label htmlFor={`nueva-${departamento.id}`} className="text-base text-tinta-suave">
        {conMicrofono ? 'Revisa el nombre antes de agregar, o escríbelo:' : 'Nombre y apellido'}
      </label>
      <div className="flex flex-wrap gap-3">
        <input
          id={`nueva-${departamento.id}`}
          ref={entrada}
          value={nombre}
          onChange={(e) => {
            setPreguntando(false)
            setNombre(e.target.value)
          }}
          placeholder="Nombre y apellido"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          className={`${campo} min-w-0 flex-1 basis-60`}
        />
        <Boton type="submit" disabled={!nombre.trim() || guardando}>
          {guardando ? 'Agregando...' : 'Agregar'}
        </Boton>
        {!preguntando && (
          <Boton variante="secundario" onClick={cerrar}>
            Cerrar
          </Boton>
        )}
      </div>
      {preguntando && (
        <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-aviso-suave p-4">
          <span className="mr-auto text-lg">
            ¿Agregar a <span className="font-semibold">{nombre.trim()}</span> antes de cerrar?
          </span>
          <Boton variante="secundario" compacto disabled={guardando} onClick={onCerrar}>
            No, cerrar
          </Boton>
          <Boton
            compacto
            disabled={guardando}
            onClick={async () => {
              if (await guardar()) onCerrar()
            }}
          >
            {guardando ? 'Agregando...' : 'Sí, agregar'}
          </Boton>
        </div>
      )}
      <Parecidas nombre={nombre} personas={todas} nombreDepto={nombreDepto} />
    </form>
  )
}

export function NuevoDepartamento({
  mostrar,
  onAgregado,
}: {
  mostrar: (aviso: DatosAviso) => void
  onAgregado: () => Promise<void>
}) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')

  async function agregar(e: FormEvent) {
    e.preventDefault()
    const limpio = nombre.trim()
    if (!limpio) return
    const { error } = await supabase.from('departamentos').insert({ nombre: limpio })
    if (error) {
      mostrar({
        tipo: 'error',
        texto:
          error.code === '23505'
            ? 'Ya existe un departamento con ese nombre.'
            : 'No se pudo guardar. Revisa el internet e intenta otra vez.',
      })
      return
    }
    setNombre('')
    setAbierto(false)
    mostrar({ tipo: 'ok', texto: `Departamento agregado: ${limpio}` })
    await onAgregado()
  }

  if (!abierto) {
    return (
      <Boton variante="secundario" className="self-start" onClick={() => setAbierto(true)}>
        + Nuevo departamento
      </Boton>
    )
  }

  return (
    <form onSubmit={agregar} className="flex flex-wrap gap-3 rounded-xl border border-linea bg-superficie p-4">
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre del departamento"
        aria-label="Nombre del nuevo departamento"
        autoComplete="off"
        autoFocus
        className={`${campo} min-w-0 flex-1 basis-60`}
      />
      <Boton type="submit" disabled={!nombre.trim()}>
        Agregar
      </Boton>
      <Boton variante="secundario" onClick={() => setAbierto(false)}>
        Cancelar
      </Boton>
    </form>
  )
}
