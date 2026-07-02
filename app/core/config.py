# app/core/config.py
"""Configuración central del sistema FAMEX Control.

Todos los parámetros sensibles o desplegables admiten override por variable
de entorno, manteniendo defaults seguros para el uso local mono-usuario.
"""
import os
import sys
import hashlib

# --- Rutas del proyecto (compatibles con PyInstaller / .exe) ---
# En modo CONGELADO (ejecutable PyInstaller):
#   * Los recursos de SOLO LECTURA (frontend en ui/) se extraen al temporal
#     sys._MEIPASS, así que UI_DIR apunta ahí.
#   * Los datos ESCRIBIBLES (BD SQLite, sesiones, respaldos) deben vivir JUNTO
#     al .exe para PERSISTIR entre ejecuciones; nunca dentro de _MEIPASS (que se
#     borra al cerrar). Se puede forzar otra ruta con la env FAMEX_DATA_DIR.
# En modo DESARROLLO se conserva el comportamiento original (relativo al repo).
_FROZEN = getattr(sys, "frozen", False)

if _FROZEN:
    _BUNDLE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(sys.executable)))
    _APP_DIR = os.path.dirname(os.path.abspath(sys.executable))
    BASE_DIR = _BUNDLE_DIR
    UI_DIR = os.path.join(_BUNDLE_DIR, "ui")
    DATA_DIR = os.getenv("FAMEX_DATA_DIR", os.path.join(_APP_DIR, "data"))
    # BD semilla opcional empaquetada dentro del bundle (solo lectura); el
    # lanzador la copia a DATA_DIR en el primer arranque si no existe una.
    BUNDLED_DATA_DIR = os.path.join(_BUNDLE_DIR, "data")
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    UI_DIR = os.path.join(BASE_DIR, "ui")
    DATA_DIR = os.getenv("FAMEX_DATA_DIR", os.path.join(BASE_DIR, "data"))
    BUNDLED_DATA_DIR = DATA_DIR

DB_PATH = os.path.join(DATA_DIR, "asistencias.db")

# --- Credenciales de administrador ---
# En producción, exportar FAMEX_ADMIN_HASH para no depender del default embebido:
#   python -c "import hashlib; print(hashlib.sha256('nueva_clave'.encode()).hexdigest())"
ADMIN_USUARIO = os.getenv("FAMEX_ADMIN_USER", "admin")
_CLAVE_DEFAULT = "famex2026"
ADMIN_CLAVE_HASH = os.getenv(
    "FAMEX_ADMIN_HASH",
    hashlib.sha256(_CLAVE_DEFAULT.encode()).hexdigest(),
)

# --- Sesión ---
TOKEN_TTL_SEGUNDOS = int(os.getenv("FAMEX_TOKEN_TTL", str(8 * 60 * 60)))  # 8 horas

# --- Defaults de negocio (FAMEX 2026/2027) ---
PERIODO_INICIO = os.getenv("FAMEX_PERIODO_INICIO", "2026-01-01")
PERIODO_TERMINO = os.getenv("FAMEX_PERIODO_TERMINO", "2026-07-01")
HORAS_OBLIGATORIAS_DEFAULT = int(os.getenv("FAMEX_HORAS_META", "480"))

# --- Datos semilla ---
PRESTADOR_SEMILLA = {
    "id_checador": 1,
    "nombre": "ALEXIA BERNAL",
    "departamento": "LOGISTICA",
}

# --- Departamentos canónicos ---
DEPARTAMENTOS_CANONICOS = [
    "LOGISTICA", "OPERACIONES", "COMERCIAL", "PUBLICIDAD",
    "RELACIONES PUBLICAS", "ADQUISICIONES", "General",
]

# Mapa de normalización legacy → canónico (antes en main.py)
DEPTO_NORMALIZACION = {
    "LOGÍSTICA": "LOGISTICA", "Logística": "LOGISTICA", "Logistica": "LOGISTICA", "logistica": "LOGISTICA",
    "RELACIONES PÚBLICAS": "RELACIONES PUBLICAS", "Relaciones Públicas": "RELACIONES PUBLICAS",
    "Relaciones Publicas": "RELACIONES PUBLICAS", "relaciones publicas": "RELACIONES PUBLICAS",
    "OPERACIONES": "OPERACIONES", "Operaciones": "OPERACIONES", "operaciones": "OPERACIONES",
    "COMERCIAL": "COMERCIAL", "Comercial": "COMERCIAL", "comercial": "COMERCIAL",
    "PUBLICIDAD": "PUBLICIDAD", "Publicidad": "PUBLICIDAD", "publicidad": "PUBLICIDAD",
    "ADQUISICIONES": "ADQUISICIONES", "Adquisiciones": "ADQUISICIONES",
}
