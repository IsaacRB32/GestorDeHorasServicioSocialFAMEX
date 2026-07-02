# GestorDeHorasServicioSocialFAMEX

Sistema Full‑Stack para centralizar, normalizar y controlar las **asistencias y horas de servicio social** de los prestadores **FAMEX 2026 / 2027**. Reemplaza el flujo manual basado en hojas de cálculo dispersas por una aplicación local con base de datos persistente, ingesta automatizada de reportes de checador, calendario editable, analítica por departamento y generación de hojas de firmas listas para imprimir.

> **Audiencia de esta documentación:** desarrolladores u otras IAs que necesiten entender el 100 % del proyecto sin leer el código fuente. La documentación está distribuida en `docs/` y debe leerse en orden si se desea contexto profundo.

---

## 1. Visión general

| Dimensión | Detalle |
|---|---|
| **Propósito** | Centralizar el control de horas de servicio social de FAMEX 2026/2027 en un único sistema con BD local, auditable y respaldable. |
| **Usuario objetivo** | Administrador/coordinador de servicio social (rol único: `admin`). |
| **Modelo de despliegue** | Aplicación monolítica local — backend FastAPI sirve también el frontend estático. Pensada para correr en una sola máquina del coordinador. |
| **Estado de datos** | Persistente en SQLite (`data/asistencias.db`). Cada sesión arranca aplicando migraciones idempotentes y normalización de departamentos legacy. |
| **Sesión activa** | Periodo FAMEX 2026/2027 (enero 2026 – julio 2026 por defecto), 480 horas obligatorias por prestador. |

Detalle completo de visión, módulos y flujos en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 2. Stack tecnológico

**Backend**
- Python 3.12+
- [FastAPI 0.111](https://fastapi.tiangolo.com/) — API REST + servidor de estáticos
- [Uvicorn 0.29](https://www.uvicorn.org/) — ASGI server
- [Pandas 2.2](https://pandas.pydata.org/) — parsing de Excel (checador y seguimiento histórico)
- [Openpyxl 3.1](https://openpyxl.readthedocs.io/) — engine de lectura `.xlsx` usado por Pandas
- `sqlite3` (stdlib) — driver de base de datos
- `hashlib`, `secrets`, `time` (stdlib) — autenticación SHA‑256 + tokens en memoria

**Base de datos**
- **SQLite local** — archivo plano en `data/asistencias.db`, creado automáticamente al arranque. No requiere servidor.

**Frontend (estático, sin build step, _offline-first_)**
- HTML5 vanilla — 5 páginas independientes (`login`, `index`, `prestadores`, `seguimiento`, `analitica`)
- JavaScript clásico (sin framework, sin bundler) — núcleo compartido `ui/js/famex-ui.js` + un módulo por vista (`app.js`, `prestadores.js`, `seguimiento.js`, `analitica.js`)
- **Todas las librerías se sirven localmente desde `ui/vendor/`** (sin CDNs): Tailwind CSS, jsPDF y jsPDF-AutoTable. El sistema **no realiza ninguna petición a servidores externos** (ver §8.1 _Arquitectura Offline-First_).
- Tailwind CSS (Play CDN, alojado en `ui/vendor/tailwindcss.js`) — utilidad de estilo; la configuración de tema vive en `ui/js/famex-ui.js`
- jsPDF 2.5.1 + jsPDF-AutoTable 3.8.2 (`ui/vendor/`) — generación e **impresión** cliente del PDF semanal (impresión vía iframe oculto, ya no descarga automática)
- Tipografía: **pila 100 % del sistema operativo** (`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …`); sin Google Fonts ni descargas externas de fuentes
- `@media print` nativo — hoja de firmas optimizada para impresión carta vertical

---

## 3. Ejecución local (quick start)

### Requisitos previos
- Python 3.12 o superior
- `pip` disponible en el PATH
- (Opcional) un entorno virtual

### Instalación

```bash
# 1. Clonar e ingresar al proyecto
git clone <repo-url> GestorDeHorasServicioSocialFAMEX
cd GestorDeHorasServicioSocialFAMEX

# 2. Crear y activar entorno virtual (opcional pero recomendado)
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# 3. Instalar dependencias
pip install -r requirements.txt
```

### Arranque del servidor

```bash
# Modo desarrollo (autoreload)
uvicorn main:app --reload --host 127.0.0.1 --port 8000

# Modo producción local
uvicorn main:app --host 0.0.0.0 --port 8000
```

Abrir el navegador en: **http://127.0.0.1:8000** → redirige automáticamente a `/ui/login.html`.

### Credenciales por defecto
| Campo | Valor |
|---|---|
| Usuario | `admin` |
| Contraseña | `famex2026` |

> El hash SHA‑256 de la clave está embebido en `main.py`. Para cambiarla en producción, modificar `ADMIN_CLAVE_HASH`.

### Verificación funcional rápida (smoke test)
1. **Login** → `admin` / `famex2026` debe redirigir a `index.html`.
2. **Panel de Carga** → subir un Excel de checador con hoja `Registros de asistencia` → debe mostrar `¡Reporte cargado con éxito!` y habilitar el botón verde *Imprimir Resumen Semanal*.
3. **Directorio** → debe listar al menos al prestador semilla `ALEXIA BERNAL` (id 1, LOGISTICA).
4. **Expedientes** → seleccionar mes, hacer clic en un día del calendario, marcar `Falta` o `Asistencia con horas` → al cerrar el modal el día debe quedar coloreado.
5. **Analítica Global** → vista de hoja de firmas; `Ctrl + P` debe mostrar layout limpio carta vertical sin sidebar.

Detalle de pruebas por endpoint y flujo en [`docs/API.md`](docs/API.md) y [`docs/FRONTEND.md`](docs/FRONTEND.md).

---

## 4. Estructura del repositorio

```
GestorDeHorasServicioSocialFAMEX/
│
├── main.py                       # Entrypoint FastAPI: lifespan (bootstrap BD), monta routers y /ui
├── requirements.txt              # Dependencias Python pinneadas
├── README.md                     # Este archivo (hub de documentación)
│
├── app/                          # Backend (lógica del servidor)
│   ├── core/
│   │   ├── config.py            # Rutas, credenciales y constantes (override por env)
│   │   └── security.py          # Auth: hashing, token store con lock, require_auth
│   ├── api/
│   │   ├── deps.py              # Dependencias compartidas (get_db, require_auth)
│   │   ├── schemas.py           # Modelos Pydantic de entrada
│   │   └── routers/            # APIRouters: auth, prestadores, registros, seguimiento, analitica
│   ├── database/
│   │   ├── db_config.py          # Conexión (FK+WAL) + get_db/transaccion + DDL + bootstrap
│   │   └── crud.py               # Operaciones CRUD (conexión inyectada, executemany)
│   └── services/
│       ├── procesador_excel.py   # Parser del reporte semanal del checador + redondeo
│       └── migrador_historico.py # Parser del archivo legacy "SS 2026" (multi-mes)
│
├── ui/                           # Frontend estático (servido por FastAPI en /ui)
│   ├── login.html                # Pantalla de autenticación
│   ├── index.html                # Dashboard de carga + migración histórica
│   ├── prestadores.html          # CRUD de prestadores con filtros
│   ├── seguimiento.html          # Calendario mensual editable + calculador manual
│   ├── analitica.html            # Hoja de firmas imprimible
│   ├── js/
│   │   ├── famex-ui.js           # Núcleo: tema Tailwind, apiFetch, redondearHoras, modal "Acerca del Sistema", <famex-sidebar>
│   │   ├── app.js                # Dashboard: upload, tabla de estado y PDF semanal
│   │   ├── prestadores.js        # Lógica de la vista Directorio
│   │   ├── seguimiento.js        # Lógica del calendario de Expedientes
│   │   └── analitica.js          # Lógica de la hoja de firmas
│   ├── vendor/                   # Librerías locales (OFFLINE-FIRST, sin CDNs). Ver §8.1
│   │   ├── tailwindcss.js        # Tailwind CSS (Play CDN alojado localmente)
│   │   ├── jspdf.umd.min.js      # jsPDF 2.5.1
│   │   ├── jspdf.plugin.autotable.min.js  # jsPDF-AutoTable 3.8.2
│   │   ├── descargar_dependencias.py      # Descarga/repuebla el vendor (ejecutar una vez con internet)
│   │   ├── descargar.bat         # Wrapper Windows (doble clic) del descargador
│   │   └── LEEME.md              # Instrucciones del vendor
│   ├── css/style.css             # CSS auxiliar (base, anti-CLS del sidebar, impresión)
│   └── assets/                   # Imágenes (login background)
│
└── data/                         # Generado en runtime (no versionado)
    ├── asistencias.db            # BD SQLite
    └── (sin *.xlsx)              # Carga EFÍMERA: los Excel se procesan en memoria y NO se archivan (ver BUSINESS_LOGIC.md §12)
```

Explicación detallada de cada capa en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 5. Documentación modular (`docs/`)

| Archivo | Contenido |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitectura, separación de capas (`app/` vs `ui/`), patrón de despliegue, decisiones técnicas. |
| [`docs/BUSINESS_LOGIC.md`](docs/BUSINESS_LOGIC.md) | **Reglas de negocio críticas**: algoritmo de redondeo, meta de horas, ingesta Excel (`INSERT OR REPLACE`), autenticación SHA‑256 + tokens en memoria, normalización de departamentos, manejo de saldo inicial histórico. |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Esquema completo de `prestadores`, `registros`, `justificaciones`. Relaciones, índices, migraciones idempotentes (`ALTER TABLE` defensivo). |
| [`docs/API.md`](docs/API.md) | Catálogo de endpoints REST con método, payload, respuesta y ejemplo `curl` por cada uno. |
| [`docs/FRONTEND.md`](docs/FRONTEND.md) | Propósito y flujos de cada página HTML, dependencia con endpoints, comportamiento JS, particularidades del PDF jsPDF y de la impresión `@media print`. |

---

## 6. Reglas de negocio críticas (resumen para contexto inmediato)

> El detalle completo, con código y justificación, está en [`docs/BUSINESS_LOGIC.md`](docs/BUSINESS_LOGIC.md).

- **Redondeo de horas** (`app/services/procesador_excel.py::redondear_horas`):
  - parte decimal `≤ 0.15` → **piso** (`floor`)
  - parte decimal `0.16 – 0.65` → **media hora** (`entero + 0.5`)
  - parte decimal `> 0.65` → **techo** (`entero + 1`)
  - El cliente (`ui/js/app.js::redondearHoras`) replica exactamente el algoritmo para mantener coherencia BD ↔ PDF.
- **Meta de horas**: `480 h` por prestador por defecto (`horas_obligatorias` en `prestadores`).
- **Ingesta Excel idempotente**: todas las inserciones usan `INSERT OR REPLACE` sobre la restricción `UNIQUE(id_checador, fecha)` para permitir re‑subir el mismo reporte sin duplicados ni romper FKs.
- **Autenticación**: SHA‑256 de la contraseña, validación contra hash embebido, generación de token de 64 hex chars (`secrets.token_hex(32)`), **almacenado en memoria** (`_sesiones_activas`) con expiración **8 horas** (28 800 s). Los tokens se pierden al reiniciar el servidor.
- **Estatus de registro** (`registros.estatus`): `Asistencia` (default) · `Falta` · `Justificante` · `Saldo Inicial` (sintético, fecha `2025-12-31`, sólo migración histórica).

---

## 7. Convenciones del proyecto

- **Idioma del código y datos**: español (nombres de columnas, endpoints, mensajes UI).
- **Departamentos canónicos** (sin acentos, mayúsculas): `LOGISTICA`, `OPERACIONES`, `COMERCIAL`, `PUBLICIDAD`, `RELACIONES PUBLICAS`, `ADQUISICIONES`, `General`. La normalización ocurre al iniciar el servidor (`_normalizar_deptos_existentes` en `main.py`) y en cada migración histórica.
- **Fechas**: `YYYY-MM-DD` (ISO‑8601) en BD y API.
- **Sin framework de testing**: validación se hace manualmente vía la UI o `curl` contra los endpoints.
- **Sin variables de entorno**: rutas, credenciales y parámetros están embebidos (es una herramienta interna local).

---

## 8. Novedades recientes (features)

### 8.1. Arquitectura Offline-First (sin dependencias externas)

El sistema está diseñado para distribuirse como un **ejecutable de escritorio (`.exe`)** y operar en entornos **sin conexión a internet o _air-gapped_** (equipos aislados por política de seguridad, casetas de la feria sin WiFi, cortes de red, etc.). Un sistema de control de horas de servicio social debe seguir funcionando aunque la red falle: si la UI dependiera de CDNs, un corte de internet dejaría la interfaz **sin estilos (Tailwind), sin generación de reportes (jsPDF) y sin íconos/fuentes**, inutilizando la herramienta justo cuando se necesita.

Por esa razón se eliminó **toda** dependencia de servidores externos y se adoptó una estrategia _vendor_ local:

- **Librerías locales en `ui/vendor/`**: `tailwindcss.js`, `jspdf.umd.min.js` y `jspdf.plugin.autotable.min.js` se sirven desde el propio backend. Ningún `<script>`/`<link>` apunta ya a `cdn.tailwindcss.com` ni a `cdnjs.cloudflare.com`.
- **Tipografía del sistema**: la pila de fuentes pasó a `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …` (configurada en `famex-ui.js`), eliminando cualquier llamada a Google Fonts. Se renderiza con la fuente nativa del SO, idéntica en Windows/macOS/Linux sin descargas.
- **Limpieza**: se eliminó el archivo huérfano `ui/js/chart.min.js` (no referenciado y que además contenía URLs externas incrustadas).
- **Reaprovisionamiento**: la carpeta trae un descargador (`descargar_dependencias.py` / `descargar.bat`) que, ejecutado **una sola vez en una máquina con internet**, puebla el `vendor/` con espejos de respaldo (cdnjs → jsDelivr → unpkg). Instrucciones en [`ui/vendor/LEEME.md`](ui/vendor/LEEME.md).

**Verificación**: con el WiFi desconectado, la app debe (1) cargar todos los estilos y (2) generar/imprimir el PDF del Dashboard sin errores de red en la consola. Detalle arquitectónico en [`docs/ARCHITECTURE.md §4.7`](docs/ARCHITECTURE.md).

### 8.2. Otras novedades

- **Modal "Acerca del Sistema"**: como el `.exe` no expone el README, el pie del menú lateral abre un modal (en `famex-ui.js`) con la autoría, el carácter de **donación a la FAMEX** y los canales de contacto/soporte.
- **Respaldo y restauración de la BD** (`app/api/routers/backup.py`): `GET /api/backup/exportar` descarga una copia íntegra (`sqlite3 backup()`, WAL-safe) y `POST /api/backup/importar` valida y reemplaza la BD de forma atómica (con copia `.pre_import.bak` y `bootstrap()`). UI en el Dashboard → sección **Mantenimiento / Respaldos**. Detalle en [`docs/API.md`](docs/API.md) y [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- **Horas obligatorias dinámicas**: el progreso, la meta mostrada y el umbral de baja en Expedientes usan `prestadores.horas_obligatorias` (devuelto por `/api/seguimiento-datos`), ya no `480` hard-codeado. Soporta 600 h, etc.
- **Alias de prestadores**: nombre formal limpio con fallback al nombre del checador; se imprime en hoja de firmas y reportes. Ver [`docs/BUSINESS_LOGIC.md §10`](docs/BUSINESS_LOGIC.md).
- **Anomalías del checador** (`requiere_revision`): celdas que no son un par exacto Entrada/Salida se marcan y resaltan en ámbar en Expedientes para corrección manual. Ver [`docs/BUSINESS_LOGIC.md §11`](docs/BUSINESS_LOGIC.md).
- **PDF semanal se imprime** (no se descarga): `generarPDF` usa `doc.autoPrint()` + apertura en pestaña, coherente con la hoja de firmas.
- **UI sin alertas nativas**: todas las notificaciones/confirmaciones usan los modales `window.famexAlert` / `window.famexConfirm` (en `famex-ui.js`), unificados con el diseño FAMEX.
- **Hoja de firmas con acumulado temporal (time-travel)**: `GET /api/registro-firmas?fecha_inicio&fecha_fin` devuelve `horas_semana` (`BETWEEN`) y `horas_acumuladas` (`<= fecha_fin`), y la tabla imprime dos columnas (`Hrs Sem.` / `Acumulado`). Un reporte de una semana pasada muestra el acumulado correcto a esa fecha.
- **Selectores rápidos** de Mes/Año (Expedientes) y de Semana **agrupada por mes** (Analítica): dropdowns Tailwind puros, sin inputs nativos.
- **Carga efímera de Excel**: los `.xlsx` subidos se procesan **en memoria** (`io.BytesIO`) y **no se archivan en disco**; la única fuente de verdad es SQLite. Ver [`docs/BUSINESS_LOGIC.md §12`](docs/BUSINESS_LOGIC.md).

---

## 9. Roadmap / pendientes conocidos

- ~~`app/api/rutas.py` es un router legado no montado~~ ✅ **Resuelto:** endpoints migrados a `app/api/routers/` (`APIRouter`) y stub eliminado.
- ~~Endpoints concentrados en `main.py`~~ ✅ **Resuelto:** `main.py` ahora solo arma la app (lifespan + include_router + estáticos).
- ~~La fecha hard-codeada `2026-05-{dd}` en `procesador_excel.py`~~ ✅ **Resuelto (Paso 4):** el mes/año se detectan dinámicamente del encabezado `Fecha: DD/MM/YYYY ~ ...` del checador (`_detectar_periodo`), con manejo de semanas que cruzan de mes (`_construir_fecha`); degrada a la fecha actual si no se encuentra.
- No hay logs persistentes ni auditoría de cambios en `registros`.
- ~~Tokens de sesión en memoria → cualquier reinicio expulsa a todos~~ ✅ **Resuelto:** sesiones persistidas en `data/sesiones.json` (sobreviven reinicios). La API exige `Bearer` server-side y `apiFetch` lo inyecta.

---

## 10. Créditos y Autoría

Proyecto desarrollado originalmente por **Isaac (IsaacRB32)**.

| | |
|---|---|
| **Desarrollador original** | Isaac — `IsaacRB32` |
| **Repositorio original** | <https://github.com/IsaacRB32/GestorDeHorasServicioSocialFAMEX> |
| **GitHub** | <https://github.com/IsaacRB32> |
| **Instagram** | <https://www.instagram.com/isaac_rb32/> |
| **Contacto / soporte** | isaac.robarron@gmail.com |

> Este código queda **documentado al 100 %** (este `README.md` + la carpeta `docs/`) para
> facilitar su mantenimiento y sus futuras mejoras. Si tienes dudas técnicas, propuestas
> o necesitas soporte, puedes contactar al autor por cualquiera de los medios anteriores.

<p align="center"><sub>FAMEX Control · Gestión de Horas de Servicio Social · Desarrollado por <b>IsaacRB32</b></sub></p>
