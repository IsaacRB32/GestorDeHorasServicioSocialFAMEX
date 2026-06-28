# Frontend — Páginas y Flujos

> Cada HTML en `ui/` importa Tailwind por CDN y, justo después, el **núcleo compartido `ui/js/famex-ui.js`**, que centraliza cuatro responsabilidades transversales: (1) la **configuración de tema de Tailwind** (paleta `brand`/`ink`, sombras `card`/`sidebar`, tipografía `Inter`), (2) la **guardia de autenticación** (redirige a `login.html` si no hay `localStorage.famex_token`), (3) el wrapper **`apiFetch()`** que inyecta `Authorization: Bearer <token>` y gestiona los 401 globalmente, y (4) el **Web Component `<famex-sidebar>`**. La lógica interactiva específica de cada vista vive en su propio módulo externo (`app.js`, `prestadores.js`, `seguimiento.js`, `analitica.js`); ya no inline en el HTML. No hay router cliente ni framework: la navegación es por `<a href>`.

---

## 1. Mapa de páginas

| Página | URL | Propósito | Endpoints que consume |
|---|---|---|---|
| `login.html` | `/ui/login.html` | Autenticación admin. | `POST /api/login` |
| `index.html` | `/ui/index.html` | Dashboard de carga: subir reporte semanal y migrar histórico. | `POST /api/upload-reporte`, `POST /api/migrar-historico`, `GET /api/seguimiento-datos` |
| `prestadores.html` | `/ui/prestadores.html` | CRUD de prestadores con filtros. | `GET/POST/PUT/DELETE /api/prestadores*`, `GET /api/departamentos` |
| `seguimiento.html` | `/ui/seguimiento.html` | Expedientes mes a mes con calendario editable y calculadora manual. | `GET /api/seguimiento-datos`, `POST /api/actualizar-dia` |
| `analitica.html` | `/ui/analitica.html` | Hoja de firmas global, optimizada para impresión. | `GET /api/seguimiento-datos`, `GET /api/analitica-general` |

Estructura compartida: todas (menos `login`) renderizan el menú lateral con una sola etiqueta `<famex-sidebar></famex-sidebar>`. El Web Component (definido en `famex-ui.js`) genera el `<aside>` con los enlaces a las 4 páginas, resalta el ítem activo automáticamente según el nombre del archivo (`index.html`→Carga, `prestadores.html`→Directorio, etc.) y expone el botón "Cerrar Sesión" (`famexLogout()`). El host lleva la clase `.no-print`, por lo que el sidebar se oculta al imprimir en cualquier vista. Esto elimina la duplicación previa del bloque `<aside>` en los 4 HTML.

---

## 2. `login.html`

**Rol:** única página pública del sistema. Si ya existe `famex_token` en `localStorage`, redirige inmediatamente a `index.html` (script en `<head>`).

**Flujo:**
1. Usuario llena `usuario` + `clave` y envía el formulario.
2. JS hace `POST /api/login` con JSON.
3. Si 200: `localStorage.setItem('famex_token', resp.token)` + `localStorage.setItem('famex_user', 'admin')` + redirección a `index.html` con animación de "check" verde.
4. Si 401: pinta el mensaje de error sin recargar.

**Detalles visuales:** layout split en 2 columnas (`grid lg:grid-cols-2`). Columna izquierda con formulario y animaciones `fadeSlideUp`. Columna derecha con la imagen `ui/assets/imagen_login_famex2026.jpg` y animación `fadeSlideRight`.

**Cómo probar:**
- Credenciales válidas → `localStorage.famex_token` debe quedar seteado y aparecer la animación.
- Credenciales inválidas → mensaje rojo, sin redirección.
- Refresh con token presente → debería saltarse el login automáticamente.

---

## 3. `index.html` — Dashboard de carga y migración

**Rol:** punto de entrada post‑login. Centraliza los dos flujos de ingesta de datos.

### 3.1. Sección "Cargar Reporte de Asistencia" (azul)

- `<input type="file" id="archivoExcel" accept=".xlsx">`
- Botón `Procesar Archivo` → llama `subirExcel()` (en `app.js`).
- Tras éxito: muestra cantidad de registros procesados, habilita botón verde `Descargar Resumen PDF`, refresca tabla de estado.

### 3.2. Sección "Migrar Datos Históricos" (ámbar)

- `<input type="file" id="archivoHistorico" accept=".xlsx">`
- Botón `Migrar Histórico` → llama `migrarHistorico()` (en `ui/js/app.js`).
- Tras éxito: muestra `✓ N prestadores nuevos · M registros insertados`.

### 3.3. Lógica relevante (`ui/js/app.js`)

| Función | Responsabilidad |
|---|---|
| `cargarTablaEstado()` | `GET /api/seguimiento-datos` y pinta tabla resumen (ID · Nombre · Departamento · Horas Totales). Se ejecuta on `DOMContentLoaded` y tras cada upload. |
| `subirExcel()` | `POST /api/upload-reporte` (multipart). Guarda `tabla_pdf` en `tablaPDFData` para el PDF. |
| `redondearHoras(horas)` | Réplica exacta del algoritmo backend ([`BUSINESS_LOGIC.md §1`](BUSINESS_LOGIC.md#1-redondeo-de-horas)). |
| `generarPDF()` | Construye el PDF semanal con jsPDF + autoTable. Si `tabla_pdf` no está (e.g. refresh), hace fallback a `GET /api/seguimiento-datos`. |

### 3.4. PDF semanal — detalles

- Orientación landscape A4.
- Una columna por día presente en el reporte; cada celda muestra `Real / Rond` (`"4.32 / 4.5h"`).
- Header negro (`fillColor: [15,23,42]`), filas alternas grises, días con horas en verde (`green-50`/`green-100`).
- Última columna: total `Real / Rond` por prestador.
- Nombre del archivo: `resumen_semanal_FAMEX_YYYY-MM-DD.pdf`.

### 3.5. Cómo probar

1. Login y entrar a `/ui/index.html`.
2. Subir un Excel con hoja `Registros de asistencia` → debe aparecer `¡Reporte cargado con éxito! Se guardaron N registros.`
3. La tabla inferior debe poblarse con los prestadores y sus horas totales.
4. Clic en `Descargar Resumen PDF` → descarga `.pdf` con la matriz por día.
5. Subir el mismo archivo otra vez → `procesados` debe ser igual; **no** debe haber duplicados (validar con `SELECT COUNT(*) FROM registros` en SQLite).

---

## 4. `prestadores.html` — Directorio (CRUD)

**Rol:** administración integral del personal. CRUD completo con filtros y modal.

### 4.1. Componentes

- **Header con botón `Agregar Prestador`** → abre modal en modo `crear`.
- **Barra de filtros:** búsqueda por nombre (`#filtroNombre`), departamento (`#filtroDepto`), sexo (`#filtroSexo`), contador total (`#contadorTotal`).
- **Tabla principal:** ID Checador, Nombre, Departamento, Sexo, Meta (hrs), Acciones (editar/borrar).
- **Modal Crear/Editar** (`#modalCrear`) con campos: `id_checador` (deshabilitado en edición), `nombre`, `departamento` (`<select>`), `sexo`, `fecha_inicio`, `fecha_termino`, `horas_obligatorias`.

### 4.2. Lógica (`ui/js/prestadores.js`)

| Función | Endpoint | Notas |
|---|---|---|
| `cargarPrestadores()` | `GET /api/prestadores-lista` | Carga inicial + tras CRUD. |
| `aplicarFiltros()` | — (cliente) | Filtra el array en memoria por los 3 criterios. |
| `abrirModal(modo, prestador)` | — | `modo = 'crear' | 'editar'`. |
| `guardarPrestador()` | `POST` o `PUT /api/prestadores[/{id}]` | Detecta modo del modal. |
| `eliminarPrestador(id)` | `DELETE /api/prestadores/{id}` | Con `confirm()` previo. |

### 4.3. Cómo probar

1. Crear prestador con ID nuevo → debe aparecer en la tabla.
2. Repetir el mismo ID → debe mostrar error 409.
3. Filtrar por departamento → tabla debe restringirse client‑side.
4. Editar y cambiar meta de 480 a 240 → recargar y verificar persistencia.
5. Eliminar → confirm, luego registro desaparece de la tabla. Verificar también que `registros` asociados fueron borrados (`SELECT * FROM registros WHERE id_checador = X`).

---

## 5. `seguimiento.html` — Expedientes (calendario interactivo)

**Rol:** vista mes a mes de cada prestador. Permite editar día a día y agrupa por departamento.

### 5.1. Estructura visual

- **Selector de mes** (`<` Mayo 2026 `>`) con `cambiarMes(±1)`.
- **Filtros:** búsqueda por nombre (`#buscarNombre`), departamento (`#filtroDepto`).
- **Tarjetas (`#contenedorTarjetas`):** una por prestador, con grid de calendario del mes seleccionado. Cada celda del calendario está coloreada según `estatus`:
  - `Asistencia` → tonos verdes (intensidad según horas).
  - `Falta` → rojo.
  - `Justificante` → amarillo/ámbar.
  - Sin registro → gris claro.

### 5.2. Modal de edición de día

Al hacer clic en una celda del calendario se abre `#modalEdicion`. Tabs:

- **`✗ Falta`** → `horas = 0`, `estatus = "Falta"`.
- **`✓ Justificante`** → `horas = 0`, `estatus = "Justificante"`.
- **`✓ Asistencia`** → input numérico para horas (calculadora manual con botones rápidos `+0.5`, `+1`, `+2`).

Al confirmar: `POST /api/actualizar-dia` con el body correspondiente. Luego se cierra modal y se re-renderiza la tarjeta.

### 5.3. Datos consumidos

`GET /api/seguimiento-datos` se llama una vez al cargar la página y se cachea client‑side. Tras cada `POST /api/actualizar-dia` se refresca solo la tarjeta afectada (no toda la página).

### 5.4. Cómo probar

1. Cargar la página → debe listar al menos un prestador con calendario de mayo 2026.
2. Click en un día sin registro → modal abre con `Asistencia` por defecto.
3. Marcar `Falta` y confirmar → la celda debe quedar roja al cerrar el modal.
4. Recargar la página → la marca debe persistir.
5. Cambiar el mes con las flechas → debe re-pintar el calendario para el nuevo mes.

---

## 6. `analitica.html` — Hoja de firmas imprimible

**Rol:** generar la hoja de firmas oficial. Optimizada para **impresión carta vertical**.

### 6.1. Vista en pantalla

Muestra una tabla con todos los prestadores y sus datos del periodo: nombre, departamento, horas acumuladas, días asistidos, faltas, justificantes, **firma** (columna vacía para llenar a mano).

### 6.2. Comportamiento `@media print`

El CSS `@media print` en el `<head>` activa una vista limpia al imprimir:

- `@page { size: letter portrait; margin: 10mm 10mm; }` → tamaño y márgenes oficiales.
- `.no-print { display: none !important; }` → oculta sidebar, filtros, botones.
- `.print-only { display: block !important; }` → muestra `#printHeader` (título y fecha) y `#printTable` (tabla formateada).
- Bordes negros, sin colores agresivos, fuente `Arial 7pt` para caber 30+ filas por hoja.
- `tr { page-break-inside: avoid; }` → evita cortar filas entre páginas.
- `print-color-adjust: exact` → fuerza renderizado de colores en navegadores que omiten backgrounds en print.

### 6.3. Cómo probar

1. Cargar la página → debe verse la hoja de firmas con sidebar y filtros normales.
2. `Ctrl + P` (o `Cmd + P`) → preview de impresión debe mostrar **solo** el título + tabla, sin sidebar.
3. La tabla debe caber a lo ancho (carta vertical) y dividirse limpiamente en páginas múltiples si supera 1 hoja.
4. Guardar como PDF desde el diálogo de impresión → archivo final debe ser una hoja de firmas profesional.

---

## 7. Compartido: `ui/js/app.js`

Único JS compartido (cargado por `index.html`). Sus 4 funciones (`cargarTablaEstado`, `subirExcel`, `redondearHoras`, `generarPDF`) están documentadas en §3.3 y §3.4.

> **Nota (Paso 4):** la lógica de cada vista vive ahora en su propio módulo externo (`ui/js/prestadores.js`, `ui/js/seguimiento.js`, `ui/js/analitica.js`), ya no inline en el HTML. Todas comparten `famex-ui.js` (tema, `apiFetch`, `redondearHoras`, `<famex-sidebar>`); solo el dashboard usa además `app.js`. La función `redondearHoras` tiene una **única** copia cliente (`window.redondearHoras`), eliminando las 3 duplicaciones previas.

---

## 8. Núcleo compartido `ui/js/famex-ui.js`

Módulo IIFE cargado en el `<head>` de las 5 vistas, inmediatamente después del CDN de Tailwind (debe ir después para que `window.tailwind` exista al fijar la config).

| Bloque | Qué hace |
|---|---|
| **Config Tailwind** | Define `tailwind.config.theme.extend`: colores `brand` (azul corporativo) e `ink` (superficies oscuras), `fontFamily.sans` = Inter, y sombras `card`, `card-hover`, `sidebar`. Unifica paleta/sombras/espaciados en todas las vistas. |
| **Guardia de auth** | Si la página no es `login.html` y no hay `localStorage.famex_token`, hace `location.replace('login.html')` antes de inicializar nada más. |
| **`apiFetch(url, options)`** | Wrapper de `fetch` que añade el header `Authorization: Bearer <token>`. Ante un `401` (salvo en `/api/login`) limpia el token y redirige al login. Usa `Headers` para no romper subidas `multipart`. Expuesto como `window.apiFetch`. |
| **`famexLogout()`** | Limpia las llaves de sesión y vuelve a `login.html`. Lo invoca el botón del sidebar. |
| **`<famex-sidebar>`** | Custom Element (light DOM, para que apliquen las utilidades del CDN) que renderiza el menú lateral con ítem activo automático. |

> **Seguridad engranada:** como `apiFetch` envía el `Bearer`, los routers `prestadores`, `registros`, `seguimiento` y `analitica` ya exigen token server‑side (`dependencies=[Depends(require_auth)]`). El router `auth` permanece público. Ver [`API.md`](API.md) y [`BUSINESS_LOGIC.md §5`](BUSINESS_LOGIC.md#5-autenticación).

### Pendientes
- Migrar a Vite + Vue/React si el sistema crece a múltiples coordinadores — el modelo actual no escala a más de 1 admin.
- Persistir las sesiones (hoy en memoria del servidor): un reinicio invalida los tokens.
