// Función de servidor (Vercel): Amparo explica de palabra una cuenta de cobro
// ("el 2 de agosto dos almuerzos especiales para la doctora Lucy, 62 mil...") y
// esto la convierte en filas con un modelo de lenguaje de Groq. Las filas
// vuelven a la app para revisarlas antes de sacar el PDF: el modelo puede
// equivocarse, pero nunca se guarda nada sin que ella lo vea.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODELO = 'openai/gpt-oss-120b'
// Unos dos minutos de dictado. Más que eso no es una cuenta de cobro.
const LARGO_MAXIMO_TEXTO = 4000
const FILAS_MAXIMAS = 60

export interface FilaDictada {
  /** "2026-08-02" */
  fecha: string
  unidades: number | null
  descripcion: string
  valorUnitario: number | null
  /** 0 si no se entendió el valor: la app lo pide antes de sacar el PDF. */
  valorTotal: number
}

export interface CuentaDictada {
  cliente: { nombre: string | null; nit: string | null }
  concepto: string | null
  filas: FilaDictada[]
}

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

export function hoyEnBogota(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(ahora)
}

function instrucciones(hoy: string): string {
  return `Eres el asistente de Amparo, que maneja la cocina de una empresa en Neiva, Colombia. Ella te explica de palabra una cuenta de cobro para una empresa: qué se sirvió, cuándo, cuántas unidades y cuánto vale. El texto viene de un dictado por voz y puede tener errores de reconocimiento.

Convierte lo que dice en filas de la cuenta de cobro. Reglas:
- Hoy es ${hoy}. Las fechas van como AAAA-MM-DD. Si no dice el año, usa la fecha más reciente que no sea posterior a hoy. Si una fila no dice fecha, usa la de la fila anterior; si ninguna la dice, usa hoy.
- Los valores son pesos colombianos enteros. Los precios de la cocina casi siempre son miles: "62" o "62 mil" es 62000; "1 millón 200" es 1200000.
- valor_total es lo que suma la fila. Si dice cantidad y precio de cada uno ("9 desayunos a 16 mil"), unidades = 9, valor_unitario = 16000 y valor_total = 144000. Si solo dice el total, valor_unitario es null. Si no dice cantidad, unidades es null.
- Si una fila no tiene valor, pon valor_total = 0. No inventes valores ni filas.
- descripcion: corta, con mayúscula inicial, con las palabras de ella y los nombres propios bien escritos. Por ejemplo "Desayunos personal gerencia", "Almuerzos especiales más Coca-Cola - Doctora Lucy y doctor Hernando", "Otros - personal gerentes regionales".
- cliente: la empresa a la que se le cobra y su NIT, solo si los dice; si no, null.
- concepto: solo si dice el concepto general de la cuenta (por ejemplo "servicio de comedor y otros"); si no, null.
- Si corrige algo ("no, eran 3"), usa la corrección.`
}

/**
 * Amparo puede dictar la cuenta en partes. Lo dicho antes ya está en filas;
 * se manda solo para entender lo nuevo ("el 26" es del mes que venía diciendo).
 */
export function mensaje(dictado: string, contexto: string): string {
  if (!contexto) return dictado
  return `Lo que ya dijo antes, que ya está en la cuenta. No repitas esas filas; úsalo solo para entender fechas y referencias:
${contexto}

Lo nuevo que dice ahora, de donde salen las filas:
${dictado}`
}

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cliente_nombre', 'cliente_nit', 'concepto', 'filas'],
  properties: {
    cliente_nombre: { type: ['string', 'null'] },
    cliente_nit: { type: ['string', 'null'] },
    concepto: { type: ['string', 'null'] },
    filas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fecha', 'unidades', 'descripcion', 'valor_unitario', 'valor_total'],
        properties: {
          fecha: { type: 'string' },
          unidades: { type: ['integer', 'null'] },
          descripcion: { type: 'string' },
          valor_unitario: { type: ['integer', 'null'] },
          valor_total: { type: 'integer' },
        },
      },
    },
  },
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

function entero(valor: unknown): number | null {
  const n = typeof valor === 'string' ? Number(valor.replace(/\D/g, '')) : valor
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function esFecha(valor: string | null): valor is string {
  return !!valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor))
}

/** Revisa lo que devolvió el modelo: no se confía en que cumpla el esquema. */
export function limpiarCuenta(crudo: unknown, hoy: string): CuentaDictada {
  const o = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>
  const filas: FilaDictada[] = []
  let fechaAnterior = hoy
  for (const f of Array.isArray(o.filas) ? o.filas.slice(0, FILAS_MAXIMAS) : []) {
    if (!f || typeof f !== 'object') continue
    const fila = f as Record<string, unknown>
    const descripcion = texto(fila.descripcion)
    const unidades = entero(fila.unidades)
    const valorUnitario = entero(fila.valor_unitario)
    let valorTotal = entero(fila.valor_total) ?? 0
    if (!valorTotal && unidades && valorUnitario) valorTotal = unidades * valorUnitario
    if (!descripcion && !valorTotal) continue
    const fecha = texto(fila.fecha)
    if (esFecha(fecha) && fecha <= hoy) fechaAnterior = fecha
    filas.push({
      fecha: fechaAnterior,
      unidades,
      descripcion: descripcion ?? '',
      valorUnitario,
      valorTotal,
    })
  }
  return {
    cliente: { nombre: texto(o.cliente_nombre), nit: texto(o.cliente_nit) },
    concepto: texto(o.concepto),
    filas,
  }
}

export async function POST(request: Request): Promise<Response> {
  const claveGroq = process.env.GROQ_API_KEY
  if (!claveGroq) return respuesta(500, { error: 'Falta GROQ_API_KEY en el servidor.' })

  if (!(await sesionValida(request.headers.get('authorization')))) {
    return respuesta(401, { error: 'Sin sesión.' })
  }

  let dictado: string
  let contexto: string
  try {
    const cuerpo = (await request.json()) as { texto?: unknown; contexto?: unknown }
    dictado = typeof cuerpo.texto === 'string' ? cuerpo.texto.trim() : ''
    contexto = typeof cuerpo.contexto === 'string' ? cuerpo.contexto.trim() : ''
  } catch {
    return respuesta(400, { error: 'Se esperaba JSON.' })
  }
  if (!dictado) return respuesta(400, { error: 'Falta el texto.' })
  if (dictado.length + contexto.length > LARGO_MAXIMO_TEXTO) {
    return respuesta(413, { error: 'El texto es muy largo.' })
  }

  const hoy = hoyEnBogota()
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${claveGroq}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0,
      reasoning_effort: 'low',
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'cuenta_de_cobro', strict: true, schema: ESQUEMA },
      },
      messages: [
        { role: 'system', content: instrucciones(hoy) },
        { role: 'user', content: mensaje(dictado, contexto) },
      ],
    }),
  })
  if (!r.ok) {
    console.error('Groq respondió', r.status, await r.text())
    const estado = r.status === 429 ? 429 : 502
    return respuesta(estado, { error: 'No se pudo entender la cuenta.' })
  }

  const datos = (await r.json()) as { choices?: { message?: { content?: string } }[] }
  let crudo: unknown
  try {
    crudo = JSON.parse(datos.choices?.[0]?.message?.content ?? '')
  } catch {
    return respuesta(502, { error: 'No se pudo entender la cuenta.' })
  }
  return respuesta(200, limpiarCuenta(crudo, hoy))
}
