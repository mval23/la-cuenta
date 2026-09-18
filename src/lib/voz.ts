// Graba el dictado con el micrófono y lo pasa a texto en el servidor
// (api/transcribir.ts). El motor de voz vive en el servidor, así que se puede
// cambiar sin tocar la app.

import { crearDetector, volumen } from './silencio'
import { supabase } from './supabase'

// Tope por si el detector de silencio nunca decide (ruido constante).
export const DURACION_MAXIMA_MS = 30_000
const CADA_MS = 50

// Safari en iPad graba en mp4; Chrome en webm. Groq acepta los dos.
const FORMATOS = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']

export interface Grabacion {
  /** Termina la grabación y entrega el audio. */
  terminar: () => Promise<Blob>
  /** Descarta la grabación. */
  cancelar: () => void
}

/** Por qué la grabación se detuvo sola. */
export type Corte = 'silencio' | 'sin-voz' | 'tiempo'

export function hayMicrofono(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

export async function empezarGrabacion(alCortarse: (motivo: Corte) => void): Promise<Grabacion> {
  // Se crea antes del primer await: Safari solo deja activar el audio si nace
  // del toque de la usuaria.
  const contexto = new AudioContext()
  let flujo: MediaStream
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (e) {
    void contexto.close()
    throw e
  }
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
      void contexto.close()
      resolver(new Blob(partes, { type: grabadora.mimeType || mimeType || 'audio/mp4' }))
    }
  })

  // Escucha el volumen para saber cuándo terminó de hablar.
  const analizador = contexto.createAnalyser()
  analizador.fftSize = 2048
  contexto.createMediaStreamSource(flujo).connect(analizador)
  void contexto.resume()
  const muestras = new Float32Array(analizador.fftSize)
  const detector = crearDetector()
  let cortada = false
  function cortar(motivo: Corte) {
    if (cortada) return
    cortada = true
    detener()
    alCortarse(motivo)
  }
  const escucha = setInterval(() => {
    analizador.getFloatTimeDomainData(muestras)
    const decision = detector.paso(volumen(muestras), CADA_MS)
    if (decision === 'termino') cortar('silencio')
    else if (decision === 'sin-voz') cortar('sin-voz')
  }, CADA_MS)

  const corte = setTimeout(() => cortar('tiempo'), DURACION_MAXIMA_MS)
  grabadora.start()

  function detener() {
    cortada = true
    clearTimeout(corte)
    clearInterval(escucha)
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
