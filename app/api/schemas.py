# app/api/schemas.py
"""Modelos Pydantic de entrada/salida de la API."""
from pydantic import BaseModel

from app.core import config


class LoginInput(BaseModel):
    usuario: str
    clave: str


class TokenInput(BaseModel):
    token: str


class EdicionDia(BaseModel):
    id_checador: int
    fecha: str
    horas: float
    estatus: str


class PrestadorInput(BaseModel):
    id_checador: int
    nombre: str
    departamento: str
    sexo: str | None = None
    fecha_inicio: str = config.PERIODO_INICIO
    fecha_termino: str = config.PERIODO_TERMINO
    horas_obligatorias: int = config.HORAS_OBLIGATORIAS_DEFAULT
