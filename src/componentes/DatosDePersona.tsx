// Todo lo que se cambia de una persona, en un solo lugar: al final de su
// detalle. Se llega igual desde Registrar, Cobrar y Ajustes > Personas.

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { Boton } from './Boton'
import { BuscarPersona, type Quien } from './BuscarPersona'
import { Confirmar } from './Confirmar'
import { ErrorDeCarga } from './ErrorDeCarga'
import { campo, etiqueta } from './estilos'
import { MensajeDeError } from './MensajeDeError'
import type { DatosAviso } from './useAviso'
import { formatearPesos } from '../lib/pesos'
import { supabase } from '../lib/supabase'
import type { Saldo } from '../lib/tipos'

type Abierto = 'nombre' | 'departamento' | 'archivar' | 'unir' | null

const ERROR_DE_RED = 'No se pudo guardar. Revisa el internet e intenta otra vez.'

export function DatosDePersona({
  saldo: s,
  enPanel,
  mostrar,
  onCambio,
  onUnida,
}: {
  saldo: Saldo
  /** En el panel de al lado el nombre ya es un h2. */
  enPanel: boolean
  mostrar: (aviso: DatosAviso) => void
  onCambio: () => Promise<void>
  /** Tras unirla con otra persona (que queda archivada): abrir la otra. */
  onUnida: (personaId: number) => Promise<void>
}) {
  const [abierto, setAbierto] = useState<Abierto>(null)
  const [unirCon, setUnirCon] = useState<Quien | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const Titulo = enPanel ? 'h3' : 'h2'

  function cerrar() {
    setAbierto(null)
    setUnirCon(null)
  }

  /** Devuelve el error para mostrarlo junto al campo, o null si se guardó. */
  async function renombrar(nombre: string): Promise<string | null> {
    const { error } = await supabase.from('personas').update({ nombre }).eq('id', s.persona_id)
    if (error) return error.code === '23505' ? `Ya hay una persona llamada ${nombre} en ${s.departamento}.` : ERROR_DE_RED
    cerrar()
    mostrar({ tipo: 'ok', texto: `Se cambió el nombre: ahora es ${nombre}.` })
    await onCambio()
    return null
  }

  async function moverA(departamentoId: number, nombreDepto: string): Promise<string | null> {
    const { error } = await supabase.from('personas').update({ departamento_id: departamentoId }).eq('id', s.persona_id)
    if (error) return error.code === '23505' ? `Ya hay una persona llamada ${s.nombre} en ${nombreDepto}.` : ERROR_DE_RED
    cerrar()
    const antes = { id: s.departamento_id, nombre: s.departamento }
    mostrar({
      tipo: 'ok',
      texto: `${s.nombre} ahora está en ${nombreDepto}.`,
      deshacer: async () => {
        const { error } = await supabase.from('personas').update({ departamento_id: antes.id }).eq('id', s.persona_id)
        if (error) mostrar({ tipo: 'error', texto: 'No se pudo deshacer. Revisa el internet.' })
        else mostrar({ tipo: 'ok', texto: `${s.nombre} volvió a ${antes.nombre}.` })
        await onCambio()
      },
    })
    await onCambio()
    return null
  }

  async function cambiarActivo(activo: boolean) {
    setTrabajando(true)
    const { error } = await supabase.from('personas').update({ activo }).eq('id', s.persona_id)
    setTrabajando(false)
    if (error) {
      mostrar({ tipo: 'error', texto: ERROR_DE_RED })
      return
    }
    cerrar()
    mostrar(
      activo
        ? { tipo: 'ok', texto: `${s.nombre} vuelve a aparecer al registrar.` }
        : {
            tipo: 'ok',
            texto: `Se archivó a ${s.nombre}. Ya no aparece al registrar.`,
            deshacer: () => cambiarActivo(true),
          },
    )
    await onCambio()
  }

  async function unir(destino: Quien) {
    setTrabajando(true)
    const { error } = await supabase.rpc('unir_personas', { origen: s.persona_id, destino: destino.id })
    setTrabajando(false)
    if (error) {
      mostrar({
        tipo: 'error',
        texto: error.message.includes('archivada')
          ? 'No se pudo unir: una de las dos ya está archivada. Quizás ya se unieron.'
          : 'No se pudo unir. Revisa el internet e intenta otra vez.',
      })
      return
    }
    cerrar()
    mostrar({ tipo: 'ok', texto: `Se unió ${s.nombre} con ${destino.nombre}. Ahora todo está en ${destino.nombre}.` })
    await onUnida(destino.id)
  }

  const debe = s.saldo > 0

  return (
    <section className="flex flex-col gap-3 border-t border-linea pt-5">
      <Titulo className="text-xl font-semibold">Datos de {s.nombre}</Titulo>

      {abierto === null && (
        <>
          {!s.activo && (
            <p className="text-lg text-tinta-suave">Está archivada: no aparece al registrar ni al dictar.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <Boton variante="secundario" onClick={() => setAbierto('nombre')}>
              Cambiar nombre
            </Boton>
            {s.activo ? (
              <>
                <Boton variante="secundario" onClick={() => setAbierto('departamento')}>
                  Cambiar departamento
                </Boton>
                <Boton variante="secundario" onClick={() => setAbierto('unir')}>
                  Está repetida: unir
                </Boton>
                <Boton variante="secundario" onClick={() => setAbierto('archivar')}>
                  Ya no compra aquí
                </Boton>
              </>
            ) : (
              <Boton variante="secundario" disabled={trabajando} onClick={() => cambiarActivo(true)}>
                Volver a mostrar
              </Boton>
            )}
          </div>
        </>
      )}

      {abierto === 'nombre' && <CambiarNombre nombre={s.nombre} onCancelar={cerrar} onGuardar={renombrar} />}

      {abierto === 'departamento' && (
        <CambiarDepartamento actual={s.departamento_id} onCancelar={cerrar} onGuardar={moverA} />
      )}

      {abierto === 'archivar' && (
        <Confirmar
          forma="tarjeta"
          pregunta={`¿Archivar a ${s.nombre}?`}
          detalle={
            <>
              Ya no aparece al registrar ni al dictar.
              {debe && ` Lo que debe (${formatearPesos(s.saldo)}) sigue en Cobrar.`} Se puede volver a mostrar cuando
              quieras.
            </>
          }
          textoSi="Sí, archivar"
          ocupado={trabajando}
          onNo={cerrar}
          onSi={() => cambiarActivo(false)}
        />
      )}

      {abierto === 'unir' && unirCon === null && (
        <div className="flex flex-col gap-3 rounded-xl bg-hundido p-4">
          <p className="text-lg font-semibold">¿Con quién se une {s.nombre}?</p>
          <BuscarPersona
            excluir={s.persona_id}
            sugerirPara={s.nombre}
            textoCancelar="Cancelar"
            onElegir={setUnirCon}
            onCancelar={cerrar}
          />
        </div>
      )}

      {abierto === 'unir' && unirCon !== null && (
        <Confirmar
          forma="tarjeta"
          tono="aviso"
          pregunta={`¿Unir a ${s.nombre} con ${unirCon.nombre} · ${unirCon.departamento}?`}
          detalle={
            <>
              Todo lo de {s.nombre}
              {s.saldo !== 0 && ` (${s.saldo < 0 ? 'a favor' : 'debe'} ${formatearPesos(Math.abs(s.saldo))})`} pasa a{' '}
              {unirCon.nombre}, y {s.nombre} se archiva. No se puede deshacer.
            </>
          }
          textoSi="Sí, unir"
          ocupado={trabajando}
          textoOcupado="Uniendo..."
          onNo={cerrar}
          onSi={() => unir(unirCon)}
        />
      )}
    </section>
  )
}

function CambiarNombre({
  nombre: actual,
  onCancelar,
  onGuardar,
}: {
  nombre: string
  onCancelar: () => void
  onGuardar: (nombre: string) => Promise<string | null>
}) {
  const [nombre, setNombre] = useState(actual)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idError = useId()
  const limpio = nombre.trim().replace(/\s+/g, ' ')
  const listo = limpio !== '' && limpio !== actual

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!listo || guardando) return
    setGuardando(true)
    const problema = await onGuardar(limpio)
    // Si salió bien, este formulario ya se cerró.
    if (problema) {
      setError(problema)
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-3 rounded-xl bg-hundido p-4">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Nombre y apellido</span>
        <input
          value={nombre}
          onChange={(e) => {
            setError(null)
            setNombre(e.target.value)
          }}
          autoComplete="off"
          autoCapitalize="words"
          autoFocus
          enterKeyHint="done"
          aria-invalid={error !== null}
          aria-describedby={error ? idError : undefined}
          className={`${campo} text-xl`}
        />
      </label>
      {error && <MensajeDeError id={idError} texto={error} />}
      <div className="flex flex-wrap justify-end gap-3">
        <Boton variante="secundario" compacto onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" compacto className="min-w-32" disabled={!listo || guardando}>
          {guardando ? 'Guardando...' : 'Guardar nombre'}
        </Boton>
      </div>
    </form>
  )
}

function CambiarDepartamento({
  actual,
  onCancelar,
  onGuardar,
}: {
  actual: number
  onCancelar: () => void
  onGuardar: (departamentoId: number, nombre: string) => Promise<string | null>
}) {
  const [departamentos, setDepartamentos] = useState<{ id: number; nombre: string }[] | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState(false)
  const [elegido, setElegido] = useState(actual)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idError = useId()

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('departamentos').select('id, nombre').eq('activo', true).order('nombre')
    setErrorDeCarga(error !== null)
    if (data) setDepartamentos(data)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const destino = departamentos?.find((d) => d.id === elegido)
    if (!destino || elegido === actual || guardando) return
    setGuardando(true)
    const problema = await onGuardar(destino.id, destino.nombre)
    if (problema) {
      setError(problema)
      setGuardando(false)
    }
  }

  if (errorDeCarga) return <ErrorDeCarga texto="No se pudieron cargar los departamentos." onReintentar={cargar} />
  if (departamentos === null) return <p className="text-lg text-tinta-suave">Cargando...</p>

  return (
    <form onSubmit={guardar} className="flex flex-col gap-3 rounded-xl bg-hundido p-4">
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Departamento</span>
        <select
          value={elegido}
          onChange={(e) => {
            setError(null)
            setElegido(Number(e.target.value))
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? idError : undefined}
          className={campo}
        >
          {/* Si su departamento está archivado, se muestra igual para que se vea dónde está. */}
          {!departamentos.some((d) => d.id === actual) && <option value={actual}>(archivado)</option>}
          {departamentos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
      </label>
      {error && <MensajeDeError id={idError} texto={error} />}
      <p className="text-lg text-tinta-suave">Lo que ya compró queda con el departamento de ese momento.</p>
      <div className="flex flex-wrap justify-end gap-3">
        <Boton variante="secundario" compacto onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" compacto className="min-w-32" disabled={elegido === actual || guardando}>
          {guardando ? 'Guardando...' : 'Guardar departamento'}
        </Boton>
      </div>
    </form>
  )
}
