// Registrar un pago total o un abono: desde la lista de Cobrar y desde el
// detalle de la persona, con las mismas preguntas.

import { useState, type FormEvent } from 'react'
import { Boton } from './Boton'
import { campo } from './estilos'
import { formatearPesos } from '../lib/pesos'
import type { TipoDePago } from '../lib/pagos'
import type { Saldo } from '../lib/tipos'

/** La pregunta de "Pagó todo" o el campo del abono. Se cierra sola al guardar. */
export function PanelDePago({
  saldo: s,
  tipo,
  onPago,
  onCerrar,
  className = '',
}: {
  saldo: Saldo
  tipo: TipoDePago
  onPago: (valor: number, tipo: TipoDePago) => Promise<boolean>
  onCerrar: () => void
  className?: string
}) {
  const [abono, setAbono] = useState('')
  const [guardando, setGuardando] = useState(false)
  const valorAbono = Number(abono)

  async function pagar(valor: number) {
    setGuardando(true)
    const ok = await onPago(valor, tipo)
    setGuardando(false)
    if (ok) onCerrar()
  }

  function guardarAbono(e: FormEvent) {
    e.preventDefault()
    if (valorAbono > 0 && !guardando) pagar(valorAbono)
  }

  if (tipo === 'total') {
    return (
      <div className={`flex flex-wrap items-center justify-end gap-x-4 gap-y-2 bg-marca-suave px-4 py-3 ${className}`}>
        <span className="mr-auto text-lg">
          ¿{s.nombre} pagó <span className="font-semibold tabular-nums">{formatearPesos(s.saldo)}</span>?
        </span>
        <Boton variante="secundario" compacto disabled={guardando} onClick={onCerrar}>
          No
        </Boton>
        <Boton compacto disabled={guardando} onClick={() => pagar(s.saldo)}>
          {guardando ? 'Guardando...' : 'Sí, pagó'}
        </Boton>
      </div>
    )
  }

  return (
    <form onSubmit={guardarAbono} className={`flex flex-col gap-2 bg-marca-suave px-4 py-3 ${className}`}>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold text-tinta-suave">Cuánto abonó</span>
          <input
            value={abono}
            onChange={(e) => setAbono(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
            inputMode="numeric"
            enterKeyHint="done"
            autoFocus
            className={`${campo} w-48`}
          />
        </label>
        <span className="mr-auto flex min-h-12 items-center text-xl font-semibold tabular-nums">
          {valorAbono > 0 ? formatearPesos(valorAbono) : ''}
        </span>
        <Boton variante="secundario" compacto disabled={guardando} onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton type="submit" compacto disabled={!(valorAbono > 0) || guardando}>
          {guardando ? 'Guardando...' : 'Guardar abono'}
        </Boton>
      </div>
      {valorAbono > s.saldo && (
        <p className="text-lg text-info">
          Es más de lo que debe: quedará {formatearPesos(valorAbono - s.saldo)} a favor.
        </p>
      )}
    </form>
  )
}
