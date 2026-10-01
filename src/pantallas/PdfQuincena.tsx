import { useCallback, useEffect, useState } from 'react'
import { BotonVolver } from '../componentes/Boton'
import { BotonPdf } from '../componentes/BotonPdf'
import { ErrorDeCarga } from '../componentes/ErrorDeCarga'
import { hoyBogota, nombreDeQuincena, quincenaDe, quincenaVecina, type Quincena } from '../lib/fechas'
import {
  COLUMNAS_DE_QUINCENA,
  encabezadoDeQuincena,
  pdfDeQuincena,
  tablasDeQuincena,
  type FilaDeQuincena,
} from '../lib/pdf'
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
  const tablas = filas ? tablasDeQuincena(filas) : []
  const porCobrar = filas?.reduce((suma, f) => suma + Math.max(f.saldo, 0), 0) ?? 0
  const personas = tablas.reduce((suma, t) => suma + t.filas.length, 0)
  // Quien tiene saldo a favor sale en el PDF, pero no "debe".
  const deben = filas?.filter((f) => f.saldo > 0).length ?? 0

  const flecha =
    'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-marca active:bg-marca-suave disabled:text-linea'

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <BotonVolver texto="Volver a Cobrar" onClick={onVolver} />
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

          {personas > 0 && (
            <>
              <p className="-mb-2 text-lg text-tinta-suave">Así va a salir en el PDF:</p>
              <VistaPrevia quincena={quincena} hoy={hoy} tablas={tablas} />
            </>
          )}

          <BotonPdf
            key={`${quincena.desde}-${filas.length}-${porCobrar}`}
            texto="Hacer el PDF y compartir"
            disabled={personas === 0}
            preparar={() => pdfDeQuincena(filas, quincena, hoy)}
            onError={onError}
          />
          <p className="text-lg text-tinta-suave">Se puede mandar por WhatsApp, imprimir o guardar.</p>
        </>
      )}
    </section>
  )
}

/**
 * Lo mismo que lleva el PDF, en la pantalla: los mismos títulos, tablas,
 * encabezados y valores (salen de tablasDeQuincena, igual que el PDF).
 */
function VistaPrevia({
  quincena,
  hoy,
  tablas,
}: {
  quincena: Quincena
  hoy: string
  tablas: ReturnType<typeof tablasDeQuincena>
}) {
  const arriba = encabezadoDeQuincena(quincena, hoy)
  const celda = 'border border-control px-2 py-1.5'
  return (
    <div className="flex flex-col gap-6 rounded-xl border border-linea bg-superficie px-4 py-6">
      <div className="text-center">
        <p className="text-2xl font-bold">{arriba.titulo}</p>
        <p className="text-lg">{arriba.quincena}</p>
        <p className="text-base text-tinta-suave">{arriba.hecho}</p>
      </div>
      {tablas.map((t, n) => (
        <div key={t.departamento} className="flex flex-col gap-2">
          <h2 id={`departamento-${n}`} className="text-center text-lg font-bold">
            {t.departamento}
          </h2>
          {/* En el celular la tabla puede no caber: se corre de lado sin mover la pantalla. */}
          <div className="overflow-x-auto">
            <table aria-labelledby={`departamento-${n}`} className="w-full border-collapse text-base tabular-nums">
              <thead>
                <tr>
                  {COLUMNAS_DE_QUINCENA.map((c, i) => (
                    <th
                      key={c}
                      scope="col"
                      className={`${celda} font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.filas.map((fila, i) => (
                  <tr key={i}>
                    {fila.map((valor, j) => (
                      <td
                        key={j}
                        className={`${celda} ${j === 0 ? 'text-left' : 'text-right whitespace-nowrap'} ${j === fila.length - 1 ? 'font-bold' : ''}`}
                      >
                        {valor}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
