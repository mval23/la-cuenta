// Función de servidor (Vercel): recibe el audio grabado en el iPad y lo pasa a
// texto con Groq Whisper. Corre en el servidor porque la clave de Groq no puede
// ir dentro de la app. Solo atiende a usuarias con sesión de Supabase.

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const MODELO = 'whisper-large-v3'
// Whisper solo mira los últimos ~224 tokens del prompt; esto alcanza de sobra.
const LARGO_MAXIMO_VOCABULARIO = 600
// Un dictado dura unos segundos; esto evita que alguien suba archivos enormes.
const TAMANO_MAXIMO_AUDIO = 4 * 1024 * 1024

function respuesta(estado: number, cuerpo: object): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  })
}

async function sesionValida(autorizacion: string | null): Promise<boolean> {
  const url = process.env.VITE_SUPABASE_URL
  const clave = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!autorizacion?.startsWith('Bearer ') || !url || !clave) return false
  const r = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: clave, authorization: autorizacion },
  })
  return r.ok
}

export async function POST(request: Request): Promise<Response> {
  const claveGroq = process.env.GROQ_API_KEY
  if (!claveGroq) return respuesta(500, { error: 'Falta GROQ_API_KEY en el servidor.' })

  if (!(await sesionValida(request.headers.get('authorization')))) {
    return respuesta(401, { error: 'Sin sesión.' })
  }

  let formulario: FormData
  try {
    formulario = await request.formData()
  } catch {
    return respuesta(400, { error: 'Se esperaba el audio como formulario.' })
  }
  const audio = formulario.get('audio')
  if (!(audio instanceof File) || audio.size === 0) return respuesta(400, { error: 'Falta el audio.' })
  if (audio.size > TAMANO_MAXIMO_AUDIO) return respuesta(413, { error: 'El audio es muy largo.' })

  const vocabulario = String(formulario.get('vocabulario') ?? '').slice(0, LARGO_MAXIMO_VOCABULARIO)

  const envio = new FormData()
  envio.append('file', audio, audio.name || 'dictado.m4a')
  envio.append('model', MODELO)
  envio.append('language', 'es')
  envio.append('temperature', '0')
  envio.append('response_format', 'json')
  // Ejemplo de cómo suena un dictado más los nombres que puede oír, para que
  // escriba "TDH" y no "te de hache", y los nombres con su ortografía.
  envio.append('prompt', `Juan TDH almuerzo a 10 mil. Carlos 12. Ayer, Pedro 15. ${vocabulario}`)

  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${claveGroq}` },
    body: envio,
  })
  if (!r.ok) {
    console.error('Groq respondió', r.status, await r.text())
    const estado = r.status === 429 ? 429 : 502
    return respuesta(estado, { error: 'No se pudo pasar el audio a texto.' })
  }
  const { text } = (await r.json()) as { text?: string }
  return respuesta(200, { texto: (text ?? '').trim() })
}
