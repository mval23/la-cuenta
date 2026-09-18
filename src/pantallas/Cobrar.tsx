import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Boton } from '../componentes/Boton'
import { agruparParaCobro } from '../lib/cobro'
import { formatearPesos } from '../lib/pesos'
import { supabase } from '../lib/supabase'
import type { Perfil, Saldo } from '../lib/tipos'
import { DetallePersona } from './DetallePersona'

const campo = 'min-h-14 rounded-2xl border-2 border-stone-300 bg-white px-4 text-xl'

export function Cobrar({ perfil }: { perfil: Perfil }) {
  const [saldos, setSaldos] = useState<Saldo[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [abierta, setAbierta] = useState<number | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('saldos')
      .select('persona_id, nombre, departamento_id, departamento, activo, comprado, pagado, saldo')
    if (error) setAviso({ tipo: 'error', texto: 'No se pudieron cargar los saldos. Revisa la conexión.' })
    else setSaldos(data)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (perfil.rol === 'cocina') {
    return (
      <section>
        <h1 className="mb-4 text-3xl font-bold">Cobrar</h1>
        <p className="text-lg text-stone-600">Esta parte solo la ven las administradoras.</p>
      </section>
    )
  }

  if (saldos === null) {
    return <p className="text-lg text-stone-500">{aviso?.texto ?? 'Cargando...'}</p>
  }

  const persona = saldos.find((s) => s.persona_id === abierta)
  if (persona) {
    return (
      <DetallePersona
        saldo={persona}
        onVolver={() => setAbierta(null)}
        onCambio={cargar}
      />
    )
  }

  async function registrarPago(s: Saldo, valor: number, tipo: 'total' | 'abono') {
    setAviso(null)
    const { error } = await supabase.from('pagos').insert({ persona_id: s.persona_id, valor_pesos: valor, tipo })
    if (error) {
      setAviso({ tipo: 'error', texto: 'No se pudo guardar el pago. Revisa la conexión.' })
      return false
    }
    setAviso({ tipo: 'ok', texto: `Pago guardado: ${s.nombre}, ${formatearPesos(valor)}` })
    await cargar()
    return true
  }

  const porCobrar = saldos.reduce((suma, s) => suma + Math.max(s.saldo, 0), 0)
  const grupos = agruparParaCobro(saldos, busqueda)

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold">Cobrar</h1>
        <p className="text-xl">
          Por cobrar: <span className="font-bold">{formatearPesos(porCobrar)}</span>
        </p>
      </div>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar persona o departamento (también las que están al día)"
        aria-label="Buscar persona o departamento"
        autoComplete="off"
        className={`${campo} w-full`}
      />

      {aviso && (
        <p
          role="status"
          className={`rounded-2xl p-4 text-lg ${
            aviso.tipo === 'ok' ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-800'
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {grupos.length === 0 && (
        <p className="text-lg text-stone-600">
          {busqueda ? 'No hay nadie con ese nombre.' : 'Nadie debe. Todo está al día.'}
        </p>
      )}

      {grupos.map((g) => (
        <div key={g.departamentoId} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 border-b-2 border-stone-300 pb-1">
            <h2 className="text-2xl font-bold">{g.departamento}</h2>
            <span className="text-xl font-semibold">{formatearPesos(g.total)}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {g.personas.map((s) => (
              <FilaDeCobro
                key={s.persona_id}
                saldo={s}
                onAbrir={() => setAbierta(s.persona_id)}
                onPago={(valor, tipo) => registrarPago(s, valor, tipo)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function FilaDeCobro({
  saldo: s,
  onAbrir,
  onPago,
}: {
  saldo: Saldo
  onAbrir: () => void
  onPago: (valor: number, tipo: 'total' | 'abono') => Promise<boolean>
}) {
  const [modo, setModo] = useState<'nada' | 'total' | 'abono'>('nada')
  const [abono, setAbono] = useState('')
  const [guardando, setGuardando] = useState(false)
  const aFavor = s.saldo < 0

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
    const valor = Number(abono)
    if (valor > 0) pagar(valor, 'abono')
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border-2 border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onAbrir} className="min-h-14 min-w-0 flex-1 text-left text-xl font-semibold underline decoration-stone-300 underline-offset-4">
          {s.nombre}
        </button>
        <span className={`text-2xl font-bold ${aFavor ? 'text-green-800' : ''}`}>
          {aFavor ? `A favor ${formatearPesos(-s.saldo)}` : formatearPesos(s.saldo)}
        </span>
        {modo === 'nada' && s.saldo > 0 && (
          <>
            <Boton onClick={() => setModo('total')}>Pagó todo</Boton>
            <Boton variante="secundario" onClick={() => setModo('abono')}>
              Abono
            </Boton>
          </>
        )}
      </div>

      {modo === 'total' && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-lg">
            ¿{s.nombre} pagó {formatearPesos(s.saldo)}?
          </span>
          <Boton disabled={guardando} onClick={() => pagar(s.saldo, 'total')}>
            {guardando ? 'Guardando...' : 'Sí, pagó'}
          </Boton>
          <Boton variante="secundario" onClick={() => setModo('nada')}>
            No
          </Boton>
        </div>
      )}

      {modo === 'abono' && (
        <form onSubmit={guardarAbono} className="flex flex-wrap items-center gap-3">
          <input
            value={abono}
            onChange={(e) => setAbono(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
            inputMode="numeric"
            placeholder="Cuánto abonó"
            aria-label={`Abono de ${s.nombre}`}
            autoFocus
            className={`${campo} min-w-0 flex-1`}
          />
          {Number(abono) > 0 && <span className="text-xl font-bold">{formatearPesos(Number(abono))}</span>}
          <button
            type="submit"
            disabled={!(Number(abono) > 0) || guardando}
            className="min-h-14 rounded-2xl bg-amber-800 px-6 font-semibold text-white active:bg-amber-900 disabled:bg-stone-400"
          >
            {guardando ? 'Guardando...' : 'Guardar abono'}
          </button>
          <Boton variante="secundario" onClick={() => setModo('nada')}>
            Cancelar
          </Boton>
        </form>
      )}
    </li>
  )
}
