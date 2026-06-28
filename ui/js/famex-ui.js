/* ui/js/famex-ui.js
 * Núcleo compartido del frontend FAMEX Control:
 *  1) Configuración central de Tailwind (paleta, sombras, tipografía).
 *  2) Guardia de autenticación (redirige a login si no hay token).
 *  3) apiFetch(): wrapper de fetch que inyecta 'Authorization: Bearer <token>'
 *     y gestiona 401 globalmente.
 *  4) <famex-sidebar>: Web Component nativo que unifica el menú lateral.
 *
 * Debe cargarse en el <head> INMEDIATAMENTE DESPUÉS del script CDN de Tailwind.
 */
(function () {
  'use strict';

  // ========================================================================
  // 1) CONFIGURACIÓN CENTRAL DE TAILWIND
  // ========================================================================
  if (window.tailwind) {
    window.tailwind.config = {
      theme: {
        extend: {
          colors: {
            // Acento de marca (azul corporativo unificado)
            brand: {
              50:  '#eef4ff', 100: '#dbe6fe', 200: '#bfd3fe', 300: '#93b4fd',
              400: '#608ffa', 500: '#3b6cf6', 600: '#2552eb', 700: '#1d40d8',
              800: '#1e3aaf', 900: '#1e368a',
            },
            // Tinta / superficies oscuras (sidebar, headers)
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

  // ========================================================================
  // 2) GUARDIA DE AUTENTICACIÓN
  // ========================================================================
  var ARCHIVO = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var ES_LOGIN = ARCHIVO === 'login.html' || ARCHIVO === '';

  if (!ES_LOGIN && !localStorage.getItem('famex_token')) {
    location.replace('login.html');
    return; // No seguimos inicializando una página a la que no se debe acceder
  }

  // ========================================================================
  // 3) WRAPPER FETCH AUTENTICADO
  // ========================================================================
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

    // 401 global: token inválido/expirado → cerrar sesión (salvo en el login).
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

  // Logout reutilizable (usado por el sidebar)
  window.famexLogout = function () {
    localStorage.removeItem('famex_token');
    localStorage.removeItem('famex_usuario');
    location.href = 'login.html';
  };

  // ========================================================================
  // 4) WEB COMPONENT <famex-sidebar>
  // ========================================================================
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
    { key: 'analitica',   label: 'Analítica Global',  href: 'analitica.html' },
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

      // El host ES el item flex del layout (no se usa Shadow DOM para que
      // las utilidades de Tailwind del CDN apliquen con normalidad).
      this.className = 'no-print w-64 flex-shrink-0 flex flex-col bg-gradient-to-b from-ink-800 to-ink-900 ' +
                       'text-white p-5 shadow-sidebar z-10';

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
        '<button type="button" onclick="famexLogout()" ' +
          'class="mt-4 w-full py-2.5 px-4 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-red-600/80 transition-all flex items-center gap-3">' +
          '<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/></svg>' +
          '<span>Cerrar Sesión</span>' +
        '</button>';
    }
  }

  if (!customElements.get('famex-sidebar')) {
    customElements.define('famex-sidebar', FamexSidebar);
  }
})();
