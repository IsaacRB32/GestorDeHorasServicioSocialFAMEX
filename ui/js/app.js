/* ui/js/app.js — lógica del Dashboard (index.html): carga de reporte,
 * tabla de estado, PDF semanal y migración histórica.
 * redondearHoras() y apiFetch() son globales (ui/js/famex-ui.js). */

let tablaPDFData = null;

async function cargarTablaEstado() {
    const tbody = document.getElementById('tablaResultados');
    if (!tbody) return;
    try {
        const res = await apiFetch('/api/seguimiento-datos');
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
        const response = await apiFetch('/api/upload-reporte', { method: 'POST', body: formData });
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

    if (result.procesados > 0) {
        document.getElementById('btnDescargarPDF').style.display = 'flex';
    }

    cargarTablaEstado();
}

// redondearHoras() vive en ui/js/famex-ui.js (window.redondearHoras).

async function generarPDF() {
    let datos = tablaPDFData;

    if (!datos || datos.length === 0) {
        try {
            const res = await apiFetch('/api/seguimiento-datos');
            const prestadores = await res.json();
            datos = prestadores.map(p => ({
                id: p.id,
                nombre: p.nombre,
                registros: p.registros.filter(r => r.horas > 0).map(r => ({ fecha: r.fecha, horas: r.horas }))
            })).filter(p => p.registros.length > 0);
        } catch(e) {
            await famexAlert('No hay datos disponibles para generar el PDF.', { tipo: 'error' });
            return;
        }
    }

    if (!datos || datos.length === 0) {
        await famexAlert('No hay registros de horas para generar el PDF.', { tipo: 'error' });
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    const fechas = [...new Set(
        datos.flatMap(p => p.registros.map(r => r.fecha))
    )].sort();

    const diaHeaders = fechas.map(f => {
        const d = new Date(f + 'T12:00:00');
        return `${DIAS[d.getDay()]} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}\nReal / Rond`;
    });
    const head = [['ID', 'NOMBRE', ...diaHeaders, 'TOTAL\nReal / Rond']];

    const body = datos.map(p => {
        const row = [p.id, p.nombre];
        let totalReal = 0;
        let totalRond = 0;
        fechas.forEach(f => {
            const reg  = p.registros.find(r => r.fecha === f);
            const real = reg ? (reg.horas_exactas ?? reg.horas) : 0;
            const rond = redondearHoras(real);
            if (real > 0) {
                row.push(`${real.toFixed(2)} / ${rond}h`);
                totalReal += real;
                totalRond += rond;
            } else {
                row.push('—');
            }
        });
        if (totalReal > 0) {
            row.push(`${totalReal.toFixed(2)} / ${totalRond}h`);
        } else {
            row.push('—');
        }
        return row;
    });

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
        didParseCell(data) {
            if (data.section !== 'body') return;
            const isDataCol = data.column.index > 1 && data.column.index < head[0].length - 1;
            if (isDataCol && String(data.cell.raw) !== '—') {
                data.cell.styles.fillColor = data.row.index % 2 === 0
                    ? [240, 253, 244]
                    : [220, 252, 231];
                data.cell.styles.textColor = [22, 101, 52];
            }
        }
    });

    // Impresión INTEGRADA: se carga el PDF en un iframe oculto dentro de la
    // misma ventana y se dispara el diálogo nativo de impresión ahí mismo
    // (sin abrir pestañas ni salir de la pantalla actual), igual que el
    // window.print() de la hoja de firmas pero para el PDF generado.
    const urlPDF = doc.output('bloburl');
    let frame = document.getElementById('famexPrintFrame');
    if (!frame) {
        frame = document.createElement('iframe');
        frame.id = 'famexPrintFrame';
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
        document.body.appendChild(frame);
    }
    frame.onload = function () {
        try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
        } catch (e) {
            // Fallback extremo si el navegador bloquea la impresión del iframe.
            doc.save(`resumen_semanal_FAMEX_${new Date().toISOString().slice(0, 10)}.pdf`);
        }
    };
    frame.src = urlPDF;
}

// ============ MIGRACIÓN HISTÓRICA (antes inline en index.html) ============
async function migrarHistorico() {
    const input = document.getElementById('archivoHistorico');
    const status = document.getElementById('migracionStatus');
    if (!input.files.length) {
        status.innerText = 'Selecciona el archivo seguimiento.xlsx primero.';
        status.className = 'mt-3 text-sm font-medium text-red-600';
        return;
    }
    const fd = new FormData();
    fd.append('file', input.files[0]);
    status.innerText = 'Migrando datos históricos...';
    status.className = 'mt-3 text-sm font-medium text-blue-600';
    try {
        const res = await apiFetch('/api/migrar-historico', { method: 'POST', body: fd });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Error del servidor (${res.status})`);
        }
        const r = await res.json();
        status.innerText = `✓ ${r.prestadores_nuevos} prestadores nuevos · ${r.registros_insertados} registros insertados`;
        status.className = 'mt-3 text-sm font-medium text-green-600';
    } catch (e) {
        status.innerText = `Error durante la migración: ${e.message}`;
        status.className = 'mt-3 text-sm font-medium text-red-600';
    }
}

// ============ MANTENIMIENTO / RESPALDOS ============
async function exportarBackup() {
    const status = document.getElementById('backupStatus');
    status.innerText = 'Generando respaldo...';
    status.className = 'mt-3 text-sm font-medium text-blue-600';
    try {
        const res = await apiFetch('/api/backup/exportar');
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Error del servidor (${res.status})`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `famex_backup_${new Date().toISOString().slice(0, 10)}.db`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        status.innerText = '\u2713 Respaldo descargado correctamente.';
        status.className = 'mt-3 text-sm font-medium text-green-600';
    } catch (e) {
        status.innerText = `Error al exportar: ${e.message}`;
        status.className = 'mt-3 text-sm font-medium text-red-600';
    }
}

async function restaurarBackup() {
    const input = document.getElementById('archivoBackup');
    const status = document.getElementById('backupStatus');
    if (!input.files.length) {
        status.innerText = 'Selecciona un archivo .db de respaldo primero.';
        status.className = 'mt-3 text-sm font-medium text-red-600';
        return;
    }
    const okRestaurar = await famexConfirm(
        'Esto reemplazará la base de datos actual por el respaldo seleccionado.\n\nSe guardará una copia de seguridad automática del estado actual antes de sobrescribir.',
        { titulo: 'Restaurar respaldo', tipo: 'warning', confirmLabel: 'Sí, restaurar', peligro: true }
    );
    if (!okRestaurar) return;
    const fd = new FormData(); fd.append('file', input.files[0]);
    status.innerText = 'Restaurando respaldo...';
    status.className = 'mt-3 text-sm font-medium text-blue-600';
    try {
        const res = await apiFetch('/api/backup/importar', { method: 'POST', body: fd });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Error del servidor (${res.status})`);
        }
        const r = await res.json();
        status.innerText = `\u2713 ${r.mensaje}`;
        status.className = 'mt-3 text-sm font-medium text-green-600';
        setTimeout(() => location.reload(), 1500);
    } catch (e) {
        status.innerText = `Error al restaurar: ${e.message}`;
        status.className = 'mt-3 text-sm font-medium text-red-600';
    }
}

document.addEventListener('DOMContentLoaded', cargarTablaEstado);
