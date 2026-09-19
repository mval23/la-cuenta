import type { Pdf } from './pdf'

/**
 * - compartido: se abrió el menú de compartir del iPad y se eligió algo.
 * - cancelado: se cerró el menú sin compartir.
 * - necesita-toque: Safari no dejó abrir el menú porque pasó mucho tiempo
 *   desde el toque mientras se armaba el PDF; hay que tocar otra vez.
 * - descargado: el navegador no sabe compartir archivos (computador); se bajó.
 */
export type Resultado = 'compartido' | 'cancelado' | 'necesita-toque' | 'descargado'

export async function compartirPdf({ archivo, nombre }: Pdf): Promise<Resultado> {
  const file = new File([archivo], nombre, { type: 'application/pdf' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nombre })
      return 'compartido'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado'
      if (e instanceof DOMException && e.name === 'NotAllowedError') return 'necesita-toque'
      throw e
    }
  }
  const url = URL.createObjectURL(file)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'descargado'
}
