let datosGlobales = [];
let cacheDatosSeguimiento = null; // CACHÉ en memoria
// Mes/año ACTUAL del sistema (dinámico). Antes estaba fijo en mayo 2026.
let fechaActual = (function () { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
const mesesNombres = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// Precalcular mapa de registros por prestador para búsqueda O(1)
function construirMapaRegistros(prestador) {
    if (!prestador._mapa) {
        prestador._mapa = {};
        for (const r of prestador.registros) { prestador._mapa[r.fecha] = r; }
    }
    return prestador._mapa;
}

async function cargarSeguimiento(forzar) {
    if (!forzar && cacheDatosSeguimiento) {
        datosGlobales = cacheDatosSeguimiento;
    } else {
        const response = await apiFetch('/api/seguimiento-datos');
        datosGlobales = await response.json();
        // Limpiar mapas previos y cachear
        datosGlobales.forEach(p => { p._mapa = null; });
        cacheDatosSeguimiento = datosGlobales;
    }
    renderizarCalendarios();
}

function cambiarMes(direccion) {
    fechaActual.setMonth(fechaActual.getMonth() + direccion);
    renderizarCalendarios(); // Sin fetch — usa caché
}

function renderizarCalendarios() {
    const year = fechaActual.getFullYear();
    const month = fechaActual.getMonth();
    const mesStr = String(month + 1).padStart(2, '0');

    document.getElementById('labelMesActual').innerText = `${mesesNombres[month]} ${year}`;

    const contenedor = document.getElementById('contenedorTarjetas');

    const primerDia = new Date(year, month, 1).getDay();
    const diasEnMes = new Date(year, month + 1, 0).getDate();
    const offset = primerDia === 0 ? 6 : primerDia - 1;
    const huecosLab = offset > 4 ? 0 : offset;

    // Precalcular días laborales del mes una sola vez
    const diasLab = [];
    for (let dia = 1; dia <= diasEnMes; dia++) {
        const dow = new Date(year, month, dia).getDay();
        if (dow !== 0 && dow !== 6) {
            diasLab.push({ dia, fecha: `${year}-${mesStr}-${String(dia).padStart(2,'0')}` });
        }
    }

    // Construir todo el HTML en un solo string — evita innerHTML += en bucle
    const partes = [];

    for (const prestador of datosGlobales) {
        const mapa = construirMapaRegistros(prestador);
        const meta = prestador.horas_obligatorias || 480;
        const porcentaje = Math.min((prestador.horas_totales / meta) * 100, 100).toFixed(1);

        // Celdas de días
        let diasHtml = '';
        for (let i = 0; i < huecosLab; i++) {
            diasHtml += '<div class="bg-gray-100 border-b border-r border-gray-200 opacity-40 h-16"></div>';
        }

        for (const { dia, fecha } of diasLab) {
            const reg = mapa[fecha];
            let cls, inner;

            if (reg && reg.requiere_revision) {
                cls = 'bg-orange-100 hover:bg-orange-200 ring-2 ring-inset ring-orange-400 text-orange-700';
                inner = '<span class="text-[10px] font-black">⚠ REVISAR</span>';
            } else if (reg && reg.horas > 0) {
                cls = 'bg-green-50 hover:bg-green-100 text-green-700';
                inner = `<span class="text-xl font-black">${reg.horas}</span><span class="text-xs font-bold ml-0.5 opacity-70">h</span>`;
            } else if (reg && reg.estatus === 'Falta') {
                cls = 'bg-red-50 hover:bg-red-100';
                inner = '<span class="text-xs font-bold text-red-600">FALTA</span>';
            } else if (reg && reg.estatus === 'Justificante') {
                cls = 'bg-yellow-50 hover:bg-yellow-100';
                inner = '<span class="text-[10px] font-bold text-yellow-700">JUSTIF.</span>';
            } else {
                cls = 'bg-white hover:bg-gray-50 text-gray-300';
                inner = '<span class="text-lg">-</span>';
            }

            // data-pid y data-fecha para delegación de eventos — sin onclick individual
            diasHtml += `<div class="${cls} relative h-16 flex flex-col justify-center items-center cursor-pointer border-b border-r border-gray-200 dia-celda" data-pid="${prestador.id}" data-fecha="${fecha}"><span class="absolute top-1 left-1.5 text-[10px] font-bold text-gray-400">${dia}</span>${inner}</div>`;
        }

        const btnBaja = prestador.horas_totales >= meta
            ? `<button class="btn-baja bg-red-600 hover:bg-red-700 text-white text-xs font-black px-3 py-1.5 rounded-lg shadow-md shadow-red-200 transition flex items-center gap-1" data-pid="${prestador.id}" data-nombre="${prestador.nombre}"><span>✓</span> Dar de Baja</button>`
            : '';

        partes.push(`<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden prestador-card" data-depto="${prestador.departamento}" data-nombre="${prestador.nombre.toLowerCase()}"><div class="p-5 border-b border-gray-100 bg-slate-50 flex justify-between items-center"><div><div class="mb-1.5">${badgeDepto(prestador.departamento)}</div><h3 class="text-lg font-black text-gray-800 leading-tight">${prestador.nombre}</h3><p class="text-xs text-gray-500 font-medium mt-0.5">ID Checador: ${prestador.id}</p></div><div class="text-right flex flex-col items-end gap-2"><div class="text-3xl font-black text-gray-800">${prestador.horas_totales}<span class="text-sm font-medium text-gray-400 ml-1">/ ${meta}h</span></div>${btnBaja}</div></div><div class="p-5"><div class="flex justify-between items-end mb-4"><div class="w-1/2"><div class="flex justify-between text-xs mb-1 font-semibold text-gray-500"><span>Progreso Global</span><span>${porcentaje}%</span></div><div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-blue-500 h-2 rounded-full" style="width:${porcentaje}%"></div></div></div><div class="flex space-x-2"><span class="bg-red-50 text-red-600 border border-red-100 px-2.5 py-1 rounded text-xs font-bold">Faltas: ${prestador.faltas}</span><span class="bg-yellow-50 text-yellow-700 border border-yellow-100 px-2.5 py-1 rounded text-xs font-bold">Justificantes: ${prestador.justificantes}</span>${prestador.revisiones > 0 ? `<span class="bg-orange-100 text-orange-700 border border-orange-300 px-2.5 py-1 rounded text-xs font-black">⚠ ${prestador.revisiones} por revisar</span>` : ''}</div></div><div class="border-t border-l border-gray-200 rounded overflow-hidden"><div class="grid grid-cols-5 bg-gray-100 border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase tracking-wider"><div class="py-2 text-center border-r border-gray-200">Lun</div><div class="py-2 text-center border-r border-gray-200">Mar</div><div class="py-2 text-center border-r border-gray-200">Mié</div><div class="py-2 text-center border-r border-gray-200">Jue</div><div class="py-2 text-center border-r border-gray-200">Vie</div></div><div class="grid grid-cols-5 bg-gray-200">${diasHtml}</div></div></div></div>`);
    }

    contenedor.innerHTML = partes.join('');
    aplicarFiltros();
}

// DELEGACIÓN DE EVENTOS — un solo listener en el contenedor
document.getElementById('contenedorTarjetas').addEventListener('click', function(e) {
    // Click en celda de día
    const celda = e.target.closest('.dia-celda');
    if (celda) {
        abrirEdicion(parseInt(celda.dataset.pid), celda.dataset.fecha);
        return;
    }
    // Click en botón dar de baja
    const btnBaja = e.target.closest('.btn-baja');
    if (btnBaja) {
        darDeBaja(parseInt(btnBaja.dataset.pid), btnBaja.dataset.nombre);
    }
});

document.getElementById('buscarNombre').addEventListener('input', aplicarFiltros);
document.getElementById('filtroDepto').addEventListener('change', aplicarFiltros);

function aplicarFiltros() {
    const txt = document.getElementById('buscarNombre').value.toLowerCase();
    const depto = document.getElementById('filtroDepto').value;
    const tarjetas = document.querySelectorAll('.prestador-card');

    for (const t of tarjetas) {
        const matchN = t.dataset.nombre.includes(txt);
        const matchD = !depto || depto === 'Todos' || t.dataset.depto === depto;
        t.style.display = (matchN && matchD) ? 'block' : 'none';
    }
}

// --- Estado del modal ---
let tabActual = 'Falta';
let metodoActual = 'manual';

const TAB_CFG = {
    Falta:        { active: 'bg-red-600 text-white border-red-600 shadow-md shadow-red-200',   inactive: 'bg-white text-red-400 border-red-200 hover:bg-red-50' },
    Justificante: { active: 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-200', inactive: 'bg-white text-amber-400 border-amber-200 hover:bg-amber-50' },
    Horas:        { active: 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200',  inactive: 'bg-white text-blue-400 border-blue-200 hover:bg-blue-50' }
};

function seleccionarTab(tab) {
    tabActual = tab;
    ['Falta', 'Justificante', 'Horas'].forEach(t => {
        const btn = document.getElementById(`tab${t}`);
        const panel = document.getElementById(`panel${t}`);
        const esActivo = t === tab;
        btn.className = `py-2.5 px-2 rounded-xl text-sm font-black border-2 transition-all ${esActivo ? TAB_CFG[t].active : TAB_CFG[t].inactive}`;
        panel.classList.toggle('hidden', !esActivo);
    });
    if (tab === 'Horas') seleccionarMetodo(metodoActual);
}

function seleccionarMetodo(metodo) {
    metodoActual = metodo;
    const esManual = metodo === 'manual';
    const BASE = 'flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ';
    document.getElementById('labelManual').className = BASE + (esManual  ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-gray-200 text-gray-500');
    document.getElementById('labelRango').className  = BASE + (!esManual ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-gray-200 text-gray-500');
    document.getElementById('subManual').classList.toggle('hidden', !esManual);
    document.getElementById('subRango').classList.toggle('hidden',  esManual);
}

// redondearHoras() es global (ui/js/famex-ui.js → window.redondearHoras).

function calcularRango() {
    const vInicio = document.getElementById('inputInicio').value;
    const vFin    = document.getElementById('inputFin').value;
    const divRes  = document.getElementById('resultadoCalculo');
    const divErr  = document.getElementById('errorRango');

    if (!vInicio || !vFin) { divRes.classList.add('hidden'); divErr.classList.add('hidden'); return; }

    const [hI, mI] = vInicio.split(':').map(Number);
    const [hF, mF] = vFin.split(':').map(Number);
    const minutos  = (hF * 60 + mF) - (hI * 60 + mI);

    if (minutos <= 0) {
        divRes.classList.add('hidden');
        divErr.classList.remove('hidden');
        return;
    }
    divErr.classList.add('hidden');

    const exactas     = minutos / 60;
    const redondeadas = redondearHoras(exactas);
    const decimal     = exactas - Math.floor(exactas);

    let regla = decimal < 0.5
        ? `${decimal.toFixed(2)} < 0.5 → redondeo hacia abajo`
        : Math.abs(decimal - 0.5) < 1e-9
            ? `Decimal exactamente 0.5 → se mantiene`
            : `${decimal.toFixed(2)} > 0.5 → redondeo hacia arriba`;

    document.getElementById('horasExactas').innerText    = exactas.toFixed(2);
    document.getElementById('horasRedondeadas').innerText = redondeadas;
    document.getElementById('reglaAplicada').innerText    = regla;
    divRes.classList.remove('hidden');
}

function abrirEdicion(id, fechaExacta) {
    document.getElementById('modalEdicion').classList.remove('hidden');

    const f = new Date(fechaExacta + 'T12:00:00');
    document.getElementById('modalTitulo').innerText = `${f.getDate()} de ${mesesNombres[f.getMonth()]}`;
    document.getElementById('modalId').value    = id;
    document.getElementById('modalFecha').value = fechaExacta;

    // Limpiar entradas de rango
    document.getElementById('inputInicio').value = '';
    document.getElementById('inputFin').value    = '';
    document.getElementById('resultadoCalculo').classList.add('hidden');
    document.getElementById('errorRango').classList.add('hidden');

    // Resetear método a manual
    metodoActual = 'manual';
    document.querySelector('input[name="metodoCaptura"][value="manual"]').checked = true;

    const prestador = datosGlobales.find(p => parseInt(p.id) === parseInt(id));
    const registro  = prestador ? prestador.registros.find(r => r.fecha === fechaExacta) : null;

    if (registro?.requiere_revision) {
        // Anomalía del checador: abrir en modo Rango con las checadas rescatadas
        // para que el admin confirme/corrija y, al guardar, se limpie la bandera.
        seleccionarTab('Horas');
        seleccionarMetodo('rango');
        const radioRango = document.querySelector('input[name="metodoCaptura"][value="rango"]');
        if (radioRango) radioRango.checked = true;
        document.getElementById('inputInicio').value = registro.entrada || '';
        document.getElementById('inputFin').value    = registro.salida || '';
        if (registro.entrada && registro.salida) calcularRango();
    } else if (registro?.estatus === 'Falta') {
        seleccionarTab('Falta');
    } else if (registro?.estatus === 'Justificante') {
        seleccionarTab('Justificante');
    } else {
        seleccionarTab('Horas');
        document.getElementById('inputManualHoras').value = registro ? registro.horas : 0;
    }
}

function cerrarModal() {
    document.getElementById('modalEdicion').classList.add('hidden');
}

async function guardarEdicion() {
    let horas = 0, estatus = 'Asistencia';

    if (tabActual === 'Falta') {
        estatus = 'Falta';
    } else if (tabActual === 'Justificante') {
        estatus = 'Justificante';
    } else {
        if (metodoActual === 'manual') {
            horas = parseFloat(document.getElementById('inputManualHoras').value) || 0;
        } else {
            const resultadoVisible = !document.getElementById('resultadoCalculo').classList.contains('hidden');
            if (!resultadoVisible) {
                await famexAlert('Ingresa las horas de inicio y fin para calcular el rango.', { tipo: 'warning' });
                return;
            }
            horas = parseFloat(document.getElementById('horasRedondeadas').innerText) || 0;
        }
    }

    const data = {
        id_checador: parseInt(document.getElementById('modalId').value),
        fecha:       document.getElementById('modalFecha').value,
        horas, estatus
    };

    try {
        const res = await apiFetch('/api/actualizar-dia', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) { cerrarModal(); cargarSeguimiento(true); }
    } catch (e) {
        console.error('Error al guardar:', e);
        famexAlert('Hubo un error al guardar los cambios.', { tipo: 'error' });
    }
}

    async function darDeBaja(id, nombre) {
    const okBaja = await famexConfirm(
        `Vas a dar de baja a ${nombre}.\n\nEsto eliminará al prestador y TODOS sus registros del sistema. Esta acción no se puede deshacer.`,
        { titulo: 'Confirmar baja', tipo: 'warning', confirmLabel: 'Sí, dar de baja', peligro: true }
    );
    if (!okBaja) return;
    try {
        const res = await apiFetch(`/api/prestadores/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await famexAlert(`${nombre} fue dado de baja exitosamente.`, { tipo: 'success' });
            cargarSeguimiento(true);
        } else {
            const err = await res.json();
            famexAlert(`Error: ${err.detail}`, { tipo: 'error' });
        }
    } catch (e) {
        famexAlert('Error de conexión al dar de baja.', { tipo: 'error' });
    }
}

async function poblarDepartamentos() {
    try {
        const res = await apiFetch('/api/departamentos');
        const deptos = await res.json();
        const sel = document.getElementById('filtroDepto');
        sel.innerHTML = '<option value="Todos">Todos los departamentos</option>';
        deptos.forEach(d => { sel.innerHTML += `<option value="${d}">${d}</option>`; });
    } catch(e) {}
}
function iniciarVista() { poblarDepartamentos().then(() => cargarSeguimiento(true)); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarVista);
else iniciarVista();
