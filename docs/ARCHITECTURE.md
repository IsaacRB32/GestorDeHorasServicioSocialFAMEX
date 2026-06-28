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
    │  data/*.xlsx         │   ← Excels subidos
    └────────────────────┘
```

---

## 2. Separación de capas

### 2.1. `/app` — Backend

```
app/
├── api/
│   └── rutas.py              # ⚠ STUB legado, NO se monta. Ver §5.
├── database/
│   ├── db_config.py          # Conexión + DDL + migraciones idempotentes
│   └── crud.py               # Operaciones de persistencia
└── services/
    ├── procesador_excel.py   # Parser checador semanal + redondeo
    └── migrador_historico.py # Parser hoja legacy multi-mes "SS 2026"
```

**Responsabilidades por módulo:**

| Módulo | Rol | Funciones clave |
|---|---|---|
| `db_config.py` | Bootstrap de SQLite. Crea tablas si no existen, aplica `ALTER TABLE` defensivo para columnas nuevas, crea índices. Expone `obtener_conexion()` con `row_factory = sqlite3.Row`. | `inicializar_bd()`, `obtener_conexion()` |
| `crud.py` | Operaciones puras sobre la BD. **No** valida reglas de negocio (eso vive en `services/` y en los handlers de `main.py`). | `registrar_prestador`, `guardar_registros_diarios`, `guardar_registros_historicos`, `obtener_resumen_prestador`, `eliminar_prestador`, `actualizar_estatus_dia` |
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
│   ├── app.js         # Lógica del Dashboard (upload + PDF semanal)
│   └── chart.min.js   # Chart.js offline (cargado offline; uso opcional)
├── css/style.css      # CSS auxiliar — Tailwind viene por CDN
└── assets/            # Imágenes
```

Cada HTML es **independiente y autocontenido**: importa Tailwind por CDN, define sus propios scripts inline para las páginas más interactivas (`prestadores.html`, `seguimiento.html`, `analitica.html`) y comparte únicamente `app.js` con el dashboard.

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
main.py::upload_reporte
   1. guarda archivo en data/<file>
   2. procesador_excel.procesar_reporte_asistencia(ruta)
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
ui/js/app.js → guarda tablaPDFData, muestra botón "Descargar Resumen PDF",
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
main.py::migrar_historico
   1. guarda archivo en data/
   2. migrador_historico.procesar_seguimiento_historico(ruta)
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

### 4.4. Endpoints concentrados en `main.py`
Aunque existe `app/api/rutas.py` con un esqueleto de `APIRouter`, **no está montado**. Todos los endpoints reales están definidos como funciones decoradas con `@app.<verb>` directamente en `main.py`. Esto es un atajo histórico y la refactorización a routers modulares está pendiente.

### 4.5. Inicialización agresiva en el import
`main.py` ejecuta al cargar el módulo:
1. `inicializar_bd()` → crea/migra tablas e índices.
2. `registrar_prestador(1, "ALEXIA BERNAL", ...)` → garantiza un prestador semilla.
3. `_normalizar_deptos_existentes()` → normaliza variantes legacy de nombres de departamento.

**Implicación:** cada `uvicorn --reload` reinicia este pipeline, pero todas las operaciones son idempotentes y seguras.

### 4.6. Replicación cliente/servidor del algoritmo de redondeo
La función `redondear_horas` existe **dos veces**: una en `procesador_excel.py` (Python) y otra en `ui/js/app.js` (JS). Ambas implementan exactamente el mismo algoritmo. La duplicación es deliberada: permite que el PDF muestre el redondeo coherente con la BD sin requerir una llamada extra al servidor.

> **Cuidado:** si se modifica el algoritmo en uno de los dos lados, **debe** actualizarse en el otro. Ver [`BUSINESS_LOGIC.md`](BUSINESS_LOGIC.md#1-redondeo-de-horas).

---

## 5. Endpoints — quick map

| Método | Ruta | Handler en `main.py` |
|---|---|---|
| GET | `/` | `redirigir_login` → 307 a `/ui/login.html` |
| GET | `/ui/*` | StaticFiles |
| POST | `/api/login` | `login` |
| POST | `/api/verificar-sesion` | `verificar_sesion_endpoint` |
| POST | `/api/upload-reporte` | `upload_reporte` |
| POST | `/api/migrar-historico` | `migrar_historico` |
| GET | `/api/dashboard/{id}` | `dashboard_api` |
| GET | `/api/seguimiento-datos` | `obtener_datos_seguimiento` |
| GET | `/api/analitica-general` | `obtener_analitica` |
| GET | `/api/prestadores-lista` | `obtener_prestadores` |
| POST | `/api/prestadores` | `crear_prestador_api` |
| PUT | `/api/prestadores/{id}` | `actualizar_prestador_api` |
| DELETE | `/api/prestadores/{id}` | `dar_de_baja` |
| GET | `/api/departamentos` | `obtener_departamentos` |
| POST | `/api/actualizar-dia` | `actualizar_dia` |

Especificación detallada (payload, respuesta, ejemplos `curl`) en [`API.md`](API.md).
