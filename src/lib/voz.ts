// Graba el dictado con el micrófono y lo pasa a texto en el servidor
// (api/transcribir.ts). El motor de voz vive en el servidor, así que se puede
// cambiar sin tocar la app.

import { supabase } from './supabase'

// Si la usuaria olvida tocar para terminar, la grabación se corta sola.
const DURACION_MAXIMA_MS = 30_000

// Safari en iPad graba en mp4; Chrome en webm. Groq acepta los dos.
const FORMATOS = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']

export interface Grabacion {
  /** Termina la grabación y entrega el audio. */
  terminar: () => Promise<Blob>
  /** Descarta la grabación. */
  cancelar: () => void
}

export function hayMicrofono(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

export async function empezarGrabacion(alCortarse: () => void): Promise<Grabacion> {
  const flujo = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = FORMATOS.find((f) => MediaRecorder.isTypeSupported(f))
  const grabadora = new MediaRecorder(flujo, mimeType ? { mimeType } : undefined)
  const partes: Blob[] = []
  grabadora.ondataavailable = (e) => {
    if (e.data.size > 0) partes.push(e.data)
  }

  const listo = new Promise<Blob>((resolver) => {
    grabadora.onstop = () => {
      // Apaga el micrófono (y el indicador naranja del iPad).
      flujo.getTracks().forEach((t) => t.stop())
      resolver(new Blob(partes, { type: grabadora.mimeType || mimeType || 'audio/mp4' }))
    }
  })

  const corte = setTimeout(alCortarse, DURACION_MAXIMA_MS)
  grabadora.start()

  function detener() {
    clearTimeout(corte)
    if (grabadora.state !== 'inactive') grabadora.stop()
  }

  return {
    terminar: () => {
      detener()
      return listo
    },
    cancelar: detener,
  }
}

function extension(tipo: string): string {
  if (tipo.includes('webm')) return 'webm'
  if (tipo.includes('ogg')) return 'ogg'
  return 'm4a'
}

export class ErrorDeVoz extends Error {}

/** Envía el audio al servidor y devuelve el texto. */
export async function transcribir(audio: Blob, vocabulario: string): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const formulario = new FormData()
  formulario.append('audio', audio, `dictado.${extension(audio.type)}`)
  formulario.append('vocabulario', vocabulario)

  const r = await fetch('/api/transcribir', {
    method: 'POST',
    headers: { authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: formulario,
  }).catch(() => null)

  if (!r) throw new ErrorDeVoz('Sin conexión. Revisa el internet o escribe la frase.')
  if (r.status === 429) throw new ErrorDeVoz('Se usó mucho la voz por hoy. Escribe la frase.')
  if (!r.ok) throw new ErrorDeVoz('No se pudo entender el audio. Intenta de nuevo o escribe la frase.')
  const { texto } = (await r.json()) as { texto: string }
  return texto
}
