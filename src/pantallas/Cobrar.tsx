import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { AgregarPersona, NuevoDepartamento } from '../componentes/AgregarGente'
import { Aviso } from '../componentes/Aviso'
import { useAviso } from '../componentes/useAviso'
import { usePantallaAncha } from '../componentes/usePantallaAncha'
import { Boton } from '../componentes/Boton'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { campo } from '../componentes/estilos'
import { agruparParaCobro, type GrupoDeCobro } from '../lib/cobro'
import { normalizarNombre } from '../lib/personas'
import { formatearPesos } from '../lib/pesos'
import { supabase } from '../lib/supabase'
import type { Perfil, Persona, Saldo } from '../lib/tipos'
import { CuentaDeCobro } from './CuentaDeCobro'
import { DetallePersona } from './DetallePersona'
import { PdfQuincena } from './PdfQuincena'

type Vista = 'lista' | 'quincena' | 'cuentaDeCobro'

export function Cobrar({ perfil, activa }: { perfil: Perfil; activa: boolean }) {
  const [saldos, setSaldos] = useState<Saldo[] | null>(null)
  // Los activos, también los que no tienen a nadie debiendo: ahí se agregan personas.
  const [departamentos, setDepartamentos] = useState<{ id: number; nombre: string }[]>([])
  const [agregandoEn, setAgregandoEn] = useState<number | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [abierta, setAbierta] = useState<number | null>(null)
  // Quien pagó mientras la pantalla está abierta se queda en la lista.
  const [pagadas, setPagadas] = useState<ReadonlySet<number>>(new Set())
  const [plegados, setPlegados] = useState<ReadonlySet<number>>(new Set())
  // Los documentos en PDF se abren en lugar de la lista.
  const [vista, setVista] = useState<Vista>('lista')
  const { aviso, mostrar, cerrar } = useAviso()
  const posicionDeLista = useRef(0)
  // En horizontal, la lista y el historial van lado a lado.
  const ancha = usePantallaAncha()

  const cargar = useCallback(async () => {
    const [{ data, error }, d] = await Promise.all([
      supabase.from('saldos').select('persona_id, nombre, departamento_id, departamento, activo, comprado, pagado, saldo'),
      supabase.from('departamentos').select('id, nombre').eq('activo', true),
    ])
    setErrorDeCarga(error !== null || d.error !== null)
    if (data) setSaldos(data)
    if (d.data) setDepartamentos(d.data)
  }, [])

  // Se recarga cada vez que se entra a la pestaña: pudo haber compras nuevas.
  useEffect(() => {
    if (!activa) return
    setPagadas(new Set())
    cargar()
  }, [activa, cargar])

  // En vertical el historial abre desde arriba; al volver, la lista queda donde estaba.
  useLayoutEffect(() => {
    if (!ancha) window.scrollTo(0, abierta === null ? posicionDeLista.current : 0)
  }, [abierta, ancha])

  useLayoutEffect(() => {
    window.scrollTo(0, vista === 'lista' ? posicionDeLista.current : 0)
  }, [vista])

  if (perfil.rol === 'cocina') {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-titulo font-bold">Cobrar</h1>
        <p className="text-lg text-tinta-suave">Esta parte solo la ven las administradoras.</p>
      </section>
    )
  }

  function abrir(personaId: number) {
    posicionDeLista.current = window.scrollY
    setAbierta(personaId)
  }

  function irA(nueva: Vista) {
    cerrar()
    if (vista === 'lista') posicionDeLista.current = window.scrollY
    setVista(nueva)
  }

  function alternar(departamentoId: number) {
    setPlegados((antes) => {
      const nuevos = new Set(antes)
      if (!nuevos.delete(departamentoId)) nuevos.add(departamentoId)
      return nuevos
    })
  }

  async function registrarPago(s: Saldo, valor: number, tipo: 'total' | 'abono') {
    cerrar()
    const { data, error } = await supabase
      .from('pagos')
      .insert({ persona_id: s.persona_id, valor_pesos: valor, tipo })
      .select('id')
      .single()
    if (error) {
      mostrar({ tipo: 'error', texto: 'No se pudo guardar el pago. Revisa el internet e intenta otra vez.' })
      return false
    }
    setPagadas((antes) => new Set(antes).add(s.persona_id))
    mostrar({
      tipo: 'ok',
      texto: `${tipo === 'total' ? 'Pago' : 'Abono'} guardado: ${s.nombre}, ${formatearPesos(valor)}`,
      deshacer: async () => {
        const { error } = await supabase.from('pagos').update({ anulado: true }).eq('id', data.id)
        if (error) mostrar({ tipo: 'error', texto: 'No se pudo deshacer. Revisa el internet.' })
        else mostrar({ tipo: 'ok', texto: `Se deshizo el ${tipo === 'total' ? 'pago' : 'abono'} de ${s.nombre}.` })
        await cargar()
      },
    })
    await cargar()
    return true
  }

  const avisoFlotante = <Aviso aviso={aviso} onCerrar={cerrar} />

  if (vista !== 'lista') {
    const volver = () => irA('lista')
    return (
      <>
        {vista === 'quincena' ? (
          <PdfQuincena onVolver={volver} onError={(texto) => mostrar({ tipo: 'error', texto })} />
        ) : (
          <CuentaDeCobro onVolver={volver} mostrar={mostrar} />
        )}
        {avisoFlotante}
      </>
    )
  }

  if (saldos === null) {
    return errorDeCarga ? (
      <ErrorDeCarga texto="No se pudieron cargar los saldos." onReintentar={cargar} />
    ) : (
      <p className="text-lg text-tinta-suave">Cargando...</p>
    )
  }

  const persona = saldos.find((s) => s.persona_id === abierta)
  const detalle = persona && (
    <DetallePersona
      key={persona.persona_id}
      saldo={persona}
      enPanel={ancha}
      onVolver={() => setAbierta(null)}
      onCambio={cargar}
      onUnida={async (id) => {
        await cargar()
        setAbierta(id)
      }}
      mostrar={mostrar}
    />
  )
  if (detalle && !ancha) {
    return (
      <>
        {detalle}
        {avisoFlotante}
      </>
    )
  }

  const porCobrar = saldos.reduce((suma, s) => suma + Math.max(s.saldo, 0), 0)
  const grupos = agruparParaCobro(saldos, busqueda, pagadas)
  // Los departamentos sin nadie en la lista van al final: ahí también se agrega gente.
  const buscado = normalizarNombre(busqueda)
  const sinNadie: GrupoDeCobro[] = departamentos
    .filter((d) => !grupos.some((g) => g.departamentoId === d.id))
    .filter((d) => !buscado || normalizarNombre(d.nombre).includes(buscado))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
    .map((d) => ({ departamentoId: d.id, departamento: d.nombre, total: 0, personas: [] }))
  const personas: Persona[] = saldos
    .filter((s) => s.activo)
    .map((s) => ({ id: s.persona_id, nombre: s.nombre, departamento_id: s.departamento_id, activo: true }))
  const nombreDepto = (id: number) => departamentos.find((d) => d.id === id)?.nombre ?? ''

  const botonAgregar = (g: GrupoDeCobro) => (
    <Boton
      variante="tintado"
      compacto
      aria-label={`Agregar persona a ${g.departamento}`}
      onClick={() => {
        cerrar()
        setAgregandoEn(g.departamentoId)
      }}
      className="flex shrink-0 items-center gap-1"
    >
      <span aria-hidden="true" className="text-2xl leading-none">
        +
      </span>
      <span>Persona</span>
    </Boton>
  )

  const formularioAgregar = (g: GrupoDeCobro) => (
    <AgregarPersona
      departamento={{ id: g.departamentoId, nombre: g.departamento }}
      personas={personas.filter((p) => p.departamento_id === g.departamentoId)}
      todas={personas}
      nombreDepto={nombreDepto}
      activa={activa}
      mostrar={mostrar}
      onAgregada={cargar}
      onCerrar={() => setAgregandoEn(null)}
    />
  )

  const lista = (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-titulo font-bold">Cobrar</h1>
        <p className="text-lg text-tinta-suave">
          Por cobrar <span className="font-semibold text-tinta tabular-nums">{formatearPesos(porCobrar)}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Boton variante="secundario" onClick={() => irA('quincena')}>
          PDF de la quincena
        </Boton>
        <Boton variante="secundario" onClick={() => irA('cuentaDeCobro')}>
          Cuenta de cobro
        </Boton>
      </div>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar nombre o departamento"
        aria-label="Buscar persona o departamento"
        autoComplete="off"
        className={campo}
      />

      {errorDeCarga && (
        <ErrorDeCarga texto="No se pudieron actualizar los saldos." onReintentar={cargar} />
      )}

      {grupos.length === 0 && (busqueda === '' || sinNadie.length === 0) && (
        <p className="text-lg text-tinta-suave">
          {busqueda ? 'No hay nadie con ese nombre.' : 'Nadie debe. Todo está al día.'}
        </p>
      )}

      {grupos.map((g) => {
        // Al buscar se muestran todos, aunque el departamento esté plegado.
        const plegado = plegados.has(g.departamentoId) && !busqueda
        return (
          <div key={g.departamentoId}>
            <div className="sticky top-0 z-10 -mx-2 flex items-center gap-3 bg-fondo/95 px-2 backdrop-blur">
              <h2 className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => alternar(g.departamentoId)}
                  aria-expanded={!plegado}
                  className="flex min-h-12 w-full items-center gap-2 py-1 text-left"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className={`h-5 w-5 shrink-0 fill-none stroke-tinta-tenue stroke-[2.5] transition-transform motion-reduce:transition-none ${
                      plegado ? '-rotate-90' : ''
                    }`}
                  >
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-xl font-semibold">{g.departamento}</span>
                  <span className="flex-1 text-base text-tinta-suave">
                    · {g.personas.length} {g.personas.length === 1 ? 'persona' : 'personas'}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">{formatearPesos(g.total)}</span>
                </button>
              </h2>
              {botonAgregar(g)}
            </div>
            {agregandoEn === g.departamentoId && <div className="mb-3">{formularioAgregar(g)}</div>}
            {!plegado && (
              <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
                {g.personas.map((s) => (
                  <FilaDeCobro
                    key={s.persona_id}
                    saldo={s}
                    seleccionada={ancha && s.persona_id === abierta}
                    onAbrir={() => abrir(s.persona_id)}
                    onPago={(valor, tipo) => registrarPago(s, valor, tipo)}
                  />
                ))}
              </ul>
            )}
          </div>
        )
      })}

      {sinNadie.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{grupos.length > 0 ? 'Sin nada por cobrar' : 'Departamentos'}</h2>
          <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
            {sinNadie.map((g) => (
              <li key={g.departamentoId}>
                <div className="flex min-h-14 items-center gap-3 py-1.5 pr-3 pl-4">
                  <span className="min-w-0 flex-1 text-lg">{g.departamento}</span>
                  {botonAgregar(g)}
                </div>
                {agregandoEn === g.departamentoId && <div className="px-3 pb-3">{formularioAgregar(g)}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <NuevoDepartamento mostrar={mostrar} onAgregado={cargar} />
      <p className="text-base text-tinta-suave">
        Para cambiar un nombre, mover a alguien de departamento o archivar, ve a Ajustes.
      </p>
    </section>
  )

  if (!ancha) {
    return (
      <>
        {lista}
        {avisoFlotante}
      </>
    )
  }

  // El panel del historial se queda quieto mientras la lista se desplaza.
  return (
    <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-8">
      {lista}
      <aside
        aria-label="Historial"
        className="sticky top-6 max-h-[calc(100dvh-var(--alto-pestanas)-env(safe-area-inset-bottom)-3rem)] overflow-y-auto overscroll-contain rounded-2xl bg-hundido p-5"
      >
        {detalle ?? (
          <p className="py-8 text-center text-lg text-tinta-suave">
            Toca un nombre para ver su historial.
          </p>
        )}
      </aside>
      {avisoFlotante}
    </div>
  )
}

function FilaDeCobro({
  saldo: s,
  seleccionada,
  onAbrir,
  onPago,
}: {
  saldo: Saldo
  seleccionada: boolean
  onAbrir: () => void
  onPago: (valor: number, tipo: 'total' | 'abono') => Promise<boolean>
}) {
  const [modo, setModo] = useState<'nada' | 'total' | 'abono'>('nada')
  const [abono, setAbono] = useState('')
  const [guardando, setGuardando] = useState(false)
  const valorAbono = Number(abono)

  async function pagar(valor: number, tipo: 'total' | 'abono') {
    setGuardando(true)
    const ok = await onPago(valor, tipo)
    setGuardando(false)
    if (ok) {
      setModo('nada')
      setAbono('')
    }
  }

  function guardarAbono(e: FormEvent) {
    e.preventDefault()
    if (valorAbono > 0 && !guardando) pagar(valorAbono, 'abono')
  }

  return (
    <li>
      <div className="flex items-center gap-2 py-1.5 pr-3">
        <button
          type="button"
          onClick={onAbrir}
          aria-current={seleccionada ? 'true' : undefined}
          className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-r-lg pl-4 text-left active:bg-hundido ${
            seleccionada ? 'bg-marca-suave font-semibold text-marca-oscura' : ''
          }`}
        >
          <span className="min-w-0 flex-1 text-lg">{s.nombre}</span>
          <MontoDeSaldo valor={s.saldo} />
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 fill-none stroke-tinta-tenue stroke-2">
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {modo === 'nada' && s.saldo > 0 && (
          <>
            <Boton variante="tintado" compacto onClick={() => setModo('total')}>
              Pagó todo
            </Boton>
            <Boton variante="secundario" compacto onClick={() => setModo('abono')}>
              Abono
            </Boton>
          </>
        )}
      </div>

      {modo === 'total' && (
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 bg-marca-suave px-4 py-3">
          <span className="mr-auto text-lg">
            ¿{s.nombre} pagó <span className="font-semibold tabular-nums">{formatearPesos(s.saldo)}</span>?
          </span>
          <Boton variante="secundario" compacto disabled={guardando} onClick={() => setModo('nada')}>
            No
          </Boton>
          <Boton compacto disabled={guardando} onClick={() => pagar(s.saldo, 'total')}>
            {guardando ? 'Guardando...' : 'Sí, pagó'}
          </Boton>
        </div>
      )}

      {modo === 'abono' && (
        <form onSubmit={guardarAbono} className="flex flex-col gap-2 bg-marca-suave px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <input
              value={abono}
              onChange={(e) => setAbono(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
              inputMode="numeric"
              enterKeyHint="done"
              placeholder="Cuánto abonó"
              aria-label={`Abono de ${s.nombre}`}
              autoFocus
              className={`${campo} max-w-48`}
            />
            <span className="mr-auto text-xl font-semibold tabular-nums">
              {valorAbono > 0 ? formatearPesos(valorAbono) : ''}
            </span>
            <Boton variante="secundario" compacto disabled={guardando} onClick={() => setModo('nada')}>
              Cancelar
            </Boton>
            <Boton type="submit" compacto disabled={!(valorAbono > 0) || guardando}>
              {guardando ? 'Guardando...' : 'Guardar abono'}
            </Boton>
          </div>
          {valorAbono > s.saldo && (
            <p className="text-base text-info">
              Es más de lo que debe: quedará {formatearPesos(valorAbono - s.saldo)} a favor.
            </p>
          )}
        </form>
      )}
    </li>
  )
}

function MontoDeSaldo({ valor }: { valor: number }) {
  if (valor === 0) return <span className="text-lg font-semibold text-exito">Al día</span>
  if (valor < 0) {
    return (
      <span className="text-lg font-semibold text-exito tabular-nums">A favor {formatearPesos(-valor)}</span>
    )
  }
  return <span className="text-lg font-semibold tabular-nums">{formatearPesos(valor)}</span>
}
