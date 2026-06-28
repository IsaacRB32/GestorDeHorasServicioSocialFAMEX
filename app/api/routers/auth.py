# app/api/routers/auth.py
"""Endpoints de autenticación."""
from fastapi import APIRouter, HTTPException, status

from app.api.schemas import LoginInput, TokenInput
from app.core import security

router = APIRouter(tags=["auth"])


@router.post("/login")
async def login(datos: LoginInput):
    if not security.autenticar(datos.usuario, datos.clave):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
        )
    token = security.crear_token(datos.usuario)
    return {"token": token, "usuario": datos.usuario}


@router.post("/verificar-sesion")
async def verificar_sesion(datos: TokenInput):
    if security.verificar_token(datos.token):
        return {"valido": True}
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión inválida")
