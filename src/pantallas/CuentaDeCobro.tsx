import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Boton } from '../componentes/Boton'
import { BotonPdf } from '../componentes/BotonPdf'
import { ElegirDia } from '../componentes/ElegirDia'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { Microfono } from '../componentes/Microfono'
import { campo } from '../componentes/estilos'
import type { DatosAviso } from '../componentes/useAviso'
import { entenderCuenta } from '../lib/cuentaDictada'
import { hoyBogota } from '../lib/fechas'
import { sumaEnLetras } from '../lib/letras'
import { pdfDeCuentaDeCobro, type DatosDeCobro, type FilaDeCobro } from '../lib/pdf'
import { formatearPesos } from '../lib/pesos'
import { supabase } from '../lib/supabase'
import { ErrorDeVoz, TIEMPOS_LARGOS } from '../lib/voz'

// Las filas pueden ser de meses atrás: una cuenta a veces junta varias quincenas.
const DIAS_ATRAS_EN_CUENTA = 366
// El borrador sobrevive si el iPad cierra la app mientras se arma la cuenta.
const BORRADOR = 'la-cuenta:borrador-cuenta-de-cobro'

interface Fila extends FilaDeCobro {
  clave: number
}

interface Borrador {
  fecha: string
  cliente_nombre: string
  cliente_nit: string
  concepto: string
  filas: Fila[]
  dictados: string[]
}

function leerBorrador(): Borrador | null {
  try {
    const texto = localStorage.getItem(BORRADOR)
    return texto ? (JSON.parse(texto) as Borrador) : null
  } catch {
    return null
  }
}

function guardarBorrador(borrador: Borrador) {
  try {
    localStorage.setItem(BORRADOR, JSON.stringify(borrador))
  } catch {
    // Sin borrador no pasa nada grave: solo no se recupera si se cierra la app.
  }
}

let siguienteClave = Date.now()
const nuevaClave = () => siguienteClave++

/** "32000" -> "32.000" mientras se escribe. */
function conPuntos(valor: number | null): string {
  return valor ? new Intl.NumberFormat('es-CO').format(valor) : ''
}

function soloNumero(texto: string): number | null {
  const n = Number(texto.replace(/\D/g, ''))
  return n > 0 ? n : null
}

/** Cuenta de cobro para una empresa: se explica hablando, se revisa y sale en PDF. */
export function CuentaDeCobro({ onVolver, mostrar }: { onVolver: () => void; mostrar: (aviso: DatosAviso) => void }) {
  const hoy = hoyBogota()
  const [datos, setDatos] = useState<DatosDeCobro | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState(false)
  const [editandoDatos, setEditandoDatos] = useState(false)

  const [inicial] = useState(leerBorrador)
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy)
  const [cliente, setCliente] = useState(inicial?.cliente_nombre ?? '')
  const [nit, setNit] = useState(inicial?.cliente_nit ?? '')
  const [concepto, setConcepto] = useState(inicial?.concepto ?? '')
  const [filas, setFilas] = useState<Fila[]>(inicial?.filas ?? [])
  const [dictados, setDictados] = useState<string[]>(inicial?.dictados ?? [])

  const [entendiendo, setEntendiendo] = useState(false)
  const [escribir, setEscribir] = useState(false)
  const [escrito, setEscrito] = useState('')
  const [borrando, setBorrando] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('datos_de_cobro')
      .select('nombre, documento, ciudad, nota, cliente_nombre, cliente_nit, concepto')
      .maybeSingle()
    setErrorDeCarga(error !== null || data === null)
    if (!data) return
    setDatos(data)
    // Sin borrador, se propone la última empresa a la que se le cobró.
    if (!inicial) {
      setCliente(data.cliente_nombre)
      setNit(data.cliente_nit)
      setConcepto(data.concepto)
    }
    if (!data.nombre || !data.documento) setEditandoDatos(true)
  }, [inicial])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    guardarBorrador({ fecha, cliente_nombre: cliente, cliente_nit: nit, concepto, filas, dictados })
  }, [fecha, cliente, nit, concepto, filas, dictados])

  const avisarError = (texto: string) => mostrar({ tipo: 'error', texto })

  async function entender(texto: string) {
    setEntendiendo(true)
    try {
      const cuenta = await entenderCuenta(texto, dictados.join('\n'))
      setDictados((antes) => [...antes, texto])
      setFilas((antes) => [...antes, ...cuenta.filas.map((f) => ({ ...f, clave: nuevaClave() }))])
      if (cuenta.cliente.nombre) setCliente(cuenta.cliente.nombre)
      if (cuenta.cliente.nit) setNit(cuenta.cliente.nit)
      if (cuenta.concepto) setConcepto(cuenta.concepto.charAt(0).toUpperCase() + cuenta.concepto.slice(1))
      const n = cuenta.filas.length
      if (n === 0) avisarError(`No encontré filas en lo que dijiste: «${texto}». Intenta otra vez con fecha, qué fue y cuánto.`)
      else mostrar({ tipo: 'ok', texto: `Se ${n === 1 ? 'agregó 1 fila' : `agregaron ${n} filas`}. Revísalas abajo.` })
      return true
    } catch (e) {
      avisarError(e instanceof ErrorDeVoz ? e.message : 'No se pudo entender la cuenta. Intenta otra vez.')
      return false
    } finally {
      setEntendiendo(false)
    }
  }

  async function enviarEscrito(e: FormEvent) {
    e.preventDefault()
    const texto = escrito.trim()
    if (!texto || entendiendo) return
    if (await entender(texto)) setEscrito('')
  }

  function cambiarFila(clave: number, cambios: Partial<FilaDeCobro>) {
    setFilas((antes) =>
      antes.map((f) => {
        if (f.clave !== clave) return f
        const nueva = { ...f, ...cambios }
        // Con unidades y precio de cada una, el total se calcula solo.
        if (('unidades' in cambios || 'valorUnitario' in cambios) && nueva.unidades && nueva.valorUnitario) {
          nueva.valorTotal = nueva.unidades * nueva.valorUnitario
        }
        return nueva
      }),
    )
  }

  function agregarFila() {
    const ultima = filas.at(-1)
    setFilas([
      ...filas,
      { clave: nuevaClave(), fecha: ultima?.fecha ?? hoy, unidades: null, descripcion: '', valorUnitario: null, valorTotal: 0 },
    ])
  }

  function empezarOtra() {
    setBorrando(false)
    setFilas([])
    setDictados([])
    setFecha(hoy)
  }

  const total = filas.reduce((suma, f) => suma + f.valorTotal, 0)
  const faltas: string[] = []
  if (!datos?.nombre || !datos?.documento) faltas.push('tu nombre y cédula')
  if (!cliente.trim()) faltas.push('la empresa')
  if (filas.length === 0) faltas.push('las filas de la cuenta')
  if (filas.some((f) => !f.descripcion.trim())) faltas.push('la descripción de alguna fila')
  if (filas.some((f) => !(f.valorTotal > 0))) faltas.push('el valor de alguna fila')

  async function preparar() {
    const completos = { ...datos!, cliente_nombre: cliente.trim(), cliente_nit: nit.trim(), concepto: concepto.trim() }
    // Para proponerla la próxima vez. Si falla no importa: el PDF sale igual.
    // (La consulta solo se envía con then.)
    supabase
      .from('datos_de_cobro')
      .update({ cliente_nombre: completos.cliente_nombre, cliente_nit: completos.cliente_nit, concepto: completos.concepto })
      .eq('id', true)
      .then(() => undefined)
    return pdfDeCuentaDeCobro(
      completos,
      fecha,
      filas.map((f) => ({ ...f, descripcion: f.descripcion.trim() })),
    )
  }

  const etiqueta = 'text-base font-semibold text-tinta-suave'

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Boton variante="texto" className="-mb-4 -ml-3 self-start" onClick={onVolver}>
        <span aria-hidden="true">‹ </span>Volver a Cobrar
      </Boton>
      <h1 className="text-titulo font-bold">Cuenta de cobro</h1>

      {errorDeCarga && <ErrorDeCarga texto="No se pudieron cargar tus datos." onReintentar={cargar} />}

      {datos && editandoDatos && (
        <DatosPropios
          datos={datos}
          onGuardado={(nuevos) => {
            setDatos(nuevos)
            setEditandoDatos(false)
            mostrar({ tipo: 'ok', texto: 'Tus datos quedaron guardados.' })
          }}
          onCancelar={datos.nombre && datos.documento ? () => setEditandoDatos(false) : undefined}
          onError={avisarError}
        />
      )}

      {datos && !editandoDatos && (
        <div className="flex items-center gap-3 rounded-xl bg-hundido px-4 py-3">
          <p className="min-w-0 flex-1 text-lg">
            <span className="text-tinta-suave">Cobra: </span>
            <strong className="font-semibold">{datos.nombre}</strong>
            <span className="text-tinta-suave"> · CC. {datos.documento}</span>
          </p>
          <Boton variante="texto" compacto onClick={() => setEditandoDatos(true)}>
            Cambiar
          </Boton>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">A quién se le cobra</h2>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Empresa</span>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="ORF S.A. BIC" autoComplete="off" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>NIT</span>
            <input value={nit} onChange={(e) => setNit(e.target.value)} placeholder="891.100.445-6" autoComplete="off" className={campo} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className={etiqueta}>Fecha de la cuenta</span>
            <ElegirDia dia={fecha} hoy={hoy} onCambiar={setFecha} etiqueta="Fecha de la cuenta" diasAtras={DIAS_ATRAS_EN_CUENTA} />
          </div>
          <label className="flex flex-col gap-1">
            <span className={etiqueta}>Por concepto de</span>
            <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Servicio de comedor y otros" autoComplete="off" className={campo} />
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Qué se cobra</h2>
        <p className="text-lg text-tinta-suave">
          Explica la cuenta como se la dirías a alguien: la fecha, qué fue, para quién y cuánto. Por ejemplo: «El 25 de
          agosto, 2 desayunos del personal de gerencia, 32 mil. El 26, 9 desayunos para los gerentes regionales a 16 mil
          cada uno». Puedes hablar varias veces: cada vez se agregan filas.
        </p>
        {entendiendo ? (
          <div className="flex min-h-24 items-center justify-center rounded-2xl bg-hundido text-xl font-semibold text-tinta-suave">
            Armando la cuenta...
          </div>
        ) : (
          <Microfono
            texto={filas.length ? 'Tocar para seguir explicando' : 'Tocar para explicar la cuenta'}
            tiempos={TIEMPOS_LARGOS}
            vocabulario={() =>
              `Cuenta de cobro para ${cliente || 'ORF S.A. BIC'}. Desayunos personal gerencia, almuerzos especiales, gerentes regionales.`
            }
            onEmpezar={() => undefined}
            onTexto={(texto) => void entender(texto)}
            onError={avisarError}
          />
        )}
        {escribir ? (
          <form onSubmit={enviarEscrito} className="flex flex-col gap-2">
            <textarea
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
              rows={3}
              placeholder="El 25 de agosto 2 desayunos personal gerencia 32 mil"
              aria-label="Explicación de la cuenta"
              className={`${campo} py-3`}
            />
            <Boton type="submit" variante="tintado" className="self-end" disabled={!escrito.trim() || entendiendo}>
              Agregar a la cuenta
            </Boton>
          </form>
        ) : (
          <Boton variante="texto" className="-ml-3 self-start" onClick={() => setEscribir(true)}>
            Prefiero escribirlo
          </Boton>
        )}
      </div>

      {filas.length > 0 && (
        <ol className="flex flex-col gap-3">
          {filas.map((f, i) => (
            <FilaEditable
              key={f.clave}
              numero={i + 1}
              fila={f}
              hoy={hoy}
              onCambiar={(cambios) => cambiarFila(f.clave, cambios)}
              onQuitar={() => setFilas(filas.filter((x) => x.clave !== f.clave))}
            />
          ))}
        </ol>
      )}

      <Boton variante="secundario" className="self-start" onClick={agregarFila}>
        + Agregar fila a mano
      </Boton>

      {filas.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl bg-marca-suave px-4 py-3">
          <p className="flex items-baseline justify-between gap-4 text-xl">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-bold tabular-nums">{formatearPesos(total)}</span>
          </p>
          {total > 0 && <p className="text-lg text-tinta-suave">{sumaEnLetras(total)}</p>}
        </div>
      )}

      {faltas.length > 0 && filas.length > 0 && (
        <p className="rounded-xl bg-aviso-suave px-4 py-3 text-lg text-aviso">Falta {faltas.join(', ')}.</p>
      )}

      <BotonPdf
        key={JSON.stringify([datos, cliente, nit, concepto, fecha, filas])}
        texto="Hacer el PDF y compartir"
        disabled={faltas.length > 0}
        preparar={preparar}
        onError={avisarError}
      />

      {(filas.length > 0 || dictados.length > 0) &&
        (borrando ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-aviso-suave p-4">
            <span className="mr-auto text-lg">¿Borrar las filas para empezar otra cuenta?</span>
            <Boton variante="secundario" compacto onClick={() => setBorrando(false)}>
              No
            </Boton>
            <Boton compacto onClick={empezarOtra}>
              Sí, empezar otra
            </Boton>
          </div>
        ) : (
          <Boton variante="texto" className="-ml-3 self-start" onClick={() => setBorrando(true)}>
            Empezar otra cuenta
          </Boton>
        ))}
    </section>
  )
}

function FilaEditable({
  numero,
  fila: f,
  hoy,
  onCambiar,
  onQuitar,
}: {
  numero: number
  fila: Fila
  hoy: string
  onCambiar: (cambios: Partial<FilaDeCobro>) => void
  onQuitar: () => void
}) {
  const etiqueta = 'text-base text-tinta-suave'
  const numeroCampo = `${campo} tabular-nums`
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-linea bg-superficie p-4" aria-label={`Fila ${numero}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3 sm:grid-cols-[minmax(0,1fr)_5rem_8.5rem_9rem]">
        <div className="col-span-1 flex flex-col gap-1">
          <span className={etiqueta}>Fecha</span>
          <ElegirDia dia={f.fecha} hoy={hoy} onCambiar={(fecha) => onCambiar({ fecha })} etiqueta={`Fecha de la fila ${numero}`} diasAtras={DIAS_ATRAS_EN_CUENTA} />
        </div>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Unid.</span>
          <input
            value={f.unidades ?? ''}
            onChange={(e) => onCambiar({ unidades: soloNumero(e.target.value) })}
            inputMode="numeric"
            className={`${numeroCampo} min-h-14 text-center`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Vr. unitario</span>
          <input
            value={conPuntos(f.valorUnitario)}
            onChange={(e) => onCambiar({ valorUnitario: soloNumero(e.target.value) })}
            inputMode="numeric"
            className={`${numeroCampo} min-h-14 text-right`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Vr. total</span>
          <input
            value={conPuntos(f.valorTotal)}
            onChange={(e) => onCambiar({ valorTotal: soloNumero(e.target.value) ?? 0 })}
            inputMode="numeric"
            aria-invalid={!(f.valorTotal > 0)}
            className={`${numeroCampo} min-h-14 text-right font-semibold ${f.valorTotal > 0 ? '' : 'border-2 border-aviso bg-aviso-suave'}`}
          />
        </label>
      </div>
      <div className="flex items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={etiqueta}>Descripción</span>
          <input
            value={f.descripcion}
            onChange={(e) => onCambiar({ descripcion: e.target.value })}
            placeholder="Desayunos personal gerencia"
            aria-invalid={!f.descripcion.trim()}
            className={`${campo} ${f.descripcion.trim() ? '' : 'border-2 border-aviso bg-aviso-suave'}`}
          />
        </label>
        <Boton variante="peligro" onClick={onQuitar} aria-label={`Quitar la fila ${numero}`}>
          Quitar
        </Boton>
      </div>
    </li>
  )
}

function DatosPropios({
  datos,
  onGuardado,
  onCancelar,
  onError,
}: {
  datos: DatosDeCobro
  onGuardado: (datos: DatosDeCobro) => void
  onCancelar?: () => void
  onError: (mensaje: string) => void
}) {
  const [nombre, setNombre] = useState(datos.nombre)
  const [documento, setDocumento] = useState(datos.documento)
  const [ciudad, setCiudad] = useState(datos.ciudad)
  const [nota, setNota] = useState(datos.nota)
  const [guardando, setGuardando] = useState(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const cambios = { nombre: nombre.trim(), documento: documento.trim(), ciudad: ciudad.trim(), nota: nota.trim() }
    setGuardando(true)
    const { error } = await supabase.from('datos_de_cobro').update(cambios).eq('id', true)
    setGuardando(false)
    if (error) onError('No se pudieron guardar tus datos. Revisa el internet.')
    else onGuardado({ ...datos, ...cambios })
  }

  const etiqueta = 'text-base font-semibold text-tinta-suave'
  return (
    <form onSubmit={guardar} className="flex flex-col gap-4 rounded-2xl border border-linea bg-superficie p-5">
      <div>
        <h2 className="text-xl font-semibold">Tus datos</h2>
        <p className="text-lg text-tinta-suave">Van en todas las cuentas de cobro. Se llenan una sola vez.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Nombre completo</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Cédula</span>
          <input value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode="numeric" autoComplete="off" className={campo} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Ciudad</span>
        <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} autoComplete="off" className={`${campo} sm:max-w-xs`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiqueta}>Nota al final (dónde consignar)</span>
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Consignar en la cuenta de ahorros Bancolombia No. ..."
          autoComplete="off"
          className={campo}
        />
      </label>
      <div className="flex flex-wrap justify-end gap-3">
        {onCancelar && (
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
        )}
        <Boton type="submit" disabled={!nombre.trim() || !documento.trim() || guardando}>
          {guardando ? 'Guardando...' : 'Guardar mis datos'}
        </Boton>
      </div>
    </form>
  )
}
