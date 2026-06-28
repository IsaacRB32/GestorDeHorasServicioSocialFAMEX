# Referencia de la API REST

> Todos los endpoints viven en `main.py` (no en `app/api/rutas.py`, que es un stub legado). Base URL en local: `http://127.0.0.1:8000`. Los endpoints `/api/*` **no exigen token** server‑side — la protección es client‑side vía `localStorage.famex_token`. Ver [`BUSINESS_LOGIC.md §5`](BUSINESS_LOGIC.md#5-autenticación).

---

## 1. Convenciones

- Content‑Type por defecto: `application/json`.
- Endpoints de upload: `multipart/form-data` con el campo `file`.
- Fechas: ISO‑8601 `YYYY-MM-DD`.
- Horas (`hora_entrada`/`hora_salida`): `HH:MM` 24h.
- Errores de validación de Pydantic: 422 con el detalle estándar de FastAPI.
- Errores de negocio: 401 (auth), 404 (recurso no encontrado), 409 (conflicto de unicidad).

---

## 2. Endpoints

### 2.1. `GET /` → Redirección a login

`307 Temporary Redirect` → `/ui/login.html`.

```bash
curl -i http://127.0.0.1:8000/
```

---

### 2.2. `POST /api/login`

Autentica al usuario admin y devuelve un token de sesión de 8 h.

**Request body** (JSON):
```json
{ "usuario": "admin", "clave": "famex2026" }
```

**Respuesta 200:**
```json
{ "token": "a1b2…(64 hex chars)…", "usuario": "admin" }
```

**Errores:**
- `401` `{"detail": "Usuario o contraseña incorrectos"}`.

**Ejemplo:**
```bash
curl -X POST http://127.0.0.1:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"usuario":"admin","clave":"famex2026"}'
```

---

### 2.3. `POST /api/verificar-sesion`

Valida un token contra `_sesiones_activas` (memoria) y su edad (< 8 h).

**Request body:** `{ "token": "<token>" }`

**Respuesta 200:** `{ "valido": true }`
**Errores:** `401 {"detail": "Sesión inválida"}`.

```bash
curl -X POST http://127.0.0.1:8000/api/verificar-sesion \
  -H "Content-Type: application/json" \
  -d '{"token":"a1b2…"}'
```

---

### 2.4. `POST /api/upload-reporte`

**Multipart upload** del reporte semanal del checador (`.xlsx` con hoja `Registros de asistencia`). Persiste prestadores nuevos y registros de horas con `INSERT OR REPLACE`.

**Form field:** `file` (binario .xlsx).

**Respuesta 200:**
```json
{
  "mensaje": "Éxito",
  "procesados": 17,
  "tabla_pdf": [
    {
      "id": 1,
      "nombre": "ALEXIA BERNAL",
      "registros": [
        { "fecha": "2026-05-12", "horas": 4.5, "horas_exactas": 4.32 },
        { "fecha": "2026-05-13", "horas": 5.0, "horas_exactas": 4.85 }
      ]
    }
  ]
}
```

**Comportamiento clave:**
- Para cada prestador nuevo del Excel se llama `registrar_prestador(...)` con defaults (`2026-01-01` / `2026-07-01` / `480 h`).
- Los registros se insertan/actualizan; `estatus` se restablece a `Asistencia` (ver [`BUSINESS_LOGIC.md §3.2`](BUSINESS_LOGIC.md#32-implicaciones-a-tener-presentes)).
- `tabla_pdf` se usa client‑side por `ui/js/app.js::generarPDF` para el PDF semanal sin necesidad de un segundo round‑trip.

```bash
curl -X POST http://127.0.0.1:8000/api/upload-reporte \
  -F "file=@reporte_checador.xlsx"
```

---

### 2.5. `POST /api/migrar-historico`

**Multipart upload** del archivo legacy `seguimiento.xlsx` (hoja `SS 2026`). Inserta prestadores e ingiere registros multi‑mes con `estatus` explícito.

**Form field:** `file` (binario .xlsx).

**Respuesta 200:**
```json
{
  "mensaje": "Migración completada",
  "prestadores_nuevos": 24,
  "registros_insertados": 1280
}
```

- `prestadores_nuevos` cuenta sólo los que **no existían previamente** (los demás se omiten silenciosamente).
- `registros_insertados` cuenta el total de filas que fueron a `INSERT OR REPLACE` (incluye sobreescrituras).

```bash
curl -X POST http://127.0.0.1:8000/api/migrar-historico \
  -F "file=@seguimiento.xlsx"
```

---

### 2.6. `GET /api/dashboard/{id_prestador}`

Resumen de progreso de un prestador específico.

**Respuesta 200:**
```json
{
  "id": 1,
  "horas_acumuladas": 124.5,
  "progreso": 25.94
}
```

- `horas_acumuladas` = `SUM(registros.horas_trabajadas)` para ese `id_checador`.
- `progreso` = `horas_acumuladas / horas_obligatorias * 100`, redondeado a 2 decimales.
- Si el prestador no tiene registros aún: `{"horas_acumuladas": 0, "progreso": 0}`.

```bash
curl http://127.0.0.1:8000/api/dashboard/1
```

---

### 2.7. `GET /api/seguimiento-datos`

Endpoint usado por `seguimiento.html` (calendario) y como fallback en `index.html` (PDF). Devuelve **todos los prestadores con su detalle de registros** en una sola llamada.

**Respuesta 200** (array):
```json
[
  {
    "id": 1,
    "nombre": "ALEXIA BERNAL",
    "departamento": "LOGISTICA",
    "horas_totales": 124.5,
    "faltas": 2,
    "justificantes": 1,
    "registros": [
      { "fecha": "2026-05-12", "horas": 4.5, "estatus": "Asistencia" },
      { "fecha": "2026-05-15", "horas": 0,   "estatus": "Falta" }
    ]
  }
]
```

Implementado con un único `LEFT JOIN` para evitar N+1.

```bash
curl http://127.0.0.1:8000/api/seguimiento-datos
```

---

### 2.8. `GET /api/analitica-general`

Agregados globales para `analitica.html`.

**Respuesta 200:**
```json
{
  "departamentos": [
    { "depto": "LOGISTICA",   "total": 540.5 },
    { "depto": "OPERACIONES", "total": 380.0 }
  ],
  "estatus": [
    { "estado": "Asistencia",   "total": 420 },
    { "estado": "Falta",        "total": 15  },
    { "estado": "Justificante", "total": 8   }
  ]
}
```

```bash
curl http://127.0.0.1:8000/api/analitica-general
```

---

### 2.9. `GET /api/prestadores-lista`

Devuelve todos los prestadores con sus metadatos para `prestadores.html`.

**Respuesta 200** (array):
```json
[
  {
    "id": 1,
    "nombre": "ALEXIA BERNAL",
    "departamento": "LOGISTICA",
    "sexo": "Femenino",
    "fecha_inicio": "2026-01-01",
    "fecha_termino": "2026-07-01",
    "horas_obligatorias": 480
  }
]
```

```bash
curl http://127.0.0.1:8000/api/prestadores-lista
```

---

### 2.10. `POST /api/prestadores`

Alta de un prestador.

**Request body** (modelo Pydantic `PrestadorInput`):
```json
{
  "id_checador": 42,
  "nombre": "JUAN PEREZ",
  "departamento": "OPERACIONES",
  "sexo": "Masculino",
  "fecha_inicio": "2026-01-01",
  "fecha_termino": "2026-07-01",
  "horas_obligatorias": 480
}
```

Campos opcionales (con default): `sexo`, `fecha_inicio` (`2026-01-01`), `fecha_termino` (`2026-07-01`), `horas_obligatorias` (`480`).

**Respuesta 200:** `{"mensaje": "Prestador creado exitosamente"}`
**Error 409:** `{"detail": "El ID Checador ya existe en el sistema"}`.

```bash
curl -X POST http://127.0.0.1:8000/api/prestadores \
  -H "Content-Type: application/json" \
  -d '{"id_checador":42,"nombre":"JUAN PEREZ","departamento":"OPERACIONES","sexo":"Masculino"}'
```

---

### 2.11. `PUT /api/prestadores/{id_checador}`

Edición de los datos de un prestador (mismo schema que `POST`).

**Respuesta 200:** `{"mensaje": "Prestador actualizado exitosamente"}`
**Error 404:** `{"detail": "Prestador no encontrado"}`.

```bash
curl -X PUT http://127.0.0.1:8000/api/prestadores/42 \
  -H "Content-Type: application/json" \
  -d '{"id_checador":42,"nombre":"JUAN PEREZ R.","departamento":"OPERACIONES","sexo":"Masculino"}'
```

---

### 2.12. `DELETE /api/prestadores/{id_checador}`

Baja por cumplimiento. Borra en cascada manual `registros` → `justificaciones` → `prestadores`.

**Respuesta 200:** `{"mensaje": "Prestador 42 dado de baja exitosamente"}`
**Error 404:** `{"detail": "Prestador no encontrado o error al eliminar"}`.

```bash
curl -X DELETE http://127.0.0.1:8000/api/prestadores/42
```

---

### 2.13. `GET /api/departamentos`

Lista de departamentos **distintos** presentes en la BD, ordenados alfabéticamente.

**Respuesta 200:**
```json
["COMERCIAL", "LOGISTICA", "OPERACIONES", "PUBLICIDAD", "RELACIONES PUBLICAS"]
```

```bash
curl http://127.0.0.1:8000/api/departamentos
```

---

### 2.14. `POST /api/actualizar-dia`

Edita o crea un registro individual desde el calendario.

**Request body** (modelo Pydantic `EdicionDia`):
```json
{
  "id_checador": 1,
  "fecha": "2026-05-15",
  "horas": 0,
  "estatus": "Falta"
}
```

- `estatus` admite: `Asistencia` | `Falta` | `Justificante`.
- Si `estatus = Falta` o `Justificante`, enviar `horas = 0`.
- Usa `INSERT OR REPLACE` → seguro para crear desde cero o sobreescribir.

**Respuesta 200:**
```json
{"mensaje": "Día actualizado correctamente", "exito": true}
```

```bash
curl -X POST http://127.0.0.1:8000/api/actualizar-dia \
  -H "Content-Type: application/json" \
  -d '{"id_checador":1,"fecha":"2026-05-15","horas":0,"estatus":"Falta"}'
```

---

## 3. Flujo de prueba end‑to‑end (smoke con `curl`)

```bash
BASE=http://127.0.0.1:8000

# 1. Login
TOKEN=$(curl -s -X POST $BASE/api/login \
  -H "Content-Type: application/json" \
  -d '{"usuario":"admin","clave":"famex2026"}' | jq -r .token)
echo "Token: $TOKEN"

# 2. Verificar token
curl -s -X POST $BASE/api/verificar-sesion \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}"

# 3. Crear prestador de prueba
curl -s -X POST $BASE/api/prestadores \
  -H "Content-Type: application/json" \
  -d '{"id_checador":999,"nombre":"PRUEBA QA","departamento":"OPERACIONES"}'

# 4. Marcar una falta
curl -s -X POST $BASE/api/actualizar-dia \
  -H "Content-Type: application/json" \
  -d '{"id_checador":999,"fecha":"2026-05-10","horas":0,"estatus":"Falta"}'

# 5. Consultar seguimiento
curl -s $BASE/api/seguimiento-datos | jq '.[] | select(.id == 999)'

# 6. Dashboard
curl -s $BASE/api/dashboard/999

# 7. Baja
curl -s -X DELETE $BASE/api/prestadores/999
```
