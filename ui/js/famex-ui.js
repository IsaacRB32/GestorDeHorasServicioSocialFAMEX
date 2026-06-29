/* ui/js/famex-ui.js
 * Núcleo compartido del frontend FAMEX Control:
 *  1) Configuración central de Tailwind (paleta, sombras, tipografía).
 *  2) Guardia de autenticación (redirige a login si no hay token).
 *  3) apiFetch(): wrapper de fetch que inyecta 'Authorization: Bearer <token>'
 *     y gestiona 401 globalmente.
 *  4) redondearHoras(): única copia cliente del redondeo reglamentario.
 *  5) <famex-sidebar>: Web Component nativo que unifica el menú lateral.
 *
 * Debe cargarse en el <head> INMEDIATAMENTE DESPUÉS del script CDN de Tailwind.
 */
(function () {
  'use strict';

  // ====================================================================
  // 1) CONFIGURACIÓN CENTRAL DE TAILWIND
  // ====================================================================
  if (window.tailwind) {
    window.tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: {
              50:  '#eef4ff', 100: '#dbe6fe', 200: '#bfd3fe', 300: '#93b4fd',
              400: '#608ffa', 500: '#3b6cf6', 600: '#2552eb', 700: '#1d40d8',
              800: '#1e3aaf', 900: '#1e368a',
            },
            ink: { 600: '#334155', 700: '#1e293b', 800: '#0f172a', 900: '#0b1220' },
          },
          fontFamily: {
            sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system',
                   'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
          },
          boxShadow: {
            card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
            'card-hover': '0 10px 25px -5px rgb(15 23 42 / 0.10), 0 8px 10px -6px rgb(15 23 42 / 0.08)',
            sidebar: '6px 0 24px -10px rgb(15 23 42 / 0.55)',
          },
        },
      },
    };
  }

  // ====================================================================
  // 2) GUARDIA DE AUTENTICACIÓN
  // ====================================================================
  var ARCHIVO = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var ES_LOGIN = ARCHIVO === 'login.html' || ARCHIVO === '';

  if (!ES_LOGIN && !localStorage.getItem('famex_token')) {
    location.replace('login.html');
    return;
  }

  // ====================================================================
  // 3) WRAPPER FETCH AUTENTICADO
  // ====================================================================
  async function apiFetch(url, options) {
    options = options || {};
    var headers = new Headers(options.headers || {});
    var token = localStorage.getItem('famex_token');
    if (token) headers.set('Authorization', 'Bearer ' + token);
    options.headers = headers;

    var res;
    try {
      res = await fetch(url, options);
    } catch (e) {
      throw new Error('No se pudo conectar con el servidor');
    }

    var esLoginReq = String(url).indexOf('/api/login') !== -1;
    if (res.status === 401 && !esLoginReq) {
      localStorage.removeItem('famex_token');
      localStorage.removeItem('famex_usuario');
      location.replace('login.html');
      throw new Error('Sesión expirada');
    }
    return res;
  }
  window.apiFetch = apiFetch;

  window.famexLogout = function () {
    localStorage.removeItem('famex_token');
    localStorage.removeItem('famex_usuario');
    location.href = 'login.html';
  };

  // ====================================================================
  // 4) REDONDEO DE HORAS — única copia cliente (réplica de
  //    procesador_excel.py::redondear_horas).
  //      decimal <= 0.15        -> piso
  //      0.15 < decimal <= 0.65 -> media hora
  //      decimal > 0.65         -> techo
  // ====================================================================
  window.redondearHoras = function (horas) {
    var entero = Math.floor(horas);
    var decimal = Math.round((horas - entero) * 100) / 100;
    if (decimal <= 0.15) return entero;
    if (decimal <= 0.65) return entero + 0.5;
    return entero + 1;
  };

  // ====================================================================
  //  PALETA DE DEPARTAMENTOS — núcleo visual compartido. Directorio,
  //  Expedientes y Analítica usan la MISMA identidad cromática.
  // ====================================================================
  window.DEPTO_BADGE = {
    'LOGISTICA':           'bg-blue-100 text-blue-700 border-blue-200',
    'OPERACIONES':         'bg-emerald-100 text-emerald-700 border-emerald-200',
    'COMERCIAL':           'bg-violet-100 text-violet-700 border-violet-200',
    'PUBLICIDAD':          'bg-amber-100 text-amber-700 border-amber-200',
    'RELACIONES PUBLICAS': 'bg-pink-100 text-pink-700 border-pink-200',
    'ADQUISICIONES':       'bg-cyan-100 text-cyan-700 border-cyan-200',
    'General':             'bg-gray-100 text-gray-600 border-gray-200',
  };
  window.badgeDepto = function (depto) {
    var cls = window.DEPTO_BADGE[depto] || window.DEPTO_BADGE['General'];
    return '<span class="inline-block px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider border ' + cls + '">' + depto + '</span>';
  };

  // ====================================================================
  //  MODALES DE NOTIFICACION / CONFIRMACION (reemplazan alert/confirm).
  //  Inyectados una sola vez en el DOM; unificados con el diseno FAMEX.
  //  Uso:  await famexAlert('msg', {tipo:'success'|'error'|'warning'|'info'})
  //        if (await famexConfirm('msg', {peligro:true})) { ... }
  // ====================================================================
  var _ICONOS_MODAL = {
    info:    { bg: 'bg-blue-100',    fg: 'text-blue-600',    d: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z' },
    success: { bg: 'bg-emerald-100', fg: 'text-emerald-600', d: 'M4.5 12.75l6 6 9-13.5' },
    error:   { bg: 'bg-red-100',     fg: 'text-red-600',     d: 'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    warning: { bg: 'bg-amber-100',   fg: 'text-amber-600',   d: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z' },
  };

  function _famexModalEl() {
    var m = document.getElementById('famexModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'famexModal';
    m.className = 'no-print fixed inset-0 z-[100] hidden items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4';
    m.innerHTML =
      '<div class="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[95vw] p-6 text-center">' +
        '<div id="famexModalIcon" class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"></div>' +
        '<h3 id="famexModalTitulo" class="text-lg font-black text-gray-800 mb-1"></h3>' +
        '<p id="famexModalMsg" class="text-sm text-gray-500 mb-6 whitespace-pre-line"></p>' +
        '<div id="famexModalBtns" class="flex justify-center gap-3"></div>' +
      '</div>';
    document.body.appendChild(m);
    return m;
  }

  function _famexMostrar(o) {
    return new Promise(function (resolve) {
      var m = _famexModalEl();
      var it = _ICONOS_MODAL[o.tipo] || _ICONOS_MODAL.info;
      var icon = m.querySelector('#famexModalIcon');
      icon.className = 'w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ' + it.bg;
      icon.innerHTML = '<svg class="w-7 h-7 ' + it.fg + '" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="' + it.d + '"/></svg>';
      m.querySelector('#famexModalTitulo').textContent = o.titulo || (o.confirm ? 'Confirmar' : 'Aviso');
      m.querySelector('#famexModalMsg').textContent = o.mensaje || '';
      var btns = m.querySelector('#famexModalBtns');
      btns.innerHTML = '';
      function cerrar(val) {
        m.classList.add('hidden'); m.classList.remove('flex');
        document.removeEventListener('keydown', onKey);
        resolve(val);
      }
      function onKey(e) {
        if (e.key === 'Escape') cerrar(o.confirm ? false : undefined);
        else if (e.key === 'Enter') cerrar(o.confirm ? true : undefined);
      }
      if (o.confirm) {
        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-bold transition text-sm';
        cancel.textContent = o.cancelLabel || 'Cancelar';
        cancel.onclick = function () { cerrar(false); };
        btns.appendChild(cancel);
      }
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'px-6 py-2.5 text-white rounded-xl font-bold shadow-lg transition text-sm ' +
        (o.peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700');
      ok.textContent = o.confirmLabel || 'Aceptar';
      ok.onclick = function () { cerrar(o.confirm ? true : undefined); };
      btns.appendChild(ok);
      m.classList.remove('hidden'); m.classList.add('flex');
      document.addEventListener('keydown', onKey);
      ok.focus();
    });
  }

  window.famexAlert = function (mensaje, opts) {
    opts = opts || {};
    return _famexMostrar({ mensaje: mensaje, titulo: opts.titulo, tipo: opts.tipo || 'info', confirm: false, confirmLabel: opts.confirmLabel || 'Aceptar' });
  };
  window.famexConfirm = function (mensaje, opts) {
    opts = opts || {};
    return _famexMostrar({ mensaje: mensaje, titulo: opts.titulo || 'Confirmar', tipo: opts.tipo || 'warning', confirm: true, confirmLabel: opts.confirmLabel || 'Confirmar', cancelLabel: opts.cancelLabel, peligro: opts.peligro });
  };

  // ====================================================================
  // 5) WEB COMPONENT <famex-sidebar>
  // ====================================================================
  var ICONOS = {
    carga: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>',
    directorio: '<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>',
    expedientes: '<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>',
    analitica: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/>',
  };

  var NAV = [
    { key: 'carga',       label: 'Panel de Carga',   href: 'index.html' },
    { key: 'directorio',  label: 'Directorio',       href: 'prestadores.html' },
    { key: 'expedientes', label: 'Expedientes',      href: 'seguimiento.html' },
    { key: 'analitica',   label: 'Analítica Global', href: 'analitica.html' },
  ];

  var ACTIVO_POR_ARCHIVO = {
    'index.html': 'carga',
    'prestadores.html': 'directorio',
    'seguimiento.html': 'expedientes',
    'analitica.html': 'analitica',
  };

  function icono(key) {
    return '<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">' + (ICONOS[key] || '') + '</svg>';
  }

  class FamexSidebar extends HTMLElement {
    connectedCallback() {
      var activo = this.getAttribute('active') || ACTIVO_POR_ARCHIVO[ARCHIVO] || '';
      // classList.add (no className=) para NO pisar las clases que el HTML
      // pueda declarar en <famex-sidebar class="...">. Garantiza tamaño y
      // estilo del sidebar de inmediato (sin CLS).
      ['no-print','w-64','flex-shrink-0','flex','flex-col','bg-gradient-to-b',
       'from-ink-800','to-ink-900','text-white','p-5','shadow-sidebar','z-10']
        .forEach(function (c) { this.classList.add(c); }, this);

      var itemsHtml = NAV.map(function (item) {
        var esActivo = item.key === activo;
        var clase = esActivo
          ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
          : 'text-slate-300 hover:bg-white/10 hover:text-white';
        return '<a href="' + item.href + '" ' +
               (esActivo ? 'aria-current="page" ' : '') +
               'class="flex items-center gap-3 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-150 ' + clase + '">' +
               icono(item.key) + '<span>' + item.label + '</span></a>';
      }).join('');

      this.innerHTML =
        '<div class="px-2 mb-8 mt-1">' +
          '<h1 class="text-xl font-black tracking-wider leading-none">FAMEX <span class="text-brand-400">Control</span></h1>' +
          '<p class="text-[11px] text-slate-400 mt-1.5 font-medium">Servicio Social 2026/2027</p>' +
        '</div>' +
        '<nav class="space-y-1.5 flex-1">' + itemsHtml + '</nav>' +
        '<button type="button" onclick="famexLogout()" class="mt-4 w-full py-2.5 px-4 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-red-600/80 transition-all flex items-center gap-3">' +
          '<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/></svg>' +
          '<span>Cerrar Sesión</span>' +
        '</button>';
    }
  }

  if (!customElements.get('famex-sidebar')) {
    customElements.define('famex-sidebar', FamexSidebar);
  }
})();
