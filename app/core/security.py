# app/core/security.py
"""Autenticación y gestión de sesiones (blindada y persistente).

Las sesiones se guardan en data/sesiones.json para SOBREVIVIR reinicios del
servidor (p. ej. uvicorn --reload). Antes vivían solo en memoria, por lo que
cada reinicio invalidaba todos los tokens y el frontend recibía 401 al cargar.
"""
import hashlib
import json
import os
import secrets
import threading
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core import config

_SESIONES_PATH = os.path.join(config.DATA_DIR, "sesiones.json")
_lock = threading.Lock()

# auto_error=False: no rompe los endpoints públicos (login, estáticos).
_bearer = HTTPBearer(auto_error=False)


def _cargar_sesiones() -> dict:
    """Carga sesiones desde disco, descartando las ya expiradas."""
    try:
        with open(_SESIONES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, ValueError, OSError):
        return {}
    ahora = time.time()
    return {
        t: s for t, s in data.items()
        if isinstance(s, dict) and ahora - s.get("creado", 0) <= config.TOKEN_TTL_SEGUNDOS
    }


def _guardar_sesiones() -> None:
    """Persiste el almacén de sesiones (best-effort, sin romper la request)."""
    try:
        os.makedirs(config.DATA_DIR, exist_ok=True)
        tmp = _SESIONES_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_sesiones_activas, f)
        os.replace(tmp, _SESIONES_PATH)
    except OSError:
        pass


# Estado en memoria, hidratado desde disco al importar el módulo.
_sesiones_activas: dict[str, dict] = _cargar_sesiones()


def hash_clave(clave: str) -> str:
    """SHA-256 hex de la contraseña."""
    return hashlib.sha256(clave.encode()).hexdigest()


def autenticar(usuario: str, clave: str) -> bool:
    """Valida credenciales en tiempo constante (mitiga timing attacks)."""
    usuario_ok = secrets.compare_digest(usuario, config.ADMIN_USUARIO)
    clave_ok = secrets.compare_digest(hash_clave(clave), config.ADMIN_CLAVE_HASH)
    return usuario_ok and clave_ok


def crear_token(usuario: str) -> str:
    """Genera, almacena y persiste un token de sesión de 64 hex chars."""
    token = secrets.token_hex(32)
    with _lock:
        _sesiones_activas[token] = {"usuario": usuario, "creado": time.time()}
        _guardar_sesiones()
    return token


def verificar_token(token: str) -> bool:
    """True si el token existe y no ha expirado; purga el token si caducó."""
    with _lock:
        sesion = _sesiones_activas.get(token)
        if not sesion:
            return False
        if time.time() - sesion["creado"] > config.TOKEN_TTL_SEGUNDOS:
            del _sesiones_activas[token]
            _guardar_sesiones()
            return False
        return True


def revocar_token(token: str) -> None:
    """Invalida un token (logout server-side). Idempotente."""
    with _lock:
        if _sesiones_activas.pop(token, None) is not None:
            _guardar_sesiones()


def require_auth(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """Dependency de FastAPI: exige 'Authorization: Bearer <token>' válido."""
    if cred is None or not verificar_token(cred.credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida o expirada",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return cred.credentials
