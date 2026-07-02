# Empaquetado del sistema como ejecutable (.exe)

Manual técnico para compilar **FAMEX Control** en un único ejecutable de
escritorio distribuible ("un solo clic") con **PyInstaller**. Pensado para
equipos de bajos recursos y entornos **sin internet** (la app ya es
[Offline-First](ARCHITECTURE.md#47-arquitectura-offline-first-dependencias-locales-sin-cdns)).

El entrypoint del `.exe` es [`lanzador.py`](../lanzador.py): arranca uvicorn de
forma programática, abre el navegador en `http://127.0.0.1:8000` y gestiona el
cierre limpio.

---

## 0. Prerrequisitos (una sola vez, en una máquina CON internet)

1. **Poblar las librerías locales** (`ui/vendor/`). Si aún no lo hiciste:

   ```
   cd ui\vendor
   python descargar_dependencias.py
   cd ..\..
   ```

   (o doble clic a `ui\vendor\descargar.bat`). Verifica que existan
   `tailwindcss.js`, `jspdf.umd.min.js` y `jspdf.plugin.autotable.min.js`.

2. **Generar la BD semilla** que se empaquetará como estado inicial. Basta con
   ejecutar el bootstrap una vez para crear `data/asistencias.db` con las tablas
   y el prestador semilla:

   ```
   python -m app.database.db_config
   ```

   > La BD semilla se empaqueta como plantilla de solo lectura. En el primer
   > arranque del `.exe`, `lanzador.py` la copia a una carpeta `data/`
   > **escribible junto al ejecutable** (nunca dentro del temporal de
   > PyInstaller), de modo que los datos **persisten** entre ejecuciones.
   > Si prefieres distribuir el `.exe` totalmente vacío, puedes omitir este paso
   > y el `--add-data "data;data"`: la BD se creará automáticamente al arrancar.

3. **Entorno de producción limpio** (recomendado) con solo lo necesario:

   ```
   python -m venv .venv_dist
   .venv_dist\Scripts\activate
   pip install -r requirements_dist.txt
   ```

---

## 1. Instalar PyInstaller

```
pip install pyinstaller
```

---

## 2. Compilar el ejecutable

Ejecuta este comando **desde la raíz del proyecto** (donde está `lanzador.py`).
En Windows, `^` continúa la línea; puedes también pegarlo todo en una sola línea.

```
pyinstaller --noconfirm --clean --onefile --name FAMEX-Control ^
  --add-data "ui;ui" ^
  --add-data "data;data" ^
  --hidden-import uvicorn.logging ^
  --hidden-import uvicorn.loops.auto ^
  --hidden-import uvicorn.protocols.http.auto ^
  --hidden-import uvicorn.protocols.http.h11_impl ^
  --hidden-import uvicorn.protocols.websockets.auto ^
  --hidden-import uvicorn.lifespan.on ^
  --collect-submodules uvicorn ^
  lanzador.py
```

Al terminar, el ejecutable queda en **`dist\FAMEX-Control.exe`**.

### ¿Qué hace cada parte crítica?

| Flag | Propósito |
|---|---|
| `--onefile` | Empaqueta todo en un único `.exe` autocontenido. |
| `--name FAMEX-Control` | Nombre del ejecutable resultante. |
| `--add-data "ui;ui"` | **Incluye el frontend** (HTML/JS/CSS + `ui/vendor/`). Sin esto el `.exe` no encuentra la interfaz. |
| `--add-data "data;data"` | Incluye la **BD semilla inicial**. Se extrae a `sys._MEIPASS/data` y `lanzador.py` la copia a la carpeta escribible en el primer arranque. |
| `--hidden-import uvicorn.*` | uvicorn carga sus loops/protocolos de forma dinámica; PyInstaller no los detecta solo. Estos flags evitan el error `RuntimeError: ... uvicorn.protocols ...` en tiempo de ejecución. |
| `--collect-submodules uvicorn` | Red de seguridad: arrastra todos los submódulos de uvicorn. |

> **Importante — separador de rutas en `--add-data`:** en **Windows** es `;`
> (`"ui;ui"`). En **Linux/macOS** es `:` (`"ui:ui"`). Usa el que corresponda a
> tu sistema de compilación.

---

## 3. Opciones adicionales (opcionales)

- **Ícono personalizado:** añade `--icon "ui\assets\famex.ico"` (requiere un
  `.ico`; un `.jpg`/`.png` no sirve directamente).
- **Sin ventana de consola:** añade `--noconsole` para ocultar la terminal
  negra. Contra: el usuario ya no verá logs ni podrá pulsar `Ctrl+C`; para
  cerrar el sistema tendrá que terminar el proceso `FAMEX-Control.exe` (por
  ejemplo desde el Administrador de tareas). Sin `--noconsole`, cerrar la
  ventana de consola detiene el servidor limpiamente (recomendado para soporte).

---

## 4. Distribución y primer arranque

1. Entrega **`dist\FAMEX-Control.exe`** al usuario final (un solo archivo).
2. Al hacer doble clic:
   - se arranca el servidor local,
   - se abre automáticamente el navegador en `http://127.0.0.1:8000`,
   - se crea/copiar la carpeta **`data\`** junto al `.exe` (BD + sesiones +
     respaldos). **Esa carpeta contiene los datos reales**: para respaldar el
     sistema basta con copiar `data\asistencias.db` (o usar
     *Mantenimiento → Respaldos* dentro de la app).
3. Credenciales por defecto: usuario `admin`, contraseña `famex2026` (cambiar en
   producción vía `FAMEX_ADMIN_HASH`, ver [`README`](../README.md#credenciales-por-defecto)).

---

## 5. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `ModuleNotFoundError` de uvicorn/starlette al abrir el `.exe` | Import dinámico no detectado | Añade el `--hidden-import` correspondiente y recompila. |
| La interfaz abre sin estilos / sin generar PDF | Faltó empaquetar `ui/vendor/` | Repuebla `ui\vendor\` (paso 0.1) y recompila. |
| Los datos se pierden al reabrir | Se está escribiendo en el temporal | Verifica que usas `lanzador.py` (config.py detecta modo `frozen` y escribe en `data\` junto al `.exe`). |
| Antivirus marca el `.exe` | Falso positivo común de PyInstaller onefile | Firmar el binario o distribuir en `--onedir` (carpeta) en vez de `--onefile`. |
| Ejecutable muy pesado (~150–250 MB) | pandas/openpyxl son grandes | Normal en onefile; si es crítico, evaluar exclusiones o `--onedir`. |

---

## 6. Prueba rápida ANTES de compilar

Valida que el entrypoint funciona en tu entorno Python normal:

```
python lanzador.py
```

Debe: arrancar uvicorn, imprimir el banner y abrir el navegador en
`http://127.0.0.1:8000` mostrando el login. Cierra con `Ctrl+C`. Si esto
funciona, la compilación con PyInstaller replicará el mismo comportamiento.
