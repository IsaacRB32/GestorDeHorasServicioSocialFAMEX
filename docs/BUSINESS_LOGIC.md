# Reglas de Negocio Críticas

> Este documento describe **toda la lógica de negocio no derivable directamente del código** o que vive replicada en cliente y servidor. Cualquier modificación a estas reglas tiene impacto transversal en el sistema y debe validarse con casos de prueba específicos.

---

## 1. Redondeo de horas

**Ubicación canónica:** `app/services/procesador_excel.py::redondear_horas`
**Replicado en cliente:** `ui/js/app.js::redondearHoras`

### 1.1. Algoritmo exacto

Dado un valor `horas` flotante (e.g. `4.32`):

1. `entero  = floor(horas)` — parte entera.
2. `decimal = round(horas - entero, 2)` — parte fraccional con 2 decimales.
3. Aplicar la siguiente tabla:

| Rango de `decimal` | Resultado | Justificación |
|---|---|---|
| `decimal ≤ 0.15` | `entero` (piso) | Tolerancia: <10 min adicionales no cuentan. |
| `0.15 < decimal ≤ 0.50` | `entero + 0.5` | Media hora cubre 10–30 min de ventana. |
| `0.50 < decimal ≤ 0.65` | `entero + 0.5` | 30–40 min siguen siendo media hora (no se favorece al techo prematuramente). |
| `decimal > 0.65` | `entero + 1` (techo) | A partir de 40 min se redondea a la hora completa. |

### 1.2. Casos de prueba canónicos

| `horas` exactas | `entero` | `decimal` | Redondeado |
|---|---|---|---|
| `4.10` | 4 | 0.10 | **4.0** |
| `4.15` | 4 | 0.15 | **4.0** |
| `4.16` | 4 | 0.16 | **4.5** |
| `4.50` | 4 | 0.50 | **4.5** |
| `4.65` | 4 | 0.65 | **4.5** |
| `4.66` | 4 | 0.66 | **5.0** |
| `4.99` | 4 | 0.99 | **5.0** |

### 1.3. ¿Por qué está replicado en cliente y servidor?

- El **servidor** aplica el redondeo al persistir las horas en `registros.horas_trabajadas` durante la ingesta del Excel del checador.
- El **cliente** lo aplica al generar el PDF semanal: muestra simultáneamente las horas exactas (`horas_exactas`, propagadas desde el backend en la respuesta de `/api/upload-reporte`) y las horas redondeadas (`reg.horas` o recálculo).

> **Regla de mantenimiento:** si modificas el algoritmo en un lado, debes modificarlo en el otro. Ambos *deben* producir el mismo número para los mismos inputs.

---

## 2. Meta de horas obligatorias

- **Valor por defecto:** `480 h`.
- **Columna:** `prestadores.horas_obligatorias INTEGER DEFAULT 480`.
- **Origen:** programa de servicio social FAMEX 2026/2027 — 480 h reglamentarias.
- **Sobreescribible por prestador:** sí, vía el formulario de Directorio (`prestadores.html`) o vía `POST /api/prestadores` / `PUT /api/prestadores/{id}`.
- **Cálculo de progreso** (`/api/dashboard/{id}`): `progreso = (total_hecho / horas_obligatorias) * 100`, devuelto con 2 decimales.

---

## 3. Ingesta idempotente del Excel

**Ubicación:** `app/database/crud.py::guardar_registros_diarios` y `guardar_registros_historicos`.

Ambas funciones usan:

```sql
INSERT OR REPLACE INTO registros (id_checador, fecha, hora_entrada, hora_salida, horas_trabajadas[, estatus])
VALUES (?, ?, ?, ?, ?[, ?])
```

### 3.1. ¿Por qué `INSERT OR REPLACE`?

La tabla `registros` tiene la restricción `UNIQUE(id_checador, fecha)`. Cuando el coordinador **re‑sube** el mismo reporte (o sube un reporte corregido), no queremos:

- duplicar filas (rompe la suma de horas y la analítica),
- ni romper la operación por `IntegrityError`,
- ni perder el `id` autoincremental existente (aunque `REPLACE` lo regenera; ver §3.2).

`INSERT OR REPLACE` actúa atómicamente: si existe la combinación `(id_checador, fecha)`, **borra la fila vieja** e inserta la nueva. Si no existe, simplemente inserta.

### 3.2. Implicaciones a tener presentes

1. **`id` se regenera** en cada REPLACE → no usar el `id` de `registros` como referencia estable desde fuera (no hay FKs apuntando a él, pero tampoco es semánticamente válido).
2. **`estatus` se sobrescribe**. Cuando el endpoint de upload del checador no envía `estatus` (sólo envía horas), `guardar_registros_diarios` *omite* la columna y SQLite aplica el `DEFAULT 'Asistencia'`. Si previamente el día estaba marcado como `Falta` o `Justificante` y luego se sube el reporte semanal con horas reales, **el estatus se restablecerá a `Asistencia`**. Este comportamiento es intencional: las horas trabajadas reportadas por el checador prevalecen sobre marcas manuales.
3. **`hora_entrada` / `hora_salida` también se sobrescriben**. Si la edición manual desde el calendario sólo guarda `horas + estatus` (no `entrada`/`salida`), estos campos quedarán `NULL` (ver `crud.actualizar_estatus_dia`).

### 3.3. Caso especial: migración histórica

`guardar_registros_historicos` sí incluye `estatus` explícitamente (`'Asistencia' | 'Falta' | 'Justificante' | 'Saldo Inicial'`), por lo que respeta las marcas que vienen del archivo legacy.

---

## 4. Estatus de registro y semántica

La columna `registros.estatus` admite los siguientes valores:

| Estatus | Origen | Significado | Cuenta horas? |
|---|---|---|---|
| `Asistencia` | Default. Reporte semanal del checador o edición manual con horas. | El prestador asistió y registró entrada/salida. | Sí, `horas_trabajadas > 0`. |
| `Falta` | Edición manual (`/api/actualizar-dia`) o ingesta histórica (`X` o `N` en la celda). | Ausencia no justificada. | No, `horas_trabajadas = 0`. |
| `Justificante` | Edición manual o ingesta histórica (`J` o `P` en la celda). | Ausencia justificada (permiso, evento, etc.). | No, `horas_trabajadas = 0`. |
| `Saldo Inicial` | **Sólo migración histórica.** Cuando la celda del día 1 de enero tiene un valor > 24 (claramente un acumulado, no un día). | Horas acumuladas previas al periodo registrado (puente entre el sistema anterior y este). | Sí, registrado en la fecha sintética `2025-12-31`. |

Detalle del mapeo legacy: `migrador_historico.py` → constantes `JUSTIFICANTES = {'J', 'J ', 'P'}` y `FALTAS = {'X', 'X ', 'N'}`. Cualquier otro valor numérico válido `0 < horas ≤ 24` se interpreta como `Asistencia` con esas horas.

---

## 5. Autenticación

**Ubicación:** `main.py`, sección `============ AUTENTICACIÓN ============`.

### 5.1. Credenciales

```python
ADMIN_USUARIO    = "admin"
ADMIN_CLAVE_HASH = hashlib.sha256("famex2026".encode()).hexdigest()
```

- Hash **embebido en el código** (no en una BD, no en un `.env`).
- Cambiar la contraseña requiere editar `main.py` y recalcular el hash:
  ```python
  python -c "import hashlib; print(hashlib.sha256('nueva_clave'.encode()).hexdigest())"
  ```

### 5.2. Flujo de login

```
Cliente → POST /api/login  {usuario, clave}
        │
        ▼
Servidor:
  1. clave_hash = sha256(clave_recibida)
  2. si usuario != "admin" OR clave_hash != ADMIN_CLAVE_HASH → 401
  3. token = secrets.token_hex(32)   # 64 hex chars
  4. _sesiones_activas[token] = {"usuario": "admin", "creado": time.time()}
        │
        ▼
Respuesta → {token, usuario}
        │
        ▼
Cliente → localStorage.setItem('famex_token', token)
```

### 5.3. Verificación

Cada página HTML protegida (todas menos `login.html`) ejecuta en `<head>`:

```html
<script>
  if (!localStorage.getItem('famex_token')) {
    window.location.replace('login.html');
  }
</script>
```

Adicionalmente existe `POST /api/verificar-sesion` con `body = {token}` que retorna `{valido: true}` o lanza 401. **Verificación server‑side activa:** desde el refactor Enterprise, los routers `prestadores`, `registros`, `seguimiento` y `analitica` exigen el header `Authorization: Bearer <token>` mediante la dependencia `app/core/security.py::require_auth` (declarada como `dependencies=[Depends(require_auth)]` a nivel de router). El router `auth` permanece público. En el cliente, el wrapper `apiFetch()` (`ui/js/famex-ui.js`) inyecta el header en todas las llamadas y, ante un `401`, limpia el token y redirige a `login.html`. La validación del token es de tiempo constante en el path de login (`secrets.compare_digest`) y el almacén de sesiones está protegido con `threading.Lock`.

### 5.4. Expiración

```python
def verificar_token(token):
    sesion = _sesiones_activas.get(token)
    if not sesion: return False
    if time.time() - sesion["creado"] > 28800:  # 8 horas
        del _sesiones_activas[token]
        return False
    return True
```

- **Vida del token: 8 h** (`28800 s`).
- Los tokens viven en RAM (`_sesiones_activas: dict[str, dict]`). **Al reiniciar el servidor todos los tokens se pierden** y el usuario debe re‑loguearse.

---

## 6. Normalización de departamentos

Los datos legacy contienen variantes con acentos, minúsculas y espacios. El sistema unifica a un conjunto **canónico** (sin acentos, mayúsculas):

`LOGISTICA`, `OPERACIONES`, `COMERCIAL`, `PUBLICIDAD`, `RELACIONES PUBLICAS`, `ADQUISICIONES`, `General`.

### 6.1. Tres puntos de normalización

| Punto | Ubicación | Cuándo se ejecuta |
|---|---|---|
| Migración legacy → canónico | `app/services/migrador_historico.py::normalizar_departamento` | Cada vez que se migra un Excel histórico. |
| Fix de datos ya en BD | `main.py::_normalizar_deptos_existentes` | Al **arranque del servidor**. Recorre variantes conocidas y aplica `UPDATE`. |
| Filtros del frontend | Hard‑coded en los `<select>` de `prestadores.html` y `seguimiento.html` | Render del DOM. |

### 6.2. Mapa de equivalencias

| Variante encontrada | Canónico |
|---|---|
| `LOGÍSTICA`, `Logística`, `Logistica`, `logistica` | `LOGISTICA` |
| `RELACIONES PÚBLICAS`, `Relaciones Públicas`, `Relaciones Publicas`, `relaciones publicas` | `RELACIONES PUBLICAS` |
| `OPERACIONES`, `Operaciones`, `operaciones` | `OPERACIONES` |
| (análogo para los demás) | |

Cuando se recibe un departamento nuevo no listado, se mantiene tal cual (en `MAYÚSCULAS`).

---

## 7. Particularidades de la ingesta

### 7.1. Reporte semanal de checador (`procesar_reporte_asistencia`)

- Lee la hoja `Registros de asistencia`.
- Detecta cada **bloque de alumno** buscando filas donde la celda 0 sea exactamente `"ID."`.
- Extrae `id_checador` (celda 1), `nombre` (después de la palabra `"Nombre"` en la misma fila) y `departamento` (después de `"Depart."`).
- Asume que las dos filas siguientes (`i+1` y `i+3`) contienen respectivamente las fechas (números de día) y los rangos `HH:MM\nHH:MM` (entrada/salida) para 5 columnas.
- **Fecha hard‑codeada:** `f"2026-05-{int(float(fecha_dia)):02d}"`. Esto asume reportes de **mayo 2026**. Para soportar otros meses se requiere parametrización (pendiente).
- Calcula `horas_exactas = (salida - entrada).total_seconds() / 3600` y `horas = redondear_horas(horas_exactas)`.

### 7.2. Migración histórica (`procesar_seguimiento_historico`)

- Lee la hoja `SS 2026` saltando la primera fila (`df.iloc[1:]`).
- Cada fila representa un (prestador, mes). Columnas:
  - `iloc[1]` = `id_checador`
  - `iloc[2]` = `nombre`
  - `iloc[3]` = `departamento` (variante)
  - `iloc[4]` = `mes_num` (numérico, 1 = enero)
  - `iloc[5]` = `mes_str` (texto: "Enero", "Febrero", ...)
  - `iloc[6..36]` = un slot por día del mes (día 1 en col 6, día 2 en col 7, etc.)
- **Prevención de duplicados de prestador:** sólo se registra el prestador la primera vez que aparece (`if id_checador not in prestadores`). Los archivos legacy traen el mismo prestador repetido en cada mes.
- **Detección de saldo inicial:** si la celda del día 1 de enero (`dia == 1 and mes_num == 1`) contiene un valor `> 24`, se interpreta como acumulado previo y se almacena con fecha sintética **`2025-12-31`** y estatus `Saldo Inicial`.
- **Días válidos:** `0 < horas ≤ 24`.

---

## 8. Consistencia transaccional

- **No se usan transacciones explícitas** en bloques de inserciones múltiples (e.g. `guardar_registros_diarios` itera y hace `commit` al final). Si el proceso muere a la mitad, parte de los registros se persisten.
- **Aceptable** dado que la operación es idempotente (`INSERT OR REPLACE`) → re‑subir el mismo Excel completa los huecos.
- **No aceptable** si en el futuro se introduce lógica con efectos secundarios irreversibles (notificaciones, etc.). Considerar envolver en `BEGIN ... COMMIT` cuando se añada.

---

## 9. Cómo verificar cada regla

| Regla | Cómo probarla |
|---|---|
| Redondeo (servidor) | Subir un Excel con horas conocidas y consultar `GET /api/seguimiento-datos`; comparar contra la tabla §1.2. |
| Redondeo (cliente) | En el dashboard, descargar el PDF semanal y verificar que la columna "Rond" coincide con la tabla §1.2. |
| Idempotencia | Subir el mismo Excel dos veces; el conteo de `registros` en SQLite no debe duplicarse. |
| Auth válido | `curl -X POST /api/login -H "Content-Type: application/json" -d '{"usuario":"admin","clave":"famex2026"}'` debe retornar `{token, usuario}`. |
| Auth inválido | Cambiar la clave → 401. |
| Expiración | Modificar `28800` a `5` (5 s) temporalmente, esperar y llamar `verificar-sesion` → 401. |
| Normalización deptos | Insertar manualmente un prestador con `departamento="Logística"` → reiniciar el servidor → consultar BD: debe leer `LOGISTICA`. |
| Saldo inicial | Migrar un archivo histórico con `25` en (Enero, día 1) → consultar BD: debe haber una fila en `2025-12-31` con `estatus='Saldo Inicial'` y `horas_trabajadas=25`. |
