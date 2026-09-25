import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Aviso } from '../componentes/Aviso'
import { useAviso } from '../componentes/useAviso'
import { Boton } from '../componentes/Boton'
import { Calendario, ElegirDia } from '../componentes/ElegirDia'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { campo } from '../componentes/estilos'
import { Microfono } from '../componentes/Microfono'
import { Parecidas } from '../componentes/Parecidas'
import { leerDictado } from '../lib/dictado'
import { DIAS_ATRAS_PERMITIDOS, fechaLarga, hora, hoyBogota, nombreDelDia } from '../lib/fechas'
import { guardarPago } from '../lib/pagos'
import { normalizarNombre, vocabulario } from '../lib/personas'
import { formatearPesos, valorInusual } from '../lib/pesos'
import { supabase } from '../lib/supabase'
import type { Departamento, Perfil, Persona, Saldo } from '../lib/tipos'
import { DetallePersona, MOTIVO_CORREGIDA } from './DetallePersona'

interface Borrador {
  textoOriginal: string
  personaId: number | null
  candidatas: Persona[]
  /** Para crear una persona nueva cuando no se elige una existente. */
  nombreNuevo: string
  departamentoId: number | null
  descripcion: string
  valor: string
  /** El día de la compra, "2026-09-15". */
  fecha: string
}

interface CompraDelDia {
  id: number
  persona_id: number
  descripcion: string | null
  valor_pesos: number
  anulada: boolean
  creada_en: string
  personas: { nombre: string } | null
  departamentos: { nombre: string } | null
}

function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '').replace(/^0+/, '')
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** " (martes 15 de septiembre)" si no es hoy; si es hoy, nada. */
function sufijoDelDia(fecha: string, hoy: string): string {
  return fecha === hoy ? '' : ` (${nombreDelDia(fecha, hoy).toLowerCase()})`
}

export function Registrar({ perfil, activa, inicio }: { perfil: Perfil; activa: boolean; inicio: number }) {
  const [departamentos, setDepartamentos] = useState<Departamento[] | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState(false)
  const [personas, setPersonas] = useState<Persona[]>([])
  // Cuántas compras recientes tiene cada persona: sus nombres van primero al reconocimiento de voz.
  const [comprasRecientes, setComprasRecientes] = useState<ReadonlyMap<number, number>>(new Map())
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [porAnular, setPorAnular] = useState<CompraDelDia | null>(null)
  // Al tocar una compra del día se ve todo lo de esa persona, en lugar de Registrar.
  const [abierta, setAbierta] = useState<Saldo | null>(null)
  const posicionDeRegistrar = useRef(0)
  // Tocar la pestaña Registrar estando en ella cierra el historial abierto. La
  // compra a medio anotar se queda: solo se descarta con Cancelar.
  const [inicioVisto, setInicioVisto] = useState(inicio)
  if (inicio !== inicioVisto) {
    setInicioVisto(inicio)
    setAbierta(null)
  }
  // Con el día al que pertenecen: al cambiar de día no se muestran las del anterior.
  const [comprasCargadas, setComprasCargadas] = useState<{ dia: string; lista: CompraDelDia[] } | null>(null)
  const { aviso, mostrar, cerrar } = useAviso()
  const puedeAnular = perfil.rol === 'admin' || perfil.rol === 'operador'
  // La cocina solo registra lo de hoy; la base tampoco se lo permite.
  const puedeCambiarDia = puedeAnular

  // El día en que se están anotando las compras. Si se eligió otro día, dura
  // hasta que se vuelva a hoy o hasta mañana: nunca queda pegado de un día para otro.
  const hoy = hoyBogota()
  const [eleccion, setEleccion] = useState<{ dia: string; elegidoEl: string } | null>(null)
  const dia = eleccion && eleccion.elegidoEl === hoy ? eleccion.dia : hoy
  const compras = comprasCargadas?.dia === dia ? comprasCargadas.lista : null
  const cambiarDia = useCallback((nuevo: string) => {
    const hoyAhora = hoyBogota()
    setEleccion(nuevo === hoyAhora ? null : { dia: nuevo, elegidoEl: hoyAhora })
  }, [])

  const cargarDepartamentos = useCallback(async () => {
    const { data, error } = await supabase
      .from('departamentos')
      .select('id, nombre, alias, activo')
      .eq('activo', true)
      .order('nombre')
    setErrorDeCarga(error !== null)
    if (data) setDepartamentos(data)
  }, [])

  // Quien está en un departamento archivado tampoco aparece al registrar.
  const cargarPersonas = useCallback(async () => {
    const { data } = await supabase
      .from('personas')
      .select('id, nombre, departamento_id, activo, departamentos!inner(activo)')
      .eq('activo', true)
      .eq('departamentos.activo', true)
    if (data) setPersonas(data.map(({ id, nombre, departamento_id, activo }) => ({ id, nombre, departamento_id, activo })))
  }, [])

  const cargarComprasRecientes = useCallback(async () => {
    const desde = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    const { data } = await supabase.from('compras').select('persona_id').eq('anulada', false).gte('fecha', desde)
    if (!data) return
    const cuantas = new Map<number, number>()
    for (const { persona_id } of data) cuantas.set(persona_id, (cuantas.get(persona_id) ?? 0) + 1)
    setComprasRecientes(cuantas)
  }, [])

  // Lo de las personas archivadas no aparece en la lista del día (ni cuenta en
  // su total, ni lo anula "bórrala"). Sigue en su historial, en Cobrar.
  const cargarCompras = useCallback(async () => {
    const { data } = await supabase
      .from('compras')
      .select('id, persona_id, descripcion, valor_pesos, anulada, creada_en, personas!inner(nombre, activo), departamentos(nombre)')
      // Las que se corrigieron en el historial ya tienen su reemplazo en la lista.
      .or(`anulada_motivo.is.null,anulada_motivo.neq.${MOTIVO_CORREGIDA}`)
      .eq('fecha', dia)
      .eq('personas.activo', true)
      .order('creada_en', { ascending: false })
    if (data) setComprasCargadas({ dia, lista: data as unknown as CompraDelDia[] })
  }, [dia])

  // Se recarga al volver a la pestaña: en otras pantallas pudo cambiar algo.
  useEffect(() => {
    if (!activa) return
    cargarDepartamentos()
    cargarPersonas()
    cargarComprasRecientes()
  }, [activa, cargarDepartamentos, cargarPersonas, cargarComprasRecientes])

  useEffect(() => {
    if (activa) cargarCompras()
  }, [activa, cargarCompras])

  // Si se volvió con el historial de alguien abierto, su saldo pudo cambiar en Cobrar.
  const estabaActiva = useRef(activa)
  useEffect(() => {
    const volvio = activa && !estabaActiva.current
    estabaActiva.current = activa
    if (!volvio || !abierta) return
    cargarSaldo(abierta.persona_id).then((saldo) => {
      if (saldo) setAbierta(saldo)
    })
  }, [activa, abierta])

  // El historial abre desde arriba; al volver, Registrar queda donde estaba.
  const hayAbierta = abierta !== null
  useLayoutEffect(() => {
    window.scrollTo(0, hayAbierta ? 0 : posicionDeRegistrar.current)
  }, [hayAbierta])

  function leer(texto: string) {
    const frase = texto.trim()
    if (!frase || !departamentos) return
    cerrar()
    setPorAnular(null)
    const lectura = leerDictado(frase, departamentos, personas, hoyBogota())

    if (lectura.tipo === 'anular') {
      if (!puedeAnular) return
      // La más reciente del día que se está viendo.
      const ultima = compras?.find((c) => !c.anulada)
      if (ultima) setPorAnular(ultima)
      else mostrar({ tipo: 'error', texto: `No hay compras para anular${sufijoDelDia(dia, hoy) || ' hoy'}.` })
      return
    }

    const fecha = puedeCambiarDia ? (lectura.fecha ?? dia) : hoy
    // Solo se dijo el día ("el martes"): desde ahora se anota en ese día.
    const soloElDia =
      lectura.fecha !== null && !lectura.nombre && !lectura.persona && lectura.valor === null && !lectura.descripcion
    if (soloElDia) {
      if (puedeCambiarDia) {
        cambiarDia(fecha)
        mostrar({ tipo: 'ok', texto: `Ahora se anotan las compras de${fecha === hoy ? ' hoy' : `l ${fechaLarga(fecha)}`}.` })
      }
      return
    }

    setBorrador({
      textoOriginal: frase,
      personaId: lectura.persona?.id ?? null,
      candidatas: lectura.candidatas,
      nombreNuevo: lectura.nombre,
      departamentoId: lectura.departamentoId,
      descripcion: lectura.descripcion,
      valor: lectura.valor ? String(lectura.valor) : '',
      fecha,
    })
  }

  // Sin dictar: la tarjeta vacía, para elegir quién y poner el valor a mano.
  function anotarAMano() {
    cerrar()
    setPorAnular(null)
    setBorrador({
      textoOriginal: '',
      personaId: null,
      candidatas: [],
      nombreNuevo: '',
      departamentoId: null,
      descripcion: '',
      valor: '',
      fecha: dia,
    })
  }

  async function guardar(b: Borrador) {
    cerrar()
    const personaId = b.personaId ?? (await crearPersona(b.nombreNuevo.trim(), b.departamentoId!))
    if (personaId === null) {
      mostrar({ tipo: 'error', texto: 'No se pudo crear la persona. Revisa el internet e intenta otra vez.' })
      return
    }
    const { data, error } = await supabase
      .from('compras')
      .insert({
        persona_id: personaId,
        descripcion: b.descripcion.trim() || null,
        valor_pesos: Number(b.valor),
        texto_original: b.textoOriginal || null,
        fecha: b.fecha,
      })
      .select('id')
      .single()
    if (error) {
      mostrar({ tipo: 'error', texto: 'No se pudo guardar. Revisa el internet e intenta otra vez.' })
      return
    }
    const persona = personas.find((p) => p.id === personaId)
    const nombre = persona?.nombre ?? b.nombreNuevo.trim()
    const hoyAhora = hoyBogota()
    mostrar({
      tipo: 'ok',
      texto:
        `Guardado: ${[nombre, b.descripcion.trim(), formatearPesos(Number(b.valor))].filter(Boolean).join(', ')}` +
        sufijoDelDia(b.fecha, hoyAhora),
      deshacer: puedeAnular ? () => cambiarAnulada(data.id, true, 'Se deshizo la compra.') : undefined,
    })
    // Si se dictó "ayer" o "el martes", lo que sigue suele ser del mismo día.
    if (b.fecha !== dia) cambiarDia(b.fecha)
    setBorrador(null)
    cargarPersonas()
    if (b.fecha === dia) cargarCompras()
  }

  /** Crea la persona; si ya existía con ese nombre en el departamento, usa esa. */
  async function crearPersona(nombre: string, departamentoId: number): Promise<number | null> {
    const { data, error } = await supabase
      .from('personas')
      .insert({ nombre, departamento_id: departamentoId })
      .select('id')
      .single()
    if (data) return data.id
    if (error?.code !== '23505') return null
    const { data: existentes } = await supabase
      .from('personas')
      .select('id, nombre')
      .eq('departamento_id', departamentoId)
      .eq('activo', true)
    const clave = normalizarNombre(nombre)
    return existentes?.find((p) => normalizarNombre(p.nombre) === clave)?.id ?? null
  }

  async function cambiarAnulada(id: number, anulada: boolean, textoOk: string) {
    const { error } = await supabase.from('compras').update({ anulada }).eq('id', id)
    if (error) mostrar({ tipo: 'error', texto: 'No se pudo hacer el cambio. Revisa el internet.' })
    else mostrar({ tipo: 'ok', texto: textoOk })
    await cargarCompras()
  }

  async function anular(c: CompraDelDia) {
    setPorAnular(null)
    const { error } = await supabase.from('compras').update({ anulada: true }).eq('id', c.id)
    await cargarCompras()
    if (error) {
      mostrar({ tipo: 'error', texto: 'No se pudo anular. Revisa el internet.' })
      return
    }
    mostrar({
      tipo: 'ok',
      texto: `Se anuló: ${[c.personas?.nombre, c.descripcion, formatearPesos(c.valor_pesos)].filter(Boolean).join(', ')}`,
      deshacer: () => cambiarAnulada(c.id, false, 'Se recuperó la compra.'),
    })
  }

  async function cargarSaldo(personaId: number): Promise<Saldo | null> {
    const { data } = await supabase
      .from('saldos')
      .select('persona_id, nombre, departamento_id, departamento, activo, comprado, pagado, saldo')
      .eq('persona_id', personaId)
      .maybeSingle()
    return data
  }

  async function abrirPersona(personaId: number) {
    cerrar()
    const saldo = await cargarSaldo(personaId)
    if (!saldo) {
      mostrar({ tipo: 'error', texto: 'No se pudo abrir. Revisa el internet e intenta otra vez.' })
      return
    }
    posicionDeRegistrar.current = window.scrollY
    setAbierta(saldo)
  }

  // Lo que se anula en el historial puede ser una compra de la lista del día.
  async function alCambiarDetalle() {
    if (!abierta) return
    const [saldo] = await Promise.all([cargarSaldo(abierta.persona_id), cargarCompras()])
    if (saldo) setAbierta(saldo)
  }

  if (departamentos === null) {
    return errorDeCarga ? (
      <ErrorDeCarga texto="No se pudieron cargar los departamentos." onReintentar={cargarDepartamentos} />
    ) : (
      <p className="text-lg text-tinta-suave">Cargando...</p>
    )
  }

  if (abierta) {
    return (
      <>
        <DetallePersona
          key={abierta.persona_id}
          saldo={abierta}
          enPanel={false}
          volverA="Registrar"
          diaParaAgregar={dia}
          onVolver={() => setAbierta(null)}
          onCambio={alCambiarDetalle}
          onPago={(valor, tipo) => {
            cerrar()
            return guardarPago({ saldo: abierta, valor, tipo, mostrar, recargar: alCambiarDetalle })
          }}
          onUnida={async (id) => {
            const [saldo] = await Promise.all([cargarSaldo(id), cargarCompras(), cargarPersonas()])
            setAbierta(saldo)
          }}
          mostrar={mostrar}
        />
        <Aviso aviso={aviso} onCerrar={cerrar} />
      </>
    )
  }

  return (
    // En horizontal: a la izquierda se registra, a la derecha lo del día.
    <section className="flex flex-col gap-5 ancha:grid ancha:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] ancha:items-start ancha:gap-x-10">
      <div className="flex flex-col gap-5">
        <h1 className="text-titulo font-bold">Registrar</h1>

        {departamentos.length === 0 && (
          <p className="rounded-xl bg-info-suave p-4 text-lg text-info">
            Primero hay que crear los departamentos, en Cobrar.
          </p>
        )}

        {puedeCambiarDia && <DiaDeRegistro dia={dia} hoy={hoy} onCambiar={cambiarDia} />}

        {porAnular ? (
          <PreguntaAnular compra={porAnular} onSi={() => anular(porAnular)} onNo={() => setPorAnular(null)} />
        ) : borrador ? (
          <Confirmacion
            borrador={borrador}
            hoy={hoy}
            puedeCambiarDia={puedeCambiarDia}
            departamentos={departamentos}
            personas={personas}
            onCambiar={setBorrador}
            onGuardar={guardar}
            onCancelar={() => setBorrador(null)}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {/* Solo en la pestaña visible, para que el micrófono no quede encendido. */}
            {activa && (
              <Microfono
                vocabulario={() => vocabulario(personas, departamentos, comprasRecientes)}
                onTexto={leer}
                onError={(mensaje) => mostrar({ tipo: 'error', texto: mensaje })}
                sinVoz="Toca «Anotar a mano» para anotarla sin hablar."
                onEmpezar={cerrar}
              />
            )}
            {/* Sin dictar: se elige quién y se pone cuánto. También si la voz falla o no hay micrófono. */}
            <Boton variante="texto" compacto className="-ml-4 self-start" onClick={anotarAMano}>
              Anotar a mano
            </Boton>
          </div>
        )}
      </div>

      <ComprasDelDia
        dia={dia}
        hoy={hoy}
        compras={compras}
        puedeAnular={puedeAnular}
        onAnular={anular}
        // La cocina no ve saldos ni pagos: para ella la lista no abre nada.
        onAbrir={puedeAnular ? abrirPersona : undefined}
      />

      <Aviso aviso={aviso} onCerrar={cerrar} />
    </section>
  )
}

// Día en que se anota ---------------------------------------------------------

function DiaDeRegistro({ dia, hoy, onCambiar }: { dia: string; hoy: string; onCambiar: (dia: string) => void }) {
  const [calendario, setCalendario] = useState(false)

  if (dia === hoy) {
    // La fecha y "Cambiar" abren el calendario de una vez.
    return (
      <div className="-my-2 flex flex-wrap items-center gap-x-3">
        <p className="text-xl text-tinta-suave">
          Compras de{' '}
          <button
            type="button"
            onClick={() => setCalendario(true)}
            aria-haspopup="dialog"
            className="rounded-md font-semibold text-tinta active:bg-hundido"
          >
            hoy, {fechaLarga(hoy)}
          </button>
        </p>
        <Boton variante="texto" compacto className="-ml-2" aria-haspopup="dialog" onClick={() => setCalendario(true)}>
          Cambiar
        </Boton>
        {calendario && (
          <Calendario
            dia={dia}
            hoy={hoy}
            diasAtras={DIAS_ATRAS_PERMITIDOS}
            titulo="Día de las compras"
            onElegir={(nuevo) => {
              setCalendario(false)
              onCambiar(nuevo)
            }}
            onCerrar={() => setCalendario(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-aviso bg-aviso-suave p-4" role="status">
      <div>
        <p className="text-2xl font-bold">Anotando compras del {fechaLarga(dia)}</p>
        <p className="text-base text-aviso">Todo lo que se registre ahora queda con ese día, no con hoy.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <ElegirDia
          dia={dia}
          hoy={hoy}
          etiqueta="Día de las compras"
          className="min-w-0 flex-1 basis-64"
          onCambiar={onCambiar}
        />
        <Boton variante="secundario" onClick={() => onCambiar(hoy)}>
          Volver a hoy
        </Boton>
      </div>
    </div>
  )
}

// Tarjeta de confirmación -----------------------------------------------------

function Confirmacion({
  borrador: b,
  hoy,
  puedeCambiarDia,
  departamentos,
  personas,
  onCambiar,
  onGuardar,
  onCancelar,
}: {
  borrador: Borrador
  hoy: string
  puedeCambiarDia: boolean
  departamentos: Departamento[]
  personas: Persona[]
  onCambiar: (b: Borrador) => void
  onGuardar: (b: Borrador) => Promise<void>
  onCancelar: () => void
}) {
  const [guardando, setGuardando] = useState(false)
  // Cómo se elige quién: entre las sugeridas del dictado, buscando entre las que
  // ya existen o anotando una persona nueva. A mano se empieza buscando.
  const [modo, setModo] = useState<'sugeridas' | 'buscar' | 'nueva'>(
    b.candidatas.length > 0 ? 'sugeridas' : b.nombreNuevo.trim() !== '' ? 'nueva' : 'buscar',
  )
  const [busqueda, setBusqueda] = useState('')
  // Casi nunca se dice qué llevó: el campo aparece solo si se dijo o se pide.
  const [conDescripcion, setConDescripcion] = useState(b.descripcion !== '')
  const cambiar = (cambios: Partial<Borrador>) => onCambiar({ ...b, ...cambios })
  const nombreDepto = (id: number) => departamentos.find((d) => d.id === id)?.nombre ?? ''
  const elegida = personas.find((p) => p.id === b.personaId) ?? null
  const personaNueva = elegida === null && modo === 'nueva'
  // Cada palabra buscada debe estar en el nombre o en el departamento: «juan tdh».
  const palabras = normalizarNombre(busqueda).split(' ').filter(Boolean)
  const encontradas =
    palabras.length === 0
      ? []
      : personas
          .filter((p) => {
            const donde = normalizarNombre(`${p.nombre} ${nombreDepto(p.departamento_id)}`)
            return palabras.every((palabra) => donde.includes(palabra))
          })
          .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
  const MAXIMO = 8

  const botonPersona = (p: Persona) => (
    <button
      key={p.id}
      type="button"
      onClick={() => cambiar({ personaId: p.id })}
      className="min-h-14 rounded-xl border border-control px-4 text-left text-xl active:bg-hundido"
    >
      <span className="font-semibold">{p.nombre}</span>{' '}
      <span className="font-semibold text-tinta-suave">· {nombreDepto(p.departamento_id)}</span>
    </button>
  )

  function buscarExistente() {
    setBusqueda(b.nombreNuevo.trim().split(/\s+/)[0] ?? '')
    setModo('buscar')
  }

  function anotarNueva() {
    // Lo que se estaba buscando suele ser el nombre de la persona nueva.
    if (b.nombreNuevo.trim() === '' && busqueda.trim() !== '') cambiar({ nombreNuevo: busqueda.trim() })
    setModo('nueva')
  }
  const otroDia = b.fecha !== hoy

  const valor = Number(b.valor)
  const faltan = [
    !(elegida !== null || (personaNueva && b.nombreNuevo.trim() !== '' && b.departamentoId !== null)) &&
      (personaNueva ? 'nombre y departamento' : 'elegir quién'),
    !(valor > 0) && 'cuánto',
  ].filter((f): f is string => typeof f === 'string')
  const listo = faltan.length === 0
  // Un valor raro (casi siempre un "mil" que se perdió) se confirma antes de guardar.
  const [preguntando, setPreguntando] = useState(false)
  const inusual = valorInusual(valor)
  const campoValor = useRef<HTMLInputElement>(null)

  function corregirValor() {
    setPreguntando(false)
    campoValor.current?.focus()
    campoValor.current?.select()
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!listo || guardando) return
    if (inusual && !preguntando) {
      setPreguntando(true)
      return
    }
    setGuardando(true)
    await onGuardar(b)
    setGuardando(false)
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-5 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      {/* Guardar va arriba a la derecha: se alcanza sin bajar, aunque el teclado tape el final. */}
      {preguntando ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-aviso-suave p-4">
          <div className="mr-auto">
            <p className="text-xl font-semibold">
              ¿Seguro que son <span className="tabular-nums">{formatearPesos(valor)}</span>?
            </p>
            <p className="text-base text-aviso">
              {inusual === 'bajo'
                ? 'Parece poco para una compra. ¿Faltó decir "mil"?'
                : 'Parece mucho para una compra.'}
            </p>
          </div>
          <Boton variante="secundario" onClick={corregirValor}>
            Corregir
          </Boton>
          <Boton type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : `Sí, son ${formatearPesos(valor)}`}
          </Boton>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-b border-linea pb-4">
          <p className="mr-auto text-base text-aviso">{!listo && `Falta: ${faltan.join(', ')}.`}</p>
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton type="submit" className="min-w-44" disabled={!listo || guardando}>
            {guardando ? 'Guardando...' : 'OK'}
          </Boton>
        </div>
      )}

      {/* Quién */}
      <div className="flex flex-col gap-2">
        <span className="text-base font-semibold text-tinta-suave">Quién</span>
        {elegida ? (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-2xl font-bold">
              {elegida.nombre}{' '}
              <span className="font-semibold text-tinta-suave">· {nombreDepto(elegida.departamento_id)}</span>
            </p>
            <Boton
              variante="secundario"
              compacto
              onClick={() => {
                // Se ofrecen las que empiezan con el mismo nombre, además de buscar o crear una nueva.
                const primer = normalizarNombre(elegida.nombre).split(' ')[0]
                const parecidas = personas.filter((p) => normalizarNombre(p.nombre).split(' ')[0] === primer)
                const sugeridas = b.candidatas.length > 0 ? b.candidatas : parecidas
                setModo(sugeridas.length > 0 ? 'sugeridas' : 'buscar')
                cambiar({ personaId: null, candidatas: sugeridas })
              }}
            >
              Cambiar
            </Boton>
          </div>
        ) : modo === 'nueva' ? (
          <>
            <p className="text-base text-tinta-suave">Persona nueva. Escribe el nombre y elige el departamento:</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={b.nombreNuevo}
                onChange={(e) => cambiar({ nombreNuevo: e.target.value })}
                placeholder="Nombre"
                aria-label="Nombre de la persona nueva"
                autoComplete="off"
                autoCapitalize="words"
                className={campo}
              />
              <select
                value={b.departamentoId ?? ''}
                onChange={(e) => cambiar({ departamentoId: e.target.value ? Number(e.target.value) : null })}
                aria-label="Departamento de la persona nueva"
                className={campo}
              >
                <option value="">Elegir departamento...</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>
            <Parecidas
              nombre={b.nombreNuevo}
              personas={personas}
              nombreDepto={nombreDepto}
              onElegir={(p) => cambiar({ personaId: p.id })}
            />
            <Boton variante="texto" compacto className="-ml-4 self-start" onClick={buscarExistente}>
              Elegir una persona que ya existe
            </Boton>
          </>
        ) : modo === 'buscar' ? (
          <>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre"
              aria-label="Buscar una persona que ya existe"
              autoComplete="off"
              autoCapitalize="words"
              autoFocus
              className={campo}
            />
            {palabras.length === 0 ? (
              <p className="text-base text-tinta-suave">Escribe el nombre, o el nombre y el departamento.</p>
            ) : encontradas.length === 0 ? (
              <p className="text-base text-tinta-suave">No hay nadie con ese nombre.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {encontradas.slice(0, MAXIMO).map(botonPersona)}
                {encontradas.length > MAXIMO && (
                  <p className="text-base text-tinta-suave">
                    Hay {encontradas.length - MAXIMO} más. Escribe más del nombre o el departamento.
                  </p>
                )}
              </div>
            )}
            <Boton variante="texto" compacto className="-ml-4 self-start" onClick={anotarNueva}>
              No está: es una persona nueva
            </Boton>
            {b.candidatas.length > 0 && (
              <Boton variante="texto" compacto className="-ml-4 self-start" onClick={() => setModo('sugeridas')}>
                Volver a las personas sugeridas
              </Boton>
            )}
          </>
        ) : (
          <>
            <p className="text-base text-tinta-suave">¿Es alguna de estas personas?</p>
            <div className="flex flex-col gap-2">{b.candidatas.map(botonPersona)}</div>
            <Boton variante="texto" compacto className="-ml-4 self-start" onClick={() => setModo('buscar')}>
              Buscar otra persona
            </Boton>
            <Boton variante="texto" compacto className="-ml-4 self-start" onClick={anotarNueva}>
              No es ninguna: es una persona nueva
            </Boton>
          </>
        )}
      </div>

      {/* Cuánto y qué día */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-tinta-suave">Cuánto</span>
          <span className="flex min-h-16 items-center rounded-xl border border-control bg-superficie px-4 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-marca">
            <span aria-hidden="true" className="text-3xl font-bold text-tinta-suave">
              $
            </span>
            <input
              ref={campoValor}
              value={b.valor === '' ? '' : Number(b.valor).toLocaleString('es-CO')}
              onChange={(e) => {
                setPreguntando(false)
                cambiar({ valor: soloDigitos(e.target.value) })
              }}
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              aria-label="Cuánto, en pesos"
              className="w-full min-w-0 bg-transparent pl-1 text-3xl font-bold tabular-nums outline-none placeholder:text-tinta-tenue"
            />
          </span>
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-base font-semibold text-tinta-suave">Día</span>
          {puedeCambiarDia ? (
            <ElegirDia
              dia={b.fecha}
              hoy={hoy}
              etiqueta="Día de la compra"
              resaltado={otroDia}
              grande
              onCambiar={(fecha) => cambiar({ fecha })}
            />
          ) : (
            <p className="flex min-h-16 items-center text-lg">Hoy</p>
          )}
        </div>
      </div>

      {/* Qué llevó: opcional */}
      {conDescripcion ? (
        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-tinta-suave">
            Qué llevó <span className="font-normal">(opcional)</span>
          </span>
          <input
            value={b.descripcion}
            onChange={(e) => cambiar({ descripcion: e.target.value })}
            autoComplete="off"
            autoFocus={b.descripcion === ''}
            className={campo}
          />
        </label>
      ) : (
        <Boton variante="texto" compacto className="-my-2 -ml-4 self-start" onClick={() => setConDescripcion(true)}>
          + Anotar qué llevó
        </Boton>
      )}
    </form>
  )
}

// "Bórrala" -------------------------------------------------------------------

function PreguntaAnular({ compra: c, onSi, onNo }: { compra: CompraDelDia; onSi: () => void; onNo: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-4 rounded-2xl border-2 border-peligro-linea bg-peligro-suave p-5">
      <p className="text-xl font-bold">¿Anular la última compra?</p>
      <div className="rounded-xl bg-superficie px-4 py-3">
        <p className="text-xl">
          <span className="font-semibold">{c.personas?.nombre}</span>{' '}
          <span className="text-tinta-suave">· {c.departamentos?.nombre}</span>
        </p>
        <p className="text-lg text-tinta-suave">
          <span className="font-semibold text-tinta tabular-nums">{formatearPesos(c.valor_pesos)}</span>
          {c.descripcion && ` · ${c.descripcion}`} · anotada a las {hora(c.creada_en)}
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Boton variante="secundario" onClick={onNo}>
          No
        </Boton>
        <Boton variante="peligro" onClick={onSi}>
          Sí, anular
        </Boton>
      </div>
    </div>
  )
}

// Lo registrado en el día -----------------------------------------------------

function ComprasDelDia({
  dia,
  hoy,
  compras,
  puedeAnular,
  onAnular,
  onAbrir,
}: {
  dia: string
  hoy: string
  compras: CompraDelDia[] | null
  puedeAnular: boolean
  onAnular: (c: CompraDelDia) => Promise<void>
  /** Abre todo lo de la persona de esa compra. */
  onAbrir?: (personaId: number) => void
}) {
  const [confirmando, setConfirmando] = useState<number | null>(null)
  const titulo = mayuscula(nombreDelDia(dia, hoy))

  if (compras === null) return <p className="pt-3 text-lg text-tinta-suave ancha:pt-1">Cargando...</p>

  if (compras.length === 0) {
    return (
      <p className="pt-3 text-lg text-tinta-suave ancha:pt-1">
        {dia === hoy ? 'Hoy todavía no se ha registrado nada.' : `No hay compras del ${fechaLarga(dia)}.`}
      </p>
    )
  }

  const vigentes = compras.filter((c) => !c.anulada)
  const total = vigentes.reduce((suma, c) => suma + c.valor_pesos, 0)

  return (
    <div className="flex flex-col gap-2 pt-3 ancha:pt-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {titulo}{' '}
          <span className="text-base font-normal text-tinta-suave">
            · {vigentes.length} {vigentes.length === 1 ? 'compra' : 'compras'}
          </span>
        </h2>
        <span className="text-lg font-semibold tabular-nums">{formatearPesos(total)}</span>
      </div>
      <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
        {compras.map((c) => (
          <li key={c.id}>
            <div className="flex items-center gap-3 pr-3">
              <Renglon onClick={onAbrir && (() => onAbrir(c.persona_id))}>
                <div className={`min-w-0 flex-1 ${c.anulada ? 'text-tinta-tenue line-through' : ''}`}>
                  <p className="text-lg">
                    <span className="font-semibold">{c.personas?.nombre}</span>{' '}
                    <span className={c.anulada ? '' : 'text-tinta-suave'}>· {c.departamentos?.nombre}</span>
                  </p>
                  <p className={`text-base ${c.anulada ? '' : 'text-tinta-suave'}`}>
                    {c.descripcion && `${c.descripcion} · `}
                    {dia === hoy ? hora(c.creada_en) : `anotada a las ${hora(c.creada_en)}`}
                  </p>
                </div>
                <span
                  className={`text-lg font-semibold tabular-nums ${c.anulada ? 'text-tinta-tenue line-through' : ''}`}
                >
                  {formatearPesos(c.valor_pesos)}
                </span>
              </Renglon>
              {c.anulada ? (
                <span className="w-24 text-center text-base text-tinta-suave">Anulada</span>
              ) : (
                puedeAnular && (
                  <Boton
                    variante="peligro"
                    compacto
                    className="w-24"
                    disabled={confirmando === c.id}
                    onClick={() => setConfirmando(c.id)}
                  >
                    Anular
                  </Boton>
                )
              )}
            </div>
            {confirmando === c.id && (
              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 bg-peligro-suave px-4 py-3">
                <span className="mr-auto text-lg">¿Anular esta compra?</span>
                <Boton variante="secundario" compacto onClick={() => setConfirmando(null)}>
                  No
                </Boton>
                <Boton
                  variante="peligro"
                  compacto
                  onClick={() => {
                    setConfirmando(null)
                    onAnular(c)
                  }}
                >
                  Sí, anular
                </Boton>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** El renglón de una compra: si se puede abrir la persona, todo él es un botón. */
function Renglon({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  const clases = 'flex min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left'
  if (!onClick) return <div className={clases}>{children}</div>
  return (
    <button type="button" onClick={onClick} className={`${clases} active:bg-hundido`}>
      {children}
    </button>
  )
}
