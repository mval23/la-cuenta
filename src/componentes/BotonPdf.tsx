import { useState } from 'react'
import { compartirPdf } from '../lib/compartir'
import type { Pdf } from '../lib/pdf'
import { Boton } from './Boton'

/**
 * Arma el PDF y abre de una vez el menú de compartir del iPad (WhatsApp,
 * correo, imprimir, guardar en Archivos). Si Safari no deja abrirlo porque el
 * PDF tardó, el botón queda listo para compartirlo con otro toque.
 *
 * Quien lo usa le pone un `key` con los datos: si cambian, el PDF ya armado se descarta.
 */
export function BotonPdf({
  texto,
  preparar,
  disabled = false,
  onError,
}: {
  texto: string
  preparar: () => Promise<Pdf>
  disabled?: boolean
  onError: (mensaje: string) => void
}) {
  const [estado, setEstado] = useState<'nada' | 'preparando' | 'compartiendo'>('nada')
  const [listo, setListo] = useState<Pdf | null>(null)

  async function compartir(pdf: Pdf) {
    setEstado('compartiendo')
    try {
      const resultado = await compartirPdf(pdf)
      setListo(resultado === 'necesita-toque' ? pdf : null)
    } catch {
      setListo(pdf)
      onError('No se pudo abrir el menú para compartir. Intenta otra vez.')
    }
    setEstado('nada')
  }

  async function tocar() {
    if (listo) return compartir(listo)
    setEstado('preparando')
    let pdf: Pdf
    try {
      pdf = await preparar()
    } catch {
      setEstado('nada')
      onError('No se pudo hacer el PDF. Revisa el internet e intenta otra vez.')
      return
    }
    await compartir(pdf)
  }

  return (
    <div className="flex flex-col gap-2">
      {listo && <p className="text-lg text-tinta-suave">El PDF está listo. Toca el botón para compartirlo.</p>}
      <Boton className="flex min-h-16 items-center justify-center gap-3 text-xl" disabled={disabled || estado !== 'nada'} onClick={tocar}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7 shrink-0 fill-none stroke-current stroke-2">
          <path d="M12 3v12M7 8l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {estado === 'preparando' ? 'Haciendo el PDF...' : listo ? 'Compartir el PDF' : texto}
      </Boton>
    </div>
  )
}
