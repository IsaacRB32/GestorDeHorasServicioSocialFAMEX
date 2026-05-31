let currentChart = null;
let tablaPDFData  = null;

async function cargarDatosDashboard(idPrestador) {
    try {
        const response = await fetch(`/api/dashboard/${idPrestador}`);
        const data = await response.json();
        actualizarGrafica(data.horas_acumuladas);
    } catch (error) {
        console.error("Error obteniendo datos:", error);
    }
}

function actualizarGrafica(horas) {
    const ctx = document.getElementById('myChart').getContext('2d');
    
    // Si ya existe una gráfica, la destruimos para no encimar los datos
    if (currentChart) {
        currentChart.destroy();
    }

    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Horas Trabajadas'],
            datasets: [{ 
                label: 'Total Acumulado', 
                data: [horas], 
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            scales: { y: { beginAtZero: true } }
        }
    });
}

// NUEVA FUNCIÓN: Envía el Excel al backend
async function subirExcel() {
    const fileInput = document.getElementById('archivoExcel');
    const statusText = document.getElementById('uploadStatus');
    
    if (fileInput.files.length === 0) {
        statusText.innerText = "Error: Por favor selecciona un archivo Excel.";
        statusText.className = "mt-3 text-sm font-medium text-red-600";
        return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    statusText.innerText = "Procesando archivo, por favor espera...";
    statusText.className = "mt-3 text-sm font-medium text-blue-600";

    try {
        const response = await fetch('/api/upload-reporte', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        
        statusText.innerText = `¡Reporte cargado con éxito! Se guardaron ${result.procesados} registros en la base de datos.`;
        statusText.className = "mt-3 text-sm font-medium text-green-600";

        if (result.tabla_pdf && result.tabla_pdf.length > 0) {
            tablaPDFData = result.tabla_pdf;
            document.getElementById('btnDescargarPDF').classList.remove('hidden');
        }

        cargarDatosDashboard(1);
    } catch (error) {
        statusText.innerText = "Hubo un error al procesar el archivo.";
        statusText.className = "mt-3 text-sm font-medium text-red-600";
    }
}

// Reemplaza tu función actual por esta para ver los datos en tabla
function mostrarTablaResultados(horas) {
    const tbody = document.getElementById('tablaResultados'); // Asegúrate que tu HTML tenga este ID
    if (!tbody) return;

    tbody.innerHTML = `
        <tr class="bg-blue-50">
            <td class="py-3 px-4 font-bold">1</td>
            <td class="py-3 px-4">Alexia Bernal</td>
            <td class="py-3 px-4 font-bold text-blue-600">${horas} hrs</td>
        </tr>
    `;
}

// Y en tu función cargarDatosDashboard, llama a esta nueva función:
async function cargarDatosDashboard(idPrestador) {
    try {
        const response = await fetch(`/api/dashboard/${idPrestador}`);
        const data = await response.json();
        
        // Llamamos a la tabla en lugar de la gráfica para ser 100% estables
        mostrarTablaResultados(data.horas_acumuladas);
    } catch (error) {
        console.error("Error obteniendo datos:", error);
    }
}

// Cargar la gráfica en ceros al iniciar
function redondearHoras(horas) {
    const entero  = Math.floor(horas);
    const decimal = horas - entero;
    if (Math.abs(decimal - 0.5) < 1e-9) return entero + 0.5;
    if (decimal < 0.5) return entero;
    return entero + 1;
}

function generarPDF() {
    if (!tablaPDFData || tablaPDFData.length === 0) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    // Fechas únicas ordenadas presentes en el reporte
    const fechas = [...new Set(
        tablaPDFData.flatMap(p => p.registros.map(r => r.fecha))
    )].sort();

    // Encabezados: por cada fecha, columna Real y columna Redondeado
    const diaHeaders = fechas.flatMap(f => {
        const d   = new Date(f + 'T12:00:00');
        const lbl = `${DIAS[d.getDay()]} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        return [`${lbl}\n(Real)`, `${lbl}\n(Rond)`];
    });
    const head = [['ID', 'NOMBRE', ...diaHeaders, 'TOTAL\nSEMANAL']];

    // Filas
    const body = tablaPDFData.map(p => {
        const row = [p.id, p.nombre];
        let total = 0;
        fechas.forEach(f => {
            const reg  = p.registros.find(r => r.fecha === f);
            const real = reg ? reg.horas : 0;
            const rond = redondearHoras(real);
            row.push(real > 0 ? real.toFixed(2) : '—', rond > 0 ? String(rond) : '—');
            total += rond;
        });
        row.push(total > 0 ? String(total) : '—');
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
            fontSize: 7,
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
            fontSize: 6.5
        },
        columnStyles: {
            0: { cellWidth: 12 },
            1: { cellWidth: 40, halign: 'left' }
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        // Pintar columnas "Redondeado" en azul pálido para distinguirlas
        didParseCell(data) {
            if (data.section !== 'body') return;
            const isRondCol = data.column.index > 1
                && data.column.index % 2 === 1           // índice impar → columna Rond
                && data.column.index < head[0].length - 1;
            if (isRondCol) {
                data.cell.styles.fillColor = data.row.index % 2 === 0
                    ? [239, 246, 255]
                    : [219, 234, 254];
            }
        }
    });

    doc.save(`resumen_semanal_FAMEX_${new Date().toISOString().slice(0, 10)}.pdf`);
}

document.addEventListener('DOMContentLoaded', () => {
    cargarDatosDashboard(1); 
});