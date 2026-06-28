# app/core/config.py
"""Configuración central del sistema FAMEX Control.

Todos los parámetros sensibles o desplegables admiten override por variable
de entorno, manteniendo defaults seguros para el uso local mono-usuario.
"""
import os
import hashlib

# --- Rutas del proyecto (resueltas dinámicamente) ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "asistencias.db")
UI_DIR = os.path.join(BASE_DIR, "ui")

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
