# Arquitectura del Sistema

> Este documento describe la arquitectura técnica, la separación de capas, las decisiones de diseño y el flujo de datos del sistema FAMEX Control. Para reglas de negocio ver [`BUSINESS_LOGIC.md`](BUSINESS_LOGIC.md); para esquema de BD ver [`DATABASE.md`](DATABASE.md).

---

## 1. Modelo de despliegue

El sistema es una **aplicación monolítica local** que corre como un único proceso Python. El servidor FastAPI cumple dos roles simultáneos:

1. **API REST** bajo el prefijo `/api/*`.
2. **Servidor de estáticos** bajo el prefijo `/ui/*`, sirviendo directamente el directorio `ui/`.

No hay separación física entre cliente y servidor, ni proxy reverso, ni CDN: todo se sirve desde el mismo `uvicorn` en el mismo host.

```
┌──────────────────────────────────────────────────────┐
│                  Navegador (cliente)                 │
│   login.html · index.html · prestadores.html · …     │
│   Tailwind CDN · jsPDF CDN · ui/js/app.js            │
└────────────────────────┬─────────────────────────────┘
                         │ HTTP (puerto 8000)
                         ▼
┌──────────────────────────────────────────────────────┐
│            FastAPI + Uvicorn (main.py)               │
│   ┌─────────────────┐    ┌─────────────────────────┐ │
│   │  Endpoints API  │    │  StaticFiles("/ui")      │ │
│   │   /api/*        │    │  (sirve HTML/JS/CSS)     │ │
│   └────────┬────────┘    └─────────────────────────┘ │
│            │                                         │
│   ┌────────▼─────────────────────────┐               │
│   │  app/services/  (parsing Excel)  │               │
│   │  app/database/  (CRUD + DDL)     │               │
│   └────────┬─────────────────────────┘               │
└────────────┼─────────────────────────────────────────┘
             ▼
    ┌────────────────────┐
    │  data/asistencias.db │   ← SQLite (archivo plano)
    │  data/sesiones.json   │   ← sesiones persistidas (auth)
    └────────────────────┘
```

---

## 2. Separación de capas

### 2.1. `/app` — Backend

```
app/
├── core/
│   ├── config.py             # Rutas, credenciales y constantes (override por env)
│   └── security.py           # Auth: hashing, token store con lock, require_auth
├── api/
│   ├── deps.py               # Dependencias compartidas (get_db, require_auth)
│   ├── schemas.py            # Modelos Pydantic (LoginInput, PrestadorInput, EdicionDia)
│   └── routers/
│       ├── auth.py           # /login, /verificar-sesion
│       ├── prestadores.py    # CRUD prestadores + /departamentos
│       ├── registros.py      # /upload-reporte, /migrar-historico, /actualizar-dia
│       ├── seguimiento.py    # /dashboard/{id}, /seguimiento-datos, /registro-firmas
│       ├── analitica.py      # /analitica-general
│       └── backup.py        # /backup/exportar, /backup/importar (respaldo BD)
├── database/
│   ├── db_config.py          # Conexión (FK+WAL) + get_db/transaccion + DDL + bootstrap
│   └── crud.py               # Operaciones de persistencia (conexión inyectada)
└── services/
    ├── procesador_excel.py   # Parser checador semanal + redondeo
    └── migrador_historico.py # Parser hoja legacy multi-mes "SS 2026"
```

**Responsabilidades por módulo:**

| Módulo | Rol | Funciones clave |
|---|---|---|
| `db_config.py` | Bootstrap de SQLite. Crea tablas si no existen, aplica `ALTER TABLE` defensivo para columnas nuevas, crea índices. Expone `obtener_conexion()` con `row_factory = sqlite3.Row`. | `inicializar_bd()`, `obtener_conexion()` |
| `crud.py` | Operaciones puras sobre la BD (conexión inyectada). **No** valida reglas de negocio (eso vive en `services/` y en los routers de `app/api/routers/`). | `registrar_prestador`, `actualizar_prestador`, `guardar_registros_diarios`, `guardar_registros_historicos`, `obtener_datos_seguimiento`, `obtener_registro_semanal`, `eliminar_prestador`, `actualizar_estatus_dia` |
| `procesador_excel.py` | Parsea un `.xlsx` con hoja `Registros de asistencia` (formato checador semanal). Retorna `{prestadores, registros}` con horas exactas + redondeadas. | `redondear_horas`, `procesar_reporte_asistencia` |
| `migrador_historico.py` | Parsea el archivo legacy `SS 2026` (una fila por prestador/mes, columnas = días del mes). Normaliza departamentos y produce registros con `estatus` explícito (`Asistencia` / `Falta` / `Justificante` / `Saldo Inicial`). | `normalizar_departamento`, `procesar_seguimiento_historico` |

### 2.2. `/ui` — Frontend estático

```
ui/
├── login.html         # Auth (no requiere token)
├── index.html         # Dashboard: upload + migración histórica
├── prestadores.html   # CRUD prestadores con filtros
├── seguimiento.html   # Calendario mensual editable + calculadora manual
├── analitica.html     # Hoja de firmas optimizada para impresión
├── js/
│   ├── famex-ui.js    # NÚCLEO compartido: config Tailwind, apiFetch, guardia auth,
│   │                  #   redondearHoras, badgeDepto, modales famexAlert/Confirm,
│   │                  #   footer de créditos y Web Component <famex-sidebar>
│   ├── app.js         # Dashboard: upload, tabla de estado, PDF semanal, respaldos
│   ├── prestadores.js # Vista Directorio (CRUD + alias)
│   ├── seguimiento.js # Vista Expedientes (calendario + selector mes/año)
│   ├── analitica.js   # Hoja de firmas (semana + acumulado + selector de semana)
│   └── chart.min.js   # Chart.js offline (dependencia opcional)
├── css/style.css      # CSS base + reserva de layout del sidebar (anti-CLS) + print
└── assets/            # Imágenes
```

Cada HTML importa Tailwind por CDN y, justo después, el **núcleo compartido `ui/js/famex-ui.js`** (tema, `apiFetch` con `Bearer`, guardia de auth, `redondearHoras`, modales, `<famex-sidebar>` y footer de créditos). La lógica específica de cada vista vive en su **módulo externo** propio (`app.js`, `prestadores.js`, `seguimiento.js`, `analitica.js`) — ya no hay scripts inline. El menú lateral se renderiza con una sola etiqueta `<famex-sidebar>`.

Detalle de cada página y sus flujos en [`FRONTEND.md`](FRONTEND.md).

---

## 3. Flujo de datos end‑to‑end

### 3.1. Carga de reporte semanal (caso de uso principal)

```
Usuario sube reporte.xlsx
        │
        ▼
ui/index.html → subirExcel()  [POST /api/upload-reporte, multipart]
        │
        ▼
routers/registros.py::upload_reporte
   1. lee el .xlsx ENTERO en memoria (io.BytesIO) — NO se escribe a disco
   2. procesador_excel.procesar_reporte_asistencia(buffer)
        → {prestadores: [...], registros: [...]}
   3. por cada prestador → crud.registrar_prestador (INSERT, ignora si existe)
   4. crud.guardar_registros_diarios(registros)
        → INSERT OR REPLACE sobre UNIQUE(id_checador, fecha)
   5. construye tabla_pdf agrupada por prestador
        │
        ▼
respuesta {mensaje, procesados, tabla_pdf}
        │
        ▼
ui/js/app.js → guarda tablaPDFData, muestra botón "Imprimir Resumen Semanal",
                refresca tabla de estado vía GET /api/seguimiento-datos
```

### 3.2. Edición de un día desde el calendario

```
ui/seguimiento.html (calendario) → click en día
        │
        ▼
modalEdicion → seleccionarTab(Asistencia|Falta|Justificante)
        │
        ▼
POST /api/actualizar-dia  body: {id_checador, fecha, horas, estatus}
        │
        ▼
main.py::actualizar_dia → crud.actualizar_estatus_dia
        → INSERT OR REPLACE en registros
        │
        ▼
modal cierra, calendario re-renderiza con color del nuevo estatus
```

### 3.3. Migración de archivo histórico

```
ui/index.html → migrarHistorico()  [POST /api/migrar-historico]
        │
        ▼
routers/registros.py::migrar_historico
   1. lee el .xlsx en memoria (io.BytesIO) — NO se escribe a disco
   2. migrador_historico.procesar_seguimiento_historico(buffer)
        → recorre fila por fila, mapea columnas día por día,
          distingue Asistencia / Falta (X/N) / Justificante (J/P) / Saldo Inicial
   3. por cada prestador → crud.registrar_prestador
   4. crud.guardar_registros_historicos → INSERT OR REPLACE con estatus
        │
        ▼
respuesta {prestadores_nuevos, registros_insertados}
```

---

## 4. Decisiones técnicas relevantes

### 4.1. SQLite como BD
**Por qué:** la aplicación corre en una sola máquina, no hay concurrencia significativa (un coordinador), y el respaldo es trivial (copiar `data/asistencias.db`). No requiere instalar ni administrar un servidor.

### 4.2. Frontend sin framework ni bundler
**Por qué:** simplifica el despliegue (no hay paso de build), permite editar HTML directamente, y reduce la curva de aprendizaje para el coordinador si tiene que tocar la UI. Tailwind y jsPDF se cargan por CDN — el sistema *requiere internet* para usar la UI completa.

### 4.3. Autenticación en memoria
**Por qué:** los tokens se almacenan en `_sesiones_activas: dict` dentro del proceso. Adecuado para un despliegue mono‑usuario local. **Trade‑off:** al reiniciar el servidor todos los tokens se invalidan y el usuario debe re‑loguearse. Ver detalle en [`BUSINESS_LOGIC.md`](BUSINESS_LOGIC.md#5-autenticación).

### 4.4. Endpoints modulares con `APIRouter`
Los endpoints están organizados en `app/api/routers/` (`auth`, `prestadores`, `registros`, `seguimiento`, `analitica`), cada uno un `APIRouter` propio. `main.py` los monta con `app.include_router(..., prefix="/api")`. Los handlers son delgados: validan con los modelos de `app/api/schemas.py`, obtienen la conexión vía `Depends(get_db)` y delegan toda la lógica de datos en `app/database/crud.py`. El antiguo stub `app/api/rutas.py` fue **eliminado**.

### 4.5. Inicialización vía `lifespan`
El bootstrap de la BD ya **no** corre a nivel de import. `main.py` define un `lifespan` asíncrono que ejecuta `db_config.bootstrap()` una sola vez al arrancar el servidor, encadenando:
1. `inicializar_bd()` → crea/migra tablas e índices.
2. `asegurar_datos_semilla()` → garantiza el prestador semilla (`INSERT OR IGNORE`).
3. `normalizar_departamentos_existentes()` → normaliza variantes legacy de departamento.

**Implicación:** cada `uvicorn --reload` reejecuta el pipeline; todas las operaciones son idempotentes y seguras.

### 4.6. Replicación cliente/servidor del algoritmo de redondeo
La función `redondear_horas` existe **dos veces**: una en `procesador_excel.py` (Python) y otra en `ui/js/app.js` (JS). Ambas implementan exactamente el mismo algoritmo. La duplicación es deliberada: permite que el PDF muestre el redondeo coherente con la BD sin requerir una llamada extra al servidor.

> **Cuidado:** si se modifica el algoritmo en uno de los dos lados, **debe** actualizarse en el otro. Ver [`BUSINESS_LOGIC.md`](BUSINESS_LOGIC.md#1-redondeo-de-horas).

---

## 5. Endpoints — quick map

| Método | Ruta | Router · Handler |
|---|---|---|
| GET | `/` | `main.py::redirigir_login` → 307 a `/ui/login.html` |
| GET | `/ui/*` | `main.py` StaticFiles |
| POST | `/api/login` | `routers/auth.py::login` |
| POST | `/api/verificar-sesion` | `routers/auth.py::verificar_sesion` |
| POST | `/api/upload-reporte` | `routers/registros.py::upload_reporte` |
| POST | `/api/migrar-historico` | `routers/registros.py::migrar_historico` |
| POST | `/api/actualizar-dia` | `routers/registros.py::actualizar_dia` |
| GET | `/api/dashboard/{id}` | `routers/seguimiento.py::dashboard` |
| GET | `/api/seguimiento-datos` | `routers/seguimiento.py::seguimiento_datos` |
| GET | `/api/registro-firmas` | `routers/seguimiento.py::registro_firmas` (semana + acumulado) |
| GET | `/api/analitica-general` | `routers/analitica.py::analitica` |
| GET | `/api/prestadores-lista` | `routers/prestadores.py::listar` |
| POST | `/api/prestadores` | `routers/prestadores.py::crear` |
| PUT | `/api/prestadores/{id}` | `routers/prestadores.py::actualizar` |
| DELETE | `/api/prestadores/{id}` | `routers/prestadores.py::eliminar` |
| GET | `/api/departamentos` | `routers/prestadores.py::departamentos` |
| GET | `/api/backup/exportar` | `routers/backup.py::exportar` |
| POST | `/api/backup/importar` | `routers/backup.py::importar` |

Especificación detallada (payload, respuesta, ejemplos `curl`) en [`API.md`](API.md).
