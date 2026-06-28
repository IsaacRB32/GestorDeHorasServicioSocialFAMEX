# app/core/security.py
"""Autenticación y gestión de sesiones en memoria (blindada)."""
import hashlib
import secrets
import threading
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core import config

# Sesiones en memoria. Protegidas con lock para evitar condiciones de carrera.
_sesiones_activas: dict[str, dict] = {}
_lock = threading.Lock()

# auto_error=False: no rompe los endpoints públicos (login, estáticos).
_bearer = HTTPBearer(auto_error=False)


def hash_clave(clave: str) -> str:
    """SHA-256 hex de la contraseña."""
    return hashlib.sha256(clave.encode()).hexdigest()


def autenticar(usuario: str, clave: str) -> bool:
    """Valida credenciales en tiempo constante (mitiga timing attacks)."""
    usuario_ok = secrets.compare_digest(usuario, config.ADMIN_USUARIO)
    clave_ok = secrets.compare_digest(hash_clave(clave), config.ADMIN_CLAVE_HASH)
    return usuario_ok and clave_ok


def crear_token(usuario: str) -> str:
    """Genera y almacena un token de sesión de 64 hex chars."""
    token = secrets.token_hex(32)
    with _lock:
        _sesiones_activas[token] = {"usuario": usuario, "creado": time.time()}
    return token


def verificar_token(token: str) -> bool:
    """True si el token existe y no ha expirado; purga el token si caducó."""
    with _lock:
        sesion = _sesiones_activas.get(token)
        if not sesion:
            return False
        if time.time() - sesion["creado"] > config.TOKEN_TTL_SEGUNDOS:
            del _sesiones_activas[token]
            return False
        return True


def revocar_token(token: str) -> None:
    """Invalida un token (logout server-side). Idempotente."""
    with _lock:
        _sesiones_activas.pop(token, None)


def require_auth(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """Dependency de FastAPI: exige 'Authorization: Bearer <token>' válido.

    Se inyecta en los routers protegidos del Paso 2. Devuelve el token validado.
    """
    if cred is None or not verificar_token(cred.credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida o expirada",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return cred.credentials
