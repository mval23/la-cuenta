import { useCallback, useEffect, useState } from 'react'
import { Boton } from '../componentes/Boton'
import { BotonPdf } from '../componentes/BotonPdf'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { agruparParaCobro } from '../lib/cobro'
import { hoyBogota, nombreDeQuincena, quincenaDe, quincenaVecina, type Quincena } from '../lib/fechas'
import { pdfDeQuincena, type FilaDeQuincena } from '../lib/pdf'
import { formatearPesos } from '../lib/pesos'
import { supabase } from '../lib/supabase'

/** Quién debe cuánto en una quincena, para imprimir o mandar en PDF. */
export function PdfQuincena({ onVolver, onError }: { onVolver: () => void; onError: (mensaje: string) => void }) {
  const hoy = hoyBogota()
  const [quincena, setQuincena] = useState<Quincena>(() => quincenaDe(hoy))
  const [filas, setFilas] = useState<FilaDeQuincena[] | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState(false)

  const cargar = useCallback(async () => {
    setFilas(null)
    const { data, error } = await supabase.rpc('cuenta_de_quincena', { desde: quincena.desde, hasta: quincena.hasta })
    setErrorDeCarga(error !== null)
    if (data) setFilas(data as FilaDeQuincena[])
  }, [quincena])

  useEffect(() => {
    cargar()
  }, [cargar])

  const siguiente = quincenaVecina(quincena, 1)
  const enCurso = quincena.hasta > hoy
  const grupos = filas ? agruparParaCobro(filas.map((f) => ({ ...f, activo: true }))) : []
  const porCobrar = filas?.reduce((suma, f) => suma + Math.max(f.saldo, 0), 0) ?? 0
  const personas = grupos.reduce((suma, g) => suma + g.personas.length, 0)
  // Quien tiene saldo a favor sale en el PDF, pero no "debe".
  const deben = filas?.filter((f) => f.saldo > 0).length ?? 0

  const flecha =
    'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-marca active:bg-marca-suave disabled:text-linea'

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <Boton variante="texto" className="-mb-2 -ml-3 self-start" onClick={onVolver}>
        <span aria-hidden="true">‹ </span>Volver a Cobrar
      </Boton>
      <h1 className="text-titulo font-bold">Cuenta de la quincena</h1>

      <div className="flex items-center gap-2 rounded-2xl border border-linea bg-superficie p-2">
        <button
          type="button"
          onClick={() => setQuincena(quincenaVecina(quincena, -1))}
          aria-label="Quincena anterior"
          className={flecha}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7 fill-none stroke-current stroke-[2.5]">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p className="flex-1 text-center text-xl font-semibold" aria-live="polite">
          Del {nombreDeQuincena(quincena)}
        </p>
        <button
          type="button"
          onClick={() => setQuincena(siguiente)}
          disabled={siguiente.desde > hoy}
          aria-label="Quincena siguiente"
          className={flecha}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7 fill-none stroke-current stroke-[2.5]">
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {enCurso && (
        <p className="text-lg text-tinta-suave">
          Esta quincena todavía no termina: el PDF lleva lo anotado hasta hoy.
        </p>
      )}

      {errorDeCarga && <ErrorDeCarga texto="No se pudo cargar la quincena." onReintentar={cargar} />}
      {filas === null && !errorDeCarga && <p className="text-lg text-tinta-suave">Cargando...</p>}

      {filas && (
        <>
          <p className="text-xl">
            {deben === 0 ? (
              'Nadie quedó debiendo en esta quincena.'
            ) : (
              <>
                {deben} {deben === 1 ? 'persona debe' : 'personas deben'}{' '}
                <strong className="font-semibold tabular-nums">{formatearPesos(porCobrar)}</strong>
              </>
            )}
          </p>

          {grupos.length > 0 && (
            <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
              {grupos.map((g) => (
                <li key={g.departamentoId} className="flex items-baseline gap-3 px-4 py-3">
                  <span className="text-lg font-semibold">{g.departamento}</span>
                  <span className="flex-1 text-base text-tinta-suave">
                    · {g.personas.length} {g.personas.length === 1 ? 'persona' : 'personas'}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">
                    {formatearPesos(g.personas.reduce((suma, s) => suma + Math.max(s.saldo, 0), 0))}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <BotonPdf
            key={`${quincena.desde}-${filas.length}-${porCobrar}`}
            texto="Hacer el PDF y compartir"
            disabled={personas === 0}
            preparar={() => pdfDeQuincena(filas, quincena, hoy)}
            onError={onError}
          />
          <p className="text-base text-tinta-suave">
            Sale una lista por departamento con lo que cada persona venía debiendo, lo que compró y pagó en la
            quincena, y lo que debe. Se puede mandar por WhatsApp, imprimir o guardar.
          </p>
        </>
      )}
    </section>
  )
}
