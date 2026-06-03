let tablaPDFData = null;

async function cargarTablaEstado() {
    const tbody = document.getElementById('tablaResultados');
    if (!tbody) return;
    try {
        const res = await fetch('/api/seguimiento-datos');
        const prestadores = await res.json();
        if (!prestadores.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-4 px-6 text-center text-gray-400 text-sm">No hay prestadores registrados.</td></tr>';
            return;
        }
        tbody.innerHTML = prestadores.map(p => `
            <tr class="hover:bg-gray-50 border-b border-gray-100 transition-colors">
                <td class="py-3 px-6 text-sm font-semibold text-gray-600">${p.id}</td>
                <td class="py-3 px-6 font-bold text-gray-800">${p.nombre}</td>
                <td class="py-3 px-6 text-gray-500 text-sm">${p.departamento}</td>
                <td class="py-3 px-6 font-bold text-blue-600">${p.horas_totales} hrs</td>
            </tr>`).join('');
    } catch (e) {
        console.error('Error cargando tabla de estado:', e);
    }
}

async function subirExcel() {
    const fileInput = document.getElementById('archivoExcel');
    const statusText = document.getElementById('uploadStatus');

    if (!fileInput.files.length) {
        statusText.innerText = 'Error: Por favor selecciona un archivo Excel.';
        statusText.className = 'mt-3 text-sm font-medium text-red-600';
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    statusText.innerText = 'Procesando archivo, por favor espera...';
    statusText.className = 'mt-3 text-sm font-medium text-blue-600';

    let result;
    try {
        const response = await fetch('/api/upload-reporte', { method: 'POST', body: formData });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Error del servidor (${response.status})`);
        }
        result = await response.json();
    } catch (error) {
        statusText.innerText = `Error al procesar: ${error.message}`;
        statusText.className = 'mt-3 text-sm font-medium text-red-600';
        return;
    }

    statusText.innerText = `¡Reporte cargado con éxito! Se guardaron ${result.procesados} registros.`;
    statusText.className = 'mt-3 text-sm font-medium text-green-600';

    tablaPDFData = (result.tabla_pdf && result.tabla_pdf.length > 0) ? result.tabla_pdf : null;

    // Mostrar botón siempre que haya procesado algo — usa style inline para ganar sobre cualquier clase CSS
    if (result.procesados > 0) {
        document.getElementById('btnDescargarPDF').style.display = 'flex';
    }

    cargarTablaEstado();
}

function redondearHoras(horas) {
    const entero  = Math.floor(horas);
    const decimal = horas - entero;
    if (Math.abs(decimal - 0.5) < 1e-9) return entero + 0.5;
    if (decimal < 0.5) return entero;
    return entero + 1;
}

async function generarPDF() {
    let datos = tablaPDFData;

    // Fallback: si no hay datos del upload, los pedimos al servidor
    if (!datos || datos.length === 0) {
        try {
            const res = await fetch('/api/seguimiento-datos');
            const prestadores = await res.json();
            datos = prestadores.map(p => ({
                id: p.id,
                nombre: p.nombre,
                registros: p.registros.filter(r => r.horas > 0).map(r => ({ fecha: r.fecha, horas: r.horas }))
            })).filter(p => p.registros.length > 0);
        } catch(e) {
            alert('No hay datos disponibles para generar el PDF.');
            return;
        }
    }

    if (!datos || datos.length === 0) {
        alert('No hay registros de horas para generar el PDF.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    // Fechas únicas ordenadas presentes en el reporte
    const fechas = [...new Set(
        datos.flatMap(p => p.registros.map(r => r.fecha))
    )].sort();

    // Opción A: una columna por día — Real y Rond en la misma celda "4.32 / 4.5h"
    const diaHeaders = fechas.map(f => {
        const d = new Date(f + 'T12:00:00');
        return `${DIAS[d.getDay()]} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}\nReal / Rond`;
    });
    const head = [['ID', 'NOMBRE', ...diaHeaders, 'TOTAL']];

    const body = datos.map(p => {
        const row = [p.id, p.nombre];
        let total = 0;
        fechas.forEach(f => {
            const reg  = p.registros.find(r => r.fecha === f);
            const real = reg ? reg.horas : 0;   // valor exacto del servidor
            const rond = redondearHoras(real);   // redondeo correcto en cliente
            if (real > 0) {
                row.push(`${real.toFixed(2)} / ${rond}h`);
                total += rond;
            } else {
                row.push('—');
            }
        });
        row.push(total > 0 ? `${total}h` : '—');
        return row;
    });

    // Título
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Resumen Semanal de Asistencias — FAMEX Control', 14, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, 14, 21);

    doc.autoTable({
        head,
        body,
        startY: 26,
        styles: {
            fontSize: 7.5,
            cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
            halign: 'center',
            valign: 'middle',
            lineColor: [226, 232, 240],
            lineWidth: 0.3
        },
        headStyles: {
            fillColor: [15, 23, 42],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7
        },
        columnStyles: {
            0: { cellWidth: 12 },
            1: { cellWidth: 44, halign: 'left' }
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        // Celdas con horas en verde; sin datos quedan neutras
        didParseCell(data) {
            if (data.section !== 'body') return;
            const isDataCol = data.column.index > 1 && data.column.index < head[0].length - 1;
            if (isDataCol && String(data.cell.raw) !== '—') {
                data.cell.styles.fillColor = data.row.index % 2 === 0
                    ? [240, 253, 244]   // green-50
                    : [220, 252, 231];  // green-100
                data.cell.styles.textColor = [22, 101, 52];
            }
        }
    });

    doc.save(`resumen_semanal_FAMEX_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Cargar la tabla al iniciar la página
document.addEventListener('DOMContentLoaded', cargarTablaEstado);