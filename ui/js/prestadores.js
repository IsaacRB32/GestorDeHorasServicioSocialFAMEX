let listaPrestadores = [];
let modoEdicion = false;

const DEPTO_BADGE = {
    'LOGISTICA':          'bg-blue-100 text-blue-700 border-blue-200',
    'OPERACIONES':        'bg-emerald-100 text-emerald-700 border-emerald-200',
    'COMERCIAL':          'bg-violet-100 text-violet-700 border-violet-200',
    'PUBLICIDAD':         'bg-amber-100 text-amber-700 border-amber-200',
    'RELACIONES PUBLICAS':'bg-pink-100 text-pink-700 border-pink-200',
    'ADQUISICIONES':      'bg-cyan-100 text-cyan-700 border-cyan-200',
    'General':            'bg-gray-100 text-gray-600 border-gray-200'
};

function badgeDepto(depto) {
    const cls = DEPTO_BADGE[depto] || DEPTO_BADGE['General'];
    return `<span class="inline-block px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider border ${cls}">${depto}</span>`;
}

// ============ CARGA Y RENDERIZADO ============
async function cargarDirectorio() {
    try {
        const res = await apiFetch('/api/prestadores-lista');
        listaPrestadores = await res.json();
    } catch (e) {
        console.error('Error cargando directorio:', e);
        listaPrestadores = [];
    }
    aplicarFiltros();
}

function aplicarFiltros() {
    const txt   = document.getElementById('filtroNombre').value.toLowerCase().trim();
    const depto = document.getElementById('filtroDepto').value;

    const sexo = document.getElementById('filtroSexo').value;

    const filtrados = listaPrestadores.filter(p => {
        const matchN = p.nombre.toLowerCase().includes(txt);
        const matchD = depto === 'Todos' || p.departamento === depto;
        const matchS = sexo === 'Todos' || p.sexo === sexo;
        return matchN && matchD && matchS;
    });

    document.getElementById('contadorTotal').innerText = listaPrestadores.length;
    renderTabla(filtrados);
}

function renderTabla(datos) {
    const tbody = document.getElementById('tbodyPrestadores');
    const vacio = document.getElementById('sinResultados');

    if (datos.length === 0) {
        tbody.innerHTML = '';
        vacio.classList.remove('hidden');
        return;
    }
    vacio.classList.add('hidden');

    tbody.innerHTML = datos.map(p => `
        <tr class="hover:bg-blue-50/40 transition-colors group">
            <td class="py-3.5 px-6">
                <span class="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 text-sm font-black text-slate-600 border border-slate-200 group-hover:bg-blue-100 group-hover:text-blue-700 transition">${p.id}</span>
            </td>
            <td class="py-3.5 px-6 font-bold text-gray-800">${p.nombre}</td>
            <td class="py-3.5 px-6">${badgeDepto(p.departamento)}</td>
            <td class="py-3.5 px-6 text-center text-sm">
                ${p.sexo
                    ? `<span class="${p.sexo === 'Masculino'
                        ? 'text-blue-600' : 'text-pink-600'} font-bold">${p.sexo === 'Masculino'
                        ? 'M' : 'F'}</span>`
                    : '<span class="text-gray-300">—</span>'}
            </td>
            <td class="py-3.5 px-6 text-center font-bold text-gray-600">${p.horas_obligatorias}</td>
            <td class="py-3.5 px-6">
                <div class="flex items-center justify-center gap-2">
                    <button onclick="abrirEdicion(${p.id})"
                        title="Editar"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>
                        Editar
                    </button>
                    <button onclick="abrirModalEliminar(${p.id}, '${p.nombre.replace(/'/g,"\\'")}')"
                        title="Dar de baja"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
                        Baja
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

document.getElementById('filtroNombre').addEventListener('input', aplicarFiltros);
document.getElementById('filtroDepto').addEventListener('change', aplicarFiltros);
document.getElementById('filtroSexo').addEventListener('change', aplicarFiltros);

// ============ MODAL CREAR / EDITAR ============
function abrirEdicion(id) {
    const p = listaPrestadores.find(x => x.id === id);
    if (!p) return;
    abrirModal('editar', p);
}

function abrirModal(modo, datos) {
    modoEdicion = modo === 'editar';
    const modal = document.getElementById('modalPrestador');
    modal.classList.remove('hidden');
    document.getElementById('modalError').classList.add('hidden');

    if (modoEdicion && datos) {
        document.getElementById('modalTitulo').innerText = 'Editar Prestador';
        document.getElementById('btnGuardar').innerText  = 'Actualizar';
        document.getElementById('inputId').value      = datos.id;
        document.getElementById('inputId').disabled    = true;
        document.getElementById('inputId').classList.add('opacity-50', 'cursor-not-allowed');
        document.getElementById('ayudaId').innerText   = 'El ID no se puede modificar';
        document.getElementById('inputNombre').value   = datos.nombre;
        document.getElementById('inputSexo').value     = datos.sexo || '';
        document.getElementById('inputDepto').value    = datos.departamento;
        document.getElementById('inputFInicio').value  = datos.fecha_inicio;
        document.getElementById('inputFTermino').value = datos.fecha_termino;
        document.getElementById('inputMeta').value     = datos.horas_obligatorias;
    } else {
        document.getElementById('modalTitulo').innerText = 'Nuevo Prestador';
        document.getElementById('btnGuardar').innerText  = 'Guardar';
        document.getElementById('inputId').value    = '';
        document.getElementById('inputId').disabled = false;
        document.getElementById('inputId').classList.remove('opacity-50', 'cursor-not-allowed');
        document.getElementById('ayudaId').innerText     = 'Número único del reloj checador físico';
        document.getElementById('inputNombre').value     = '';
        document.getElementById('inputSexo').value       = '';
        document.getElementById('inputDepto').value      = '';
        document.getElementById('inputFInicio').value    = '2026-01-01';
        document.getElementById('inputFTermino').value   = '2026-07-01';
        document.getElementById('inputMeta').value       = 480;
    }
}

function cerrarModal() {
    document.getElementById('modalPrestador').classList.add('hidden');
}

function mostrarError(msg) {
    const el = document.getElementById('modalError');
    el.innerText = msg;
    el.classList.remove('hidden');
}

async function guardarPrestador() {
    const id     = parseInt(document.getElementById('inputId').value);
    const nombre = document.getElementById('inputNombre').value.trim().toUpperCase();
    const depto  = document.getElementById('inputDepto').value;
    const sexo   = document.getElementById('inputSexo').value;
    const fIni   = document.getElementById('inputFInicio').value;
    const fFin   = document.getElementById('inputFTermino').value;
    const meta   = parseInt(document.getElementById('inputMeta').value) || 480;

    if (!id || id <= 0)  { mostrarError('Ingresa un ID Checador válido'); return; }
    if (!nombre)         { mostrarError('Ingresa el nombre completo'); return; }
    if (!sexo)           { mostrarError('Selecciona el sexo'); return; }
    if (!depto)          { mostrarError('Selecciona un departamento'); return; }

    const payload = {
        id_checador: id,
        nombre: nombre,
        departamento: depto,
        sexo: sexo,
        fecha_inicio: fIni,
        fecha_termino: fFin,
        horas_obligatorias: meta
    };

    try {
        let res;
        if (modoEdicion) {
            res = await apiFetch(`/api/prestadores/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await apiFetch('/api/prestadores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            mostrarError(err.detail || `Error del servidor (${res.status})`);
            return;
        }

        cerrarModal();
        cargarDirectorio();
    } catch (e) {
        mostrarError('Error de conexión con el servidor');
    }
}

// ============ MODAL ELIMINAR ============
function abrirModalEliminar(id, nombre) {
    document.getElementById('elimId').value = id;
    document.getElementById('elimNombre').innerText = nombre;
    document.getElementById('modalEliminar').classList.remove('hidden');
}

function cerrarModalEliminar() {
    document.getElementById('modalEliminar').classList.add('hidden');
}

async function confirmarEliminacion() {
    const id = document.getElementById('elimId').value;
    try {
        const res = await apiFetch(`/api/prestadores/${id}`, { method: 'DELETE' });
        if (res.ok) {
            cerrarModalEliminar();
            cargarDirectorio();
        } else {
            const err = await res.json().catch(() => ({}));
            alert(err.detail || 'Error al eliminar');
        }
    } catch (e) {
        alert('Error de conexión');
    }
}

// ============ POBLAR DROPDOWNS DINÁMICOS ============
async function poblarDepartamentos() {
    try {
        const res = await apiFetch('/api/departamentos');
        const deptos = await res.json();
        // Filtro principal
        const sel = document.getElementById('filtroDepto');
        sel.innerHTML = '<option value="Todos">Todos los departamentos</option>';
        deptos.forEach(d => { sel.innerHTML += `<option value="${d}">${d}</option>`; });
        // Select del modal
        const selModal = document.getElementById('inputDepto');
        const primera = '<option value="">— Seleccionar —</option>';
        selModal.innerHTML = primera;
        deptos.forEach(d => { selModal.innerHTML += `<option value="${d}">${d}</option>`; });
    } catch(e) { console.error('Error cargando departamentos:', e); }
}

// ============ INIT ============
poblarDepartamentos().then(() => cargarDirectorio());
