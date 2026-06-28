# Base de Datos (SQLite)

> Esquema completo, relaciones, índices y migraciones del archivo `data/asistencias.db`. Toda la DDL vive en `app/database/db_config.py::inicializar_bd`, que se ejecuta automáticamente cada arranque del servidor y es **idempotente**.

---

## 1. Ubicación y configuración

| Ítem | Valor |
|---|---|
| **Driver** | `sqlite3` (stdlib) |
| **Archivo** | `data/asistencias.db` (relativo al root del proyecto) |
| **Creación del directorio** | Automática en `obtener_conexion()` si `data/` no existe. |
| **row_factory** | `sqlite3.Row` → permite `row["nombre"]` (acceso por nombre de columna). |
| **Pragmas** | Ninguno especial; se usa el modo journal por defecto (DELETE). |

---

## 2. Esquema

### 2.1. Tabla `prestadores`

Representa al alumno/persona que cumple servicio social.

```sql
CREATE TABLE IF NOT EXISTS prestadores (
    id_checador        INTEGER PRIMARY KEY,
    nombre             TEXT NOT NULL,
    departamento       TEXT NOT NULL,
    fecha_inicio       DATE,
    fecha_termino      DATE,
    horas_obligatorias INTEGER DEFAULT 480,
    estatus            TEXT DEFAULT 'Activo',
    sexo               TEXT                   -- añadida vía ALTER TABLE (ver §4)
);
```

| Columna | Tipo | Notas |
|---|---|---|
| `id_checador` | INTEGER PK | ID físico del lector de huella/tarjeta. **No** se autogenera. |
| `nombre` | TEXT NOT NULL | Nombre completo en mayúsculas (convención). |
| `departamento` | TEXT NOT NULL | Canónico, sin acentos, mayúsculas. Ver [`BUSINESS_LOGIC.md §6`](BUSINESS_LOGIC.md#6-normalización-de-departamentos). |
| `fecha_inicio` / `fecha_termino` | DATE (texto ISO `YYYY-MM-DD`) | Periodo de servicio social. Default usado por handlers: `2026-01-01` / `2026-07-01`. |
| `horas_obligatorias` | INTEGER DEFAULT 480 | Meta del periodo. |
| `estatus` | TEXT DEFAULT 'Activo' | Reservado para futuro (no se lee actualmente). |
| `sexo` | TEXT NULL | Migración tardía. `'Masculino'` / `'Femenino'` o NULL. |

### 2.2. Tabla `registros`

Cada fila representa **un día de un prestador**.

```sql
CREATE TABLE IF NOT EXISTS registros (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    id_checador        INTEGER,
    fecha              DATE NOT NULL,
    hora_entrada       TEXT,
    hora_salida        TEXT,
    horas_trabajadas   REAL DEFAULT 0.0,
    requiere_revision  BOOLEAN DEFAULT 0,
    estatus            TEXT DEFAULT 'Asistencia',
    FOREIGN KEY(id_checador) REFERENCES prestadores(id_checador),
    UNIQUE(id_checador, fecha)
);
```

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | Identidad de la fila. **Se regenera** en `INSERT OR REPLACE` — no usar como referencia estable. |
| `id_checador` | INTEGER FK | Referencia a `prestadores.id_checador`. |
| `fecha` | DATE NOT NULL | `YYYY-MM-DD`. Junto con `id_checador` forma la clave única de negocio. |
| `hora_entrada` / `hora_salida` | TEXT NULL | `HH:MM` (24h). NULL para Falta/Justificante/Edición manual sin horas. |
| `horas_trabajadas` | REAL DEFAULT 0.0 | Horas **redondeadas** ([`BUSINESS_LOGIC.md §1`](BUSINESS_LOGIC.md#1-redondeo-de-horas)). |
| `requiere_revision` | BOOLEAN DEFAULT 0 | Reservado. Actualmente no se escribe ni se lee desde la app. |
| `estatus` | TEXT DEFAULT 'Asistencia' | `Asistencia` / `Falta` / `Justificante` / `Saldo Inicial`. Ver [`BUSINESS_LOGIC.md §4`](BUSINESS_LOGIC.md#4-estatus-de-registro-y-semántica). |

#### Restricción de unicidad
`UNIQUE(id_checador, fecha)` — garantiza un solo registro por (persona, día). Es la base sobre la que opera `INSERT OR REPLACE` para idempotencia.

### 2.3. Tabla `justificaciones`

Tabla extendida para guardar el **motivo textual** del justificante. Actualmente **no se usa por la UI** (las marcas `Justificante` viven en `registros.estatus`), pero la tabla existe para una iteración futura.

```sql
CREATE TABLE IF NOT EXISTS justificaciones (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    id_checador  INTEGER,
    fecha        DATE NOT NULL,
    motivo       TEXT,
    FOREIGN KEY(id_checador) REFERENCES prestadores(id_checador),
    UNIQUE(id_checador, fecha)
);
```

> La eliminación de un prestador (`eliminar_prestador`) **sí limpia esta tabla** además de `registros`, para mantener la integridad si en el futuro se empieza a poblar.

---

## 3. Relaciones

```
prestadores                    registros
┌─────────────────────┐        ┌────────────────────────┐
│ id_checador  (PK)   │◀───┐   │ id          (PK auto)  │
│ nombre              │    │   │ id_checador (FK) ──────┘
│ departamento        │    │   │ fecha                  │
│ fecha_inicio        │    │   │ hora_entrada           │
│ fecha_termino       │    │   │ hora_salida            │
│ horas_obligatorias  │    │   │ horas_trabajadas       │
│ estatus             │    │   │ requiere_revision      │
│ sexo                │    │   │ estatus                │
└─────────────────────┘    │   └────────────────────────┘
                           │             UNIQUE(id_checador, fecha)
                           │
                           │   justificaciones
                           │   ┌────────────────────────┐
                           └───│ id_checador (FK)       │
                               │ fecha                  │
                               │ motivo                 │
                               └────────────────────────┘
                                  UNIQUE(id_checador, fecha)
```

- **1‑N:** un prestador tiene 0..N registros y 0..N justificaciones.
- **Sin `ON DELETE CASCADE`**: SQLite no aplica FKs por defecto (`PRAGMA foreign_keys = ON` no está habilitado). La eliminación se hace manualmente en `crud.eliminar_prestador` con tres `DELETE` consecutivos en una sola conexión.

---

## 4. Migraciones idempotentes

`inicializar_bd()` se ejecuta en cada arranque y aplica:

1. **`CREATE TABLE IF NOT EXISTS`** para las tres tablas → seguro para BDs nuevas y existentes.
2. **`ALTER TABLE prestadores ADD COLUMN sexo TEXT`** envuelto en `try/except sqlite3.OperationalError` — permite añadir la columna sin romper si ya existe.
3. **`CREATE INDEX IF NOT EXISTS`** para tres índices de rendimiento (ver §5).

> **Para añadir una columna nueva**, replicar el patrón del paso 2 (ALTER + try/except). No usar herramientas de migración externas como Alembic — el proyecto deliberadamente las evita por simplicidad.

---

## 5. Índices

```sql
CREATE INDEX IF NOT EXISTS idx_registros_checador_fecha ON registros(id_checador, fecha);
CREATE INDEX IF NOT EXISTS idx_registros_estatus       ON registros(estatus);
CREATE INDEX IF NOT EXISTS idx_prestadores_depto      ON prestadores(departamento);
```

| Índice | Razón |
|---|---|
| `idx_registros_checador_fecha` | Soporta el `LEFT JOIN ... ORDER BY p.id_checador, r.fecha` de `/api/seguimiento-datos`. Cubre las búsquedas por prestador y rango de fechas. |
| `idx_registros_estatus` | Acelera `GROUP BY estatus` de `/api/analitica-general`. |
| `idx_prestadores_depto` | Filtros por departamento en frontend y `GROUP BY departamento` en analítica. |

---

## 6. Datos semilla

Al arranque, `main.py` ejecuta:

```python
registrar_prestador(1, "ALEXIA BERNAL", "LOGISTICA", "2026-01-01", "2026-07-01", 480)
```

Esto garantiza al menos un prestador para que la UI no se sienta vacía en una instalación virgen. Es **idempotente** (si ya existe, `registrar_prestador` captura el `IntegrityError` y retorna `False`).

---

## 7. Inspección manual de la BD

### 7.1. Abrir con `sqlite3` CLI

```bash
sqlite3 data/asistencias.db
.tables                             # → prestadores  registros  justificaciones
.schema prestadores                 # DDL de la tabla
SELECT COUNT(*) FROM registros;     # cuántos días tienen registro
SELECT id_checador, COUNT(*), SUM(horas_trabajadas)
  FROM registros
  WHERE estatus = 'Asistencia'
  GROUP BY id_checador;
.quit
```

### 7.2. Respaldo

```bash
# Copia simple (cierra la app antes para evitar inconsistencia)
cp data/asistencias.db data/asistencias_backup_$(date +%F).db

# Respaldo en caliente (con la app abierta)
sqlite3 data/asistencias.db ".backup data/asistencias_backup.db"
```

### 7.3. Reset total

```bash
rm data/asistencias.db
# al siguiente arranque del servidor, inicializar_bd() recreará todo desde cero
```
