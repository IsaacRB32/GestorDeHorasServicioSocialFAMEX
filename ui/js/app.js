let currentChart = null;

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
        
        // Recargamos el dashboard para que la gráfica se actualice automáticamente
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
document.addEventListener('DOMContentLoaded', () => {
    cargarDatosDashboard(1); 
});