let datosGlobales = [];
// Semana activa: lunes de la semana actual
let lunesActivo = obtenerLunesDeHoy();

const DIAS_LABEL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
const DEPTO_BADGE = {
    'LOGISTICA':           'bg-blue-100 text-blue-700 border-blue-200',
    'OPERACIONES':         'bg-emerald-100 text-emerald-700 border-emerald-200',
    'COMERCIAL':           'bg-violet-100 text-violet-700 border-violet-200',
    'PUBLICIDAD':          'bg-amber-100 text-amber-700 border-amber-200',
    'RELACIONES PUBLICAS': 'bg-pink-100 text-pink-700 border-pink-200',
    'ADQUISICIONES':       'bg-cyan-100 text-cyan-700 border-cyan-200',
};

function obtenerLunesDeHoy() {
    const hoy = new Date();
    const dia = hoy.getDay();
    const diff = dia === 0 ? -6 : 1 - dia;
    const lun = new Date(hoy);
    lun.setDate(hoy.getDate() + diff);
    lun.setHours(0,0,0,0);
    return lun;
}

function fechasSemana(lunes) {
    const fechas = [];
    for (let i = 0; i < 5; i++) {
        const d = new Date(lunes);
        d.setDate(lunes.getDate() + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        fechas.push(`${y}-${m}-${dd}`);
    }
    return fechas;
}

function formatFechaCorta(isoStr) {
    const d = new Date(isoStr + 'T12:00:00');
    return `${d.getDate()}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

function formatRangoSemana(lunes) {
    const fs = fechasSemana(lunes);
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const dL = new Date(fs[0] + 'T12:00:00');
    const dV = new Date(fs[4] + 'T12:00:00');
    return `Lun ${dL.getDate()} — Vie ${dV.getDate()} de ${meses[dV.getMonth()]} ${dV.getFullYear()}`;
}

function cambiarSemana(dir) {
    lunesActivo.setDate(lunesActivo.getDate() + dir * 7);
    renderizar();
}

// ===== Selector rápido de SEMANA (input type=week, ISO 8601) =====
function fechaAISOWeek(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7;            // Lun=0 … Dom=6
    date.setUTCDate(date.getUTCDate() - dayNum + 3);      // jueves de esa semana
    const primerJueves = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const semana = 1 + Math.round(((date - primerJueves) / 86400000 - 3 + ((primerJueves.getUTCDay() + 6) % 7)) / 7);
    return `${date.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

function lunesDeSemanaISO(y, w) {
    const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
    const dow = simple.getUTCDay();
    if (dow <= 4) simple.setUTCDate(simple.getUTCDate() - dow + 1);
    else simple.setUTCDate(simple.getUTCDate() + 8 - dow);
    return new Date(simple.getUTCFullYear(), simple.getUTCMonth(), simple.getUTCDate());
}

// ===== Selector de Semana (dropdown Tailwind, sin inputs nativos) =====
const MESES_CORTOS_SEM = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
let _anioSelSem = null;

function semanasDelAnio(y) {
    const total = parseInt(fechaAISOWeek(new Date(y, 11, 28)).split('-W')[1], 10);
    const arr = [];
    for (let w = 1; w <= total; w++) {
        const lun = lunesDeSemanaISO(y, w);
        const vie = new Date(lun); vie.setDate(lun.getDate() + 4);
        arr.push({ w, lun, vie });
    }
    return arr;
}
function toggleSelectorSemana(ev) {
    ev.stopPropagation();
    const pop = document.getElementById('popoverSemana');
    if (!pop.classList.contains('hidden')) { _cerrarSelectorSemana(); return; }
    _anioSelSem = lunesActivo.getFullYear();
    renderPopoverSemana();
    pop.classList.remove('hidden');
    setTimeout(() => document.addEventListener('click', _clicFueraSem), 0);
    const act = pop.querySelector('[data-activa="1"]');
    if (act) act.scrollIntoView({ block: 'center' });
}
function _clicFueraSem(e) {
    const pop = document.getElementById('popoverSemana');
    if (pop && !pop.contains(e.target)) _cerrarSelectorSemana();
}
function _cerrarSelectorSemana() {
    const pop = document.getElementById('popoverSemana');
    if (pop) pop.classList.add('hidden');
    document.removeEventListener('click', _clicFueraSem);
}
function cambiarAnioSelSem(delta) { _anioSelSem += delta; renderPopoverSemana(); }

function renderPopoverSemana() {
    const pop = document.getElementById('popoverSemana');
    const isoActiva = fechaAISOWeek(lunesActivo);
    let lista = '';
    semanasDelAnio(_anioSelSem).forEach(({ w, lun, vie }) => {
        const iso = `${_anioSelSem}-W${String(w).padStart(2, '0')}`;
        const activa = iso === isoActiva;
        const rango = `${lun.getDate()} ${MESES_CORTOS_SEM[lun.getMonth()]} \u2013 ${vie.getDate()} ${MESES_CORTOS_SEM[vie.getMonth()]}`;
        lista += `<button type="button" data-activa="${activa ? 1 : 0}" onclick="saltarASemana(${_anioSelSem}, ${w})" class="w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between gap-3 ${activa ? 'bg-brand-600 text-white shadow' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700'}"><span class="font-bold whitespace-nowrap">Semana ${w}</span><span class="${activa ? 'text-blue-100' : 'text-gray-400'} text-xs whitespace-nowrap">${rango}</span></button>`;
    });
    pop.innerHTML =
        `<div class="flex items-center justify-between mb-2 px-1">
            <button type="button" onclick="cambiarAnioSelSem(-1)" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 font-black text-lg">\u2039</button>
            <span class="font-black text-gray-800 text-base">${_anioSelSem}</span>
            <button type="button" onclick="cambiarAnioSelSem(1)" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 font-black text-lg">\u203a</button>
        </div>
        <div class="max-h-64 overflow-y-auto space-y-1 pr-1">${lista}</div>`;
}

// Salto directo a una semana desde el dropdown.
function saltarASemana(y, w) {
    lunesActivo = lunesDeSemanaISO(y, w);
    _cerrarSelectorSemana();
    renderizar();
}

// redondearHoras() es global (ui/js/famex-ui.js → window.redondearHoras).

function obtenerDiaSemana(prestador, fechaISO) {
    const reg = prestador.registros.find(r => r.fecha === fechaISO);
    if (!reg) return { valor: '—', tipo: 'vacio' };
    if (reg.estatus === 'Falta')        return { valor: 'F', tipo: 'falta' };
    if (reg.estatus === 'Justificante')  return { valor: 'J', tipo: 'justificante' };
    if (reg.horas > 0)                   return { valor: redondearHoras(reg.horas), tipo: 'asistencia' };
    return { valor: '—', tipo: 'vacio' };
}

function contarFaltasSemana(prestador, fechas) {
    return fechas.reduce((n, f) => {
        const d = obtenerDiaSemana(prestador, f);
        return n + (d.tipo === 'falta' ? 1 : 0);
    }, 0);
}

function horasSemana(prestador, fechas) {
    return fechas.reduce((sum, f) => {
        const d = obtenerDiaSemana(prestador, f);
        return sum + (d.tipo === 'asistencia' ? d.valor : 0);
    }, 0);
}

// ============ CARGA ============
async function cargar() {
    try {
        const res = await apiFetch('/api/seguimiento-datos');
        datosGlobales = await res.json();
    } catch(e) { datosGlobales = []; }
    renderizar();
}

// ============ FILTRAR ============
function filtrar() {
    const txt   = document.getElementById('filtroNombre').value.toLowerCase().trim();
    const depto = document.getElementById('filtroDepto').value;
    return datosGlobales.filter(p => {
        const mN = p.nombre.toLowerCase().includes(txt);
        const mD = !depto || depto === 'Todos' || p.departamento === depto;
        return mN && mD;
    });
}

// ============ RENDERIZAR ============
function renderizar() {
    const semana = fechasSemana(lunesActivo);
    document.getElementById('labelSemana').innerText = formatRangoSemana(lunesActivo);

    const datos = filtrar();
    renderCards(datos, semana);
    renderPrint(datos, semana);
}

function celdaDiaClase(tipo) {
    if (tipo === 'asistencia')   return 'bg-green-50 text-green-700 border-green-200';
    if (tipo === 'falta')        return 'bg-red-50 text-red-600 border-red-200';
    if (tipo === 'justificante') return 'bg-amber-50 text-amber-600 border-amber-200';
    return 'bg-gray-50 text-gray-300 border-gray-200';
}

function renderCards(datos, semana) {
    const cont = document.getElementById('contenedorCards');
    const vacio = document.getElementById('sinDatos');

    if (!datos.length) { cont.innerHTML = ''; vacio.classList.remove('hidden'); return; }
    vacio.classList.add('hidden');

    // Agrupar por departamento
    const grupos = {};
    datos.forEach(p => {
        if (!grupos[p.departamento]) grupos[p.departamento] = [];
        grupos[p.departamento].push(p);
    });

    let html = '';
    for (const [depto, prestadores] of Object.entries(grupos)) {
        prestadores.forEach(p => {
            const hs = horasSemana(p, semana);
            const fs = contarFaltasSemana(p, semana);
            const badgeCls = DEPTO_BADGE[depto] || DEPTO_BADGE['General'];

            let diasHtml = '';
            semana.forEach((f, i) => {
                const d = obtenerDiaSemana(p, f);
                const cls = celdaDiaClase(d.tipo);
                const display = d.tipo === 'asistencia' ? `${d.valor}<span class="text-[9px] opacity-60 ml-0.5">h</span>` : d.valor;
                diasHtml += `
                    <div class="flex flex-col items-center">
                        <span class="text-[10px] font-bold text-gray-400 mb-1">${DIAS_LABEL[i]} ${formatFechaCorta(f)}</span>
                        <div class="w-12 h-12 rounded-lg border ${cls} flex items-center justify-center font-black text-sm">${display}</div>
                    </div>`;
            });

            html += `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                <div class="p-4 flex items-center justify-between border-b border-gray-50">
                    <div class="flex items-center gap-3">
                        <span class="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 text-sm font-black text-slate-600 border border-slate-200">${p.id}</span>
                        <div>
                            <h4 class="font-black text-gray-800 text-sm leading-tight">${p.nombre}</h4>
                            <span class="inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${badgeCls}">${depto}</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-xl font-black text-gray-800">${p.horas_totales}<span class="text-xs font-medium text-gray-400 ml-0.5">h</span></div>
                        <span class="text-[10px] font-bold text-gray-400 uppercase">Acumulado</span>
                    </div>
                </div>
                <div class="p-4">
                    <div class="flex justify-between gap-1.5">${diasHtml}</div>
                    <div class="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50">
                        <div class="flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                            <span class="text-[10px] font-bold text-blue-500 uppercase">Semana:</span>
                            <span class="font-black text-blue-700 text-sm">${hs}h</span>
                        </div>
                        ${fs > 0 ? `
                        <div class="flex items-center gap-1.5 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">
                            <span class="text-[10px] font-bold text-red-500 uppercase">Faltas:</span>
                            <span class="font-black text-red-700 text-sm">${fs}</span>
                        </div>` : `
                        <div class="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-lg border border-green-100">
                            <span class="text-[10px] font-bold text-green-600">Asistencia perfecta</span>
                        </div>`}
                    </div>
                </div>
            </div>`;
        });
    }
    cont.innerHTML = html;
}

// ============ TABLA DE IMPRESIÓN ============
function renderPrint(datos, semana) {
    document.getElementById('printRango').innerText = formatRangoSemana(lunesActivo);

    const tbody = document.getElementById('printBody');

    // Agrupar por departamento
    const grupos = {};
    datos.forEach(p => {
        if (!grupos[p.departamento]) grupos[p.departamento] = [];
        grupos[p.departamento].push(p);
    });

    let html = '';
    for (const [depto, prestadores] of Object.entries(grupos)) {
        html += `<tr class="depto-row"><td colspan="10">${depto}</td></tr>`;
        prestadores.forEach(p => {
            const hs = horasSemana(p, semana);
            const faltasSem = contarFaltasSemana(p, semana);
            html += `<tr>
                <td>${p.id}</td>
                <td class="txt-left" style="white-space:nowrap">${p.nombre}</td>`;
            semana.forEach(f => {
                const d = obtenerDiaSemana(p, f);
                let txt = d.valor;
                if (d.tipo === 'asistencia') txt = d.valor;
                else if (d.tipo === 'falta') txt = 'F';
                else if (d.tipo === 'justificante') txt = 'J';
                else txt = '';
                html += `<td>${txt}</td>`;
            });
            html += `<td><b>${p.horas_totales}</b></td>
                     <td>${p.faltas}</td>
                     <td class="firma-col"></td></tr>`;
        });
    }
    tbody.innerHTML = html;
}

// ============ LISTENERS ============
document.getElementById('filtroNombre').addEventListener('input', renderizar);
document.getElementById('filtroDepto').addEventListener('change', renderizar);

async function poblarDepartamentos() {
    try {
        const res = await apiFetch('/api/departamentos');
        const deptos = await res.json();
        const sel = document.getElementById('filtroDepto');
        sel.innerHTML = '<option value="Todos">Todos los departamentos</option>';
        deptos.forEach(d => { sel.innerHTML += `<option value="${d}">${d}</option>`; });
    } catch(e) {}
}
function iniciarVista() { poblarDepartamentos().then(() => cargar()); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarVista);
else iniciarVista();
