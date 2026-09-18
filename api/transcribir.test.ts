import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './transcribir.ts'

const llamadas: { url: string; init?: RequestInit }[] = []
let groqResponde: Response

beforeEach(() => {
  llamadas.length = 0
  groqResponde = Response.json({ text: ' Juan TDH almuerzo a 10 mil. ' })
  vi.stubEnv('GROQ_API_KEY', 'gsk_prueba')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proyecto.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_prueba')
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init })
    if (url.endsWith('/auth/v1/user')) {
      const autorizacion = new Headers(init?.headers).get('authorization')
      return new Response(null, { status: autorizacion === 'Bearer valido' ? 200 : 401 })
    }
    return groqResponde
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function pedido(token: string | null, audio: Blob | null = new Blob(['audio'], { type: 'audio/mp4' })) {
  const formulario = new FormData()
  if (audio) formulario.append('audio', audio, 'dictado.m4a')
  formulario.append('vocabulario', 'TDH, Juan, María José')
  return new Request('http://localhost/api/transcribir', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: formulario,
  })
}

describe('POST /api/transcribir', () => {
  it('pasa el audio a Groq con el vocabulario y devuelve el texto limpio', async () => {
    const r = await POST(pedido('valido'))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ texto: 'Juan TDH almuerzo a 10 mil.' })

    const groq = llamadas.find((l) => l.url.includes('groq.com'))!
    expect(new Headers(groq.init?.headers).get('authorization')).toBe('Bearer gsk_prueba')
    const enviado = groq.init?.body as FormData
    expect(enviado.get('model')).toBe('whisper-large-v3')
    expect(enviado.get('language')).toBe('es')
    expect(enviado.get('prompt')).toContain('TDH, Juan, María José')
    expect(enviado.get('file')).toBeInstanceOf(File)
  })

  it('rechaza sin sesión y no llama a Groq', async () => {
    expect((await POST(pedido(null))).status).toBe(401)
    expect((await POST(pedido('vencido'))).status).toBe(401)
    expect(llamadas.some((l) => l.url.includes('groq.com'))).toBe(false)
  })

  it('pide el audio', async () => {
    expect((await POST(pedido('valido', null))).status).toBe(400)
  })

  it('avisa cuando se acabó el cupo de Groq', async () => {
    groqResponde = new Response('rate limit', { status: 429 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await POST(pedido('valido'))).status).toBe(429)
  })

  it('sin clave de Groq responde error de servidor', async () => {
    vi.stubEnv('GROQ_API_KEY', '')
    expect((await POST(pedido('valido'))).status).toBe(500)
  })
})
