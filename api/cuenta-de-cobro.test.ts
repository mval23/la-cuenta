import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hoyEnBogota, limpiarCuenta, mensaje, POST } from './cuenta-de-cobro.ts'

const llamadas: { url: string; init?: RequestInit }[] = []
let groqResponde: Response

function respuestaDeGroq(contenido: object): Response {
  return Response.json({ choices: [{ message: { content: JSON.stringify(contenido) } }] })
}

beforeEach(() => {
  llamadas.length = 0
  groqResponde = respuestaDeGroq({
    cliente_nombre: 'ORF S.A. BIC',
    cliente_nit: '891.100.445-6',
    concepto: null,
    filas: [{ fecha: '2026-08-25', unidades: 2, descripcion: 'Desayunos personal gerencia', valor_unitario: null, valor_total: 32000 }],
  })
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

function pedido(token: string | null, cuerpo: object | string = { texto: 'El 25 de agosto 2 desayunos gerencia 32 mil' }) {
  return new Request('http://localhost/api/cuenta-de-cobro', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  })
}

describe('POST /api/cuenta-de-cobro', () => {
  it('manda el dictado a Groq y devuelve las filas', async () => {
    const r = await POST(pedido('valido'))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({
      cliente: { nombre: 'ORF S.A. BIC', nit: '891.100.445-6' },
      concepto: null,
      filas: [{ fecha: '2026-08-25', unidades: 2, descripcion: 'Desayunos personal gerencia', valorUnitario: null, valorTotal: 32000 }],
    })
    const groq = llamadas.find((l) => l.url.includes('groq.com'))!
    expect(new Headers(groq.init?.headers).get('authorization')).toBe('Bearer gsk_prueba')
    const enviado = JSON.parse(groq.init?.body as string)
    expect(enviado.messages[1].content).toBe('El 25 de agosto 2 desayunos gerencia 32 mil')
    expect(enviado.response_format.type).toBe('json_schema')
  })

  it('rechaza sin sesión y no llama a Groq', async () => {
    expect((await POST(pedido(null))).status).toBe(401)
    expect((await POST(pedido('vencido'))).status).toBe(401)
    expect(llamadas.some((l) => l.url.includes('groq.com'))).toBe(false)
  })

  it('pide el texto y no acepta textos enormes', async () => {
    expect((await POST(pedido('valido', { texto: '  ' }))).status).toBe(400)
    expect((await POST(pedido('valido', 'no es json'))).status).toBe(400)
    expect((await POST(pedido('valido', { texto: 'a'.repeat(5000) }))).status).toBe(413)
  })

  it('avisa cuando se acabó el cupo de Groq', async () => {
    groqResponde = new Response('rate limit', { status: 429 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await POST(pedido('valido'))).status).toBe(429)
  })

  it('si Groq devuelve algo que no es JSON, responde error', async () => {
    groqResponde = Response.json({ choices: [{ message: { content: 'no sé' } }] })
    expect((await POST(pedido('valido'))).status).toBe(502)
  })

  it('sin clave de Groq responde error de servidor', async () => {
    vi.stubEnv('GROQ_API_KEY', '')
    expect((await POST(pedido('valido'))).status).toBe(500)
  })
})

describe('mensaje', () => {
  it('sin dictado anterior, manda solo lo nuevo', () => {
    expect(mensaje('el 26 nueve desayunos', '')).toBe('el 26 nueve desayunos')
  })

  it('con dictado anterior, lo manda como contexto', () => {
    const texto = mensaje('el 26 nueve desayunos', 'el 25 de agosto dos desayunos')
    expect(texto).toContain('el 25 de agosto dos desayunos')
    expect(texto.indexOf('el 25 de agosto')).toBeLessThan(texto.indexOf('el 26 nueve'))
  })
})

describe('limpiarCuenta', () => {
  const HOY = '2026-09-18'
  const fila = (cambios: object) => ({
    fecha: '2026-09-01',
    unidades: null,
    descripcion: 'Desayunos',
    valor_unitario: null,
    valor_total: 12000,
    ...cambios,
  })

  it('calcula el total con unidades y valor unitario', () => {
    const { filas } = limpiarCuenta({ filas: [fila({ unidades: 9, valor_unitario: 16000, valor_total: 0 })] }, HOY)
    expect(filas[0].valorTotal).toBe(144000)
  })

  it('una fecha que falta, está mal escrita o es del futuro toma la de la fila anterior', () => {
    const { filas } = limpiarCuenta(
      {
        filas: [
          fila({ fecha: '2026-08-26' }),
          fila({ fecha: '' }),
          fila({ fecha: 'ayer' }),
          fila({ fecha: '2026-12-01' }),
        ],
      },
      HOY,
    )
    expect(filas.map((f) => f.fecha)).toEqual(['2026-08-26', '2026-08-26', '2026-08-26', '2026-08-26'])
  })

  it('sin ninguna fecha, usa hoy', () => {
    expect(limpiarCuenta({ filas: [fila({ fecha: null })] }, HOY).filas[0].fecha).toBe(HOY)
  })

  it('quita filas vacías y deja las que no tienen valor para que se lo pongan', () => {
    const { filas } = limpiarCuenta(
      { filas: [fila({ descripcion: '', valor_total: 0 }), fila({ valor_total: 0 }), 'basura', null] },
      HOY,
    )
    expect(filas).toHaveLength(1)
    expect(filas[0].valorTotal).toBe(0)
  })

  it('no se cae con respuestas raras', () => {
    expect(limpiarCuenta(null, HOY)).toEqual({ cliente: { nombre: null, nit: null }, concepto: null, filas: [] })
    expect(limpiarCuenta({ filas: 'x', cliente_nombre: '  ' }, HOY).cliente.nombre).toBeNull()
    expect(limpiarCuenta({ filas: [fila({ valor_total: '32.000', unidades: -2 })] }, HOY).filas[0]).toMatchObject({
      valorTotal: 32000,
      unidades: null,
    })
  })
})

describe('hoyEnBogota', () => {
  it('usa la hora de Colombia', () => {
    expect(hoyEnBogota(new Date('2026-09-19T03:00:00Z'))).toBe('2026-09-18')
  })
})
