import { useCallback, useEffect, useState } from 'react'
import { Boton } from './Boton'
import { ErrorDeCarga } from './ErrorDeCarga'
import { campo, etiqueta } from './estilos'
import { normalizarNombre, suenanParecido } from '../lib/personas'
import { supabase } from '../lib/supabase'

/** Una persona activa con el nombre de su departamento. */
export interface Quien {
  id: number
  nombre: string
  departamento: string
}

/** Buscar a quién pasarle una compra o un pago: por nombre, o nombre y departamento. */
export function BuscarPersona({
  excluir,
  sugerirPara,
  textoCancelar = 'Dejarlo en la misma persona',
  onElegir,
  onCancelar,
}: {
  /** La persona que no se ofrece: con quien se está. */
  excluir?: number
  /** Sin escribir nada, se ofrecen las que suenan como este nombre. */
  sugerirPara?: string
  textoCancelar?: string
  onElegir: (q: Quien) => void
  onCancelar: () => void
}) {
  const [personas, setPersonas] = useState<Quien[] | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('personas')
      .select('id, nombre, departamentos(nombre)')
      .eq('activo', true)
    if (error) {
      setErrorDeCarga(true)
      return
    }
    setErrorDeCarga(false)
    setPersonas(
      (data as unknown as { id: number; nombre: string; departamentos: { nombre: string } | null }[]).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        departamento: p.departamentos?.nombre ?? '',
      })),
    )
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const palabras = normalizarNombre(busqueda).split(' ').filter(Boolean)
  const encontradas =
    personas === null || palabras.length === 0
      ? []
      : personas
          .filter((p) => {
            if (p.id === excluir) return false
            const donde = normalizarNombre(`${p.nombre} ${p.departamento}`)
            return palabras.every((palabra) => donde.includes(palabra))
          })
          .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
  const MAXIMO = 8
  const primerNombre = (nombre: string) => normalizarNombre(nombre).split(' ')[0] ?? ''
  const sugeridas =
    personas === null || !sugerirPara
      ? []
      : personas
          .filter((p) => p.id !== excluir && suenanParecido(primerNombre(sugerirPara), primerNombre(p.nombre)))
          .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))

  const boton = (p: Quien) => (
    <button
      key={p.id}
      type="button"
      onClick={() => onElegir(p)}
      className="min-h-14 rounded-xl border border-control bg-superficie px-4 text-left text-xl active:bg-hundido"
    >
      <span className="font-semibold">{p.nombre}</span>{' '}
      <span className="font-semibold text-tinta-suave">· {p.departamento}</span>
    </button>
  )

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Buscar por nombre</span>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          autoComplete="off"
          autoCapitalize="words"
          autoFocus
          className={campo}
        />
      </label>
      {errorDeCarga ? (
        <ErrorDeCarga texto="No se pudo cargar las personas." onReintentar={cargar} />
      ) : personas === null ? (
        <p className="text-lg text-tinta-suave">Cargando...</p>
      ) : palabras.length === 0 && sugeridas.length > 0 ? (
        <>
          <p className="text-lg text-tinta-suave">Suenan parecido:</p>
          {sugeridas.slice(0, MAXIMO).map(boton)}
          <p className="text-lg text-tinta-suave">¿No es ninguna? Escribe el nombre.</p>
        </>
      ) : palabras.length === 0 ? (
        <p className="text-lg text-tinta-suave">Escribe el nombre, o el nombre y el departamento.</p>
      ) : encontradas.length === 0 ? (
        <p className="text-lg text-tinta-suave">No hay nadie con ese nombre.</p>
      ) : (
        <>
          {encontradas.slice(0, MAXIMO).map(boton)}
          {encontradas.length > MAXIMO && (
            <p className="text-lg text-tinta-suave">
              Hay {encontradas.length - MAXIMO} más. Escribe más del nombre o el departamento.
            </p>
          )}
        </>
      )}
      <Boton variante="secundario" compacto className="self-start" onClick={onCancelar}>
        {textoCancelar}
      </Boton>
    </div>
  )
}
