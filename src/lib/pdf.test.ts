import { describe, expect, it } from 'vitest'
import { pdfDeCuentaDeCobro, pdfDeQuincena, tablasDeQuincena, type FilaDeQuincena } from './pdf'

async function esPdf(archivo: Blob) {
  return new TextDecoder().decode(await archivo.slice(0, 5).arrayBuffer()) === '%PDF-'
}

describe('pdfDeQuincena', () => {
  const fila = (cambios: Partial<FilaDeQuincena>): FilaDeQuincena => ({
    persona_id: 1,
    nombre: 'Ana',
    departamento_id: 1,
    departamento: 'TDH',
    anterior: 0,
    comprado: 12000,
    especiales: 0,
    pagado: 0,
    saldo: 12000,
    ...cambios,
  })

  it('arma el PDF con el nombre de la quincena', async () => {
    const pdf = await pdfDeQuincena(
      [
        fila({}),
        fila({ persona_id: 3, nombre: 'Israel', comprado: 27000, especiales: 15000, saldo: 27000 }),
        fila({ persona_id: 2, nombre: 'Luis', saldo: -5000, anterior: -5000, comprado: 0 }),
      ],
      { desde: '2026-09-16', hasta: '2026-09-30' },
      '2026-09-18',
    )
    expect(await esPdf(pdf.archivo)).toBe(true)
    expect(pdf.nombre).toBe('Cuentas quincena 16 al 30 de septiembre de 2026.pdf')
  })

  it('las tablas (las mismas de la vista previa) separan lo normal de lo especial', () => {
    expect(
      tablasDeQuincena([
        fila({ nombre: 'Israel', comprado: 30800, especiales: 15000, saldo: 26400 }),
        fila({ persona_id: 2, nombre: 'Ibeth', anterior: 8000, comprado: 42000, saldo: 50000 }),
        fila({ persona_id: 3, nombre: 'Luis', departamento_id: 2, departamento: 'Sistemas', anterior: -5000, comprado: 0, saldo: -5000 }),
      ]),
    ).toEqual([
      {
        departamento: 'SISTEMAS',
        filas: [['Luis', 'A favor $5.000', '', '', 'A favor $5.000']],
      },
      {
        departamento: 'TDH',
        filas: [
          ['Ibeth', '$8.000', '$42.000', '', '$50.000'],
          ['Israel', '', '$15.800', '$15.000', '$26.400'],
        ],
      },
    ])
  })

  it('también sin nadie que deba', async () => {
    const pdf = await pdfDeQuincena([], { desde: '2026-09-01', hasta: '2026-09-15' }, '2026-09-18')
    expect(await esPdf(pdf.archivo)).toBe(true)
  })
})

describe('pdfDeCuentaDeCobro', () => {
  it('arma el PDF con la empresa y la fecha en el nombre, sin caracteres raros', async () => {
    const pdf = await pdfDeCuentaDeCobro(
      {
        nombre: 'Amparo',
        documento: '1',
        ciudad: 'Neiva',
        nota: 'Consignar en la cuenta',
        cliente_nombre: 'ORF S.A. / BIC',
        cliente_nit: '891',
        concepto: 'Servicio de comedor y otros',
      },
      '2026-09-14',
      Array.from({ length: 40 }, () => ({
        fecha: '2026-09-01',
        unidades: 2,
        descripcion: 'Desayunos personal gerencia',
        valorUnitario: null,
        valorTotal: 32000,
      })),
    )
    expect(await esPdf(pdf.archivo)).toBe(true)
    expect(pdf.nombre).toBe('Cuenta de cobro ORF S.A. BIC 14 de Septiembre de 2026.pdf')
  })
})
