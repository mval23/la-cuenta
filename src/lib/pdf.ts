// Los documentos en PDF. La librería se carga solo cuando se pide un PDF, para
// que la app abra igual de rápido.

import type { jsPDF } from 'jspdf'
import type { CellInput, RowInput } from 'jspdf-autotable'
import { agruparParaCobro } from './cobro'
import { fechaDeDocumento, fechaDeTabla, fechaLarga, nombreDeQuincena, type Quincena } from './fechas'
import { sumaEnLetras } from './letras'
import { formatearPesos } from './pesos'
import type { Saldo } from './tipos'

export interface Pdf {
  archivo: Blob
  nombre: string
}

// Colores de la paleta (src/index.css), en RGB para jsPDF.
const TINTA: [number, number, number] = [27, 31, 36]
const TINTA_SUAVE: [number, number, number] = [80, 88, 102]
const LINEA: [number, number, number] = [150, 156, 166]

// Carta, en milímetros.
const MARGEN = 18

async function librerias() {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { jsPDF, autoTable }
}

/** Sin caracteres que el iPad no acepta en nombres de archivo. */
function nombreDeArchivo(texto: string): string {
  return `${texto.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()}.pdf`
}

/** "62.000", sin signo: así van los valores dentro de las tablas. */
function miles(valor: number): string {
  return formatearPesos(valor).replace('$', '')
}

function numerarPaginas(doc: jsPDF) {
  const total = doc.getNumberOfPages()
  if (total < 2) return
  const { width, height } = doc.internal.pageSize
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...TINTA_SUAVE)
    doc.text(`Página ${i} de ${total}`, width - MARGEN, height - 10, { align: 'right' })
  }
}

// Cuenta de la quincena ------------------------------------------------------

/** Una persona en la quincena: ver cuenta_de_quincena() en la base. */
export interface FilaDeQuincena extends Omit<Saldo, 'activo'> {
  anterior: number
}

/** Lo que alguien venía debiendo o tenía a favor, dicho corto. */
function saldoEnTabla(valor: number): string {
  if (valor === 0) return ''
  return valor < 0 ? `A favor ${formatearPesos(-valor)}` : formatearPesos(valor)
}

/**
 * La lista de quién debe cuánto en la quincena, por departamento. Solo quien
 * debe o tiene saldo a favor al terminar la quincena.
 */
export async function pdfDeQuincena(filas: FilaDeQuincena[], q: Quincena, hoy: string): Promise<Pdf> {
  const { jsPDF, autoTable } = await librerias()
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const ancho = doc.internal.pageSize.width
  const alto = doc.internal.pageSize.height
  const centro = ancho / 2
  const grupos = agruparParaCobro(filas.map((f) => ({ ...f, activo: true })))
  const porFila = new Map(filas.map((f) => [f.persona_id, f]))

  doc.setTextColor(...TINTA).setFont('helvetica', 'bold').setFontSize(18)
  doc.text('Cuentas por cobrar', centro, MARGEN + 4, { align: 'center' })
  doc.setFont('helvetica', 'normal').setFontSize(12)
  doc.text(`Quincena del ${nombreDeQuincena(q)}`, centro, MARGEN + 11, { align: 'center' })
  doc.setFontSize(10).setTextColor(...TINTA_SUAVE)
  doc.text(`Hecho el ${fechaLarga(hoy)}`, centro, MARGEN + 17, { align: 'center' })
  doc.setTextColor(...TINTA)

  let y = MARGEN + 30
  if (grupos.length === 0) {
    doc.setFontSize(12).text('Nadie debe en esta quincena.', centro, y, { align: 'center' })
  }

  // Una tabla por departamento, con su nombre como título.
  for (const g of grupos) {
    // El título no queda solo al final de la hoja: va con al menos un par de renglones.
    if (y + 30 > alto - 16) {
      doc.addPage()
      y = MARGEN + 4
    }
    const titulo = g.departamento.toUpperCase()
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...TINTA)
    doc.text(titulo, centro, y, { align: 'center' })

    autoTable(doc, {
      startY: y + 3,
      // Arriba queda espacio para repetir el título si la tabla sigue en otra hoja.
      margin: { top: MARGEN + 7, left: MARGEN, right: MARGEN, bottom: 16 },
      head: [['Nombre', 'Venía debiendo', 'Debe']],
      body: g.personas.map((s): RowInput => {
        const f = porFila.get(s.persona_id)!
        return [f.nombre, saldoEnTabla(f.anterior), { content: saldoEnTabla(f.saldo), styles: { fontStyle: 'bold' } }]
      }),
      // Sin color, como la cuenta de cobro.
      theme: 'grid',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: 11,
        textColor: TINTA,
        lineColor: LINEA,
        lineWidth: 0.3,
        cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
      },
      headStyles: { fillColor: false, fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'right', cellWidth: 40 },
        2: { halign: 'right', cellWidth: 40 },
      },
      didParseCell: ({ section, column, cell }) => {
        if (section === 'head' && column.index > 0) cell.styles.halign = 'right'
      },
      didDrawPage: ({ pageNumber, doc: d }) => {
        if (pageNumber === 1) return
        d.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...TINTA)
        d.text(`${titulo} (continúa)`, centro, MARGEN + 4, { align: 'center' })
      },
    })
    // jspdf-autotable deja la posición final en el documento.
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14
  }

  numerarPaginas(doc)
  return {
    archivo: doc.output('blob'),
    nombre: nombreDeArchivo(`Cuentas quincena ${nombreDeQuincena(q)}`),
  }
}

// Cuenta de cobro ------------------------------------------------------------

export interface DatosDeCobro {
  nombre: string
  documento: string
  ciudad: string
  nota: string
  cliente_nombre: string
  cliente_nit: string
  concepto: string
}

export interface FilaDeCobro {
  fecha: string
  unidades: number | null
  descripcion: string
  valorUnitario: number | null
  valorTotal: number
}

/** Una etiqueta en negrilla y el texto seguido, centrado si cabe en un renglón. */
function lineaConEtiqueta(doc: jsPDF, etiqueta: string, texto: string, y: number, centrada: boolean): number {
  const ancho = doc.internal.pageSize.width
  const disponible = ancho - 2 * MARGEN
  doc.setFont('helvetica', 'bold')
  const anchoEtiqueta = doc.getTextWidth(`${etiqueta} `)
  doc.setFont('helvetica', 'normal')
  const anchoTexto = doc.getTextWidth(texto)
  if (anchoEtiqueta + anchoTexto <= disponible) {
    const x = centrada ? (ancho - anchoEtiqueta - anchoTexto) / 2 : MARGEN
    doc.setFont('helvetica', 'bold').text(`${etiqueta} `, x, y)
    doc.setFont('helvetica', 'normal').text(texto, x + anchoEtiqueta, y)
    return y
  }
  doc.setFont('helvetica', 'bold').text(`${etiqueta} `, MARGEN, y)
  const renglones = doc.setFont('helvetica', 'normal').splitTextToSize(texto, disponible - anchoEtiqueta) as string[]
  renglones.forEach((r, i) => doc.text(r, MARGEN + anchoEtiqueta, y + i * 6))
  return y + (renglones.length - 1) * 6
}

/** Como la cuenta de cobro que Amparo hace a mano: quién debe, a quién, cuánto y por qué. */
export async function pdfDeCuentaDeCobro(datos: DatosDeCobro, fecha: string, filas: FilaDeCobro[]): Promise<Pdf> {
  const { jsPDF, autoTable } = await librerias()
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const ancho = doc.internal.pageSize.width
  const alto = doc.internal.pageSize.height
  const centro = ancho / 2
  const total = filas.reduce((suma, f) => suma + f.valorTotal, 0)

  doc.setTextColor(...TINTA)
  doc.setFont('helvetica', 'normal').setFontSize(12)
  doc.text(`${datos.ciudad ? `${datos.ciudad}, ` : ''}${fechaDeDocumento(fecha)}`, MARGEN, MARGEN + 10)

  let y = MARGEN + 23
  doc.setFont('helvetica', 'bold').setFontSize(13)
  doc.text(datos.cliente_nombre, centro, y, { align: 'center' })
  if (datos.cliente_nit) {
    y += 6
    doc.setFont('helvetica', 'normal').setFontSize(12).text(`Nit. ${datos.cliente_nit}`, centro, y, { align: 'center' })
  }
  y += 10
  doc.setFont('helvetica', 'bold').setFontSize(12).text('DEBE A:', centro, y, { align: 'center' })
  y += 10
  doc.setFontSize(13).text(datos.nombre.toUpperCase(), centro, y, { align: 'center' })
  y += 6
  doc.setFont('helvetica', 'normal').setFontSize(12).text(`CC. ${datos.documento}`, centro, y, { align: 'center' })

  y += 14
  y = lineaConEtiqueta(doc, 'La suma de:', sumaEnLetras(total), y, true)
  if (datos.concepto) {
    y += 10
    y = lineaConEtiqueta(doc, 'Por Concepto:', datos.concepto, y, true)
  }

  const celdaDerecha = (texto: string): CellInput => ({ content: texto, styles: { halign: 'right' } })
  autoTable(doc, {
    startY: y + 8,
    margin: { left: MARGEN, right: MARGEN, bottom: 20 },
    head: [['FECHA', 'UNID.', 'DESCRIPCIÓN', 'VR. UNITARIO', 'VR. TOTAL']],
    body: filas.map((f) => [
      fechaDeTabla(f.fecha),
      { content: f.unidades ? String(f.unidades) : '', styles: { halign: 'center' } },
      f.descripcion,
      celdaDerecha(f.valorUnitario ? miles(f.valorUnitario) : ''),
      celdaDerecha(miles(f.valorTotal)),
    ]),
    foot: [['TOTAL', '', '', '', celdaDerecha(`$ ${miles(total)}`)]],
    showFoot: 'lastPage',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 11,
      textColor: TINTA,
      lineColor: LINEA,
      lineWidth: 0.3,
      cellPadding: 2.2,
      valign: 'bottom',
    },
    // Sin color, como la cuenta hecha a mano.
    headStyles: { fillColor: false, fontStyle: 'bold', halign: 'center', valign: 'middle' },
    footStyles: { fillColor: false, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 17 },
      3: { cellWidth: 30 },
      4: { cellWidth: 32 },
    },
  })

  // jspdf-autotable deja la posición final en el documento.
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  // La nota y la firma van juntas: si no caben, pasan a otra hoja.
  if (y + 36 > alto - 12) {
    doc.addPage()
    y = MARGEN + 10
  }
  if (datos.nota) {
    doc.setFontSize(12)
    y = lineaConEtiqueta(doc, 'Nota:', datos.nota, y, false)
  }

  // Espacio para firmar a mano encima de la línea, centrada en la hoja.
  y += 24
  doc.setDrawColor(...TINTA).setLineWidth(0.3)
  doc.line(centro - 37.5, y, centro + 37.5, y)
  doc.setFont('helvetica', 'bold').setFontSize(12).text(datos.nombre, centro, y + 6, { align: 'center' })
  doc.setFont('helvetica', 'normal').text(`CC. ${datos.documento}`, centro, y + 12, { align: 'center' })

  numerarPaginas(doc)
  return {
    archivo: doc.output('blob'),
    nombre: nombreDeArchivo(`Cuenta de cobro ${datos.cliente_nombre} ${fechaDeDocumento(fecha)}`),
  }
}
