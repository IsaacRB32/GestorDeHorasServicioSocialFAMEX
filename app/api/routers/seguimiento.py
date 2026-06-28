# app/api/routers/seguimiento.py
"""Consultas de progreso individual y seguimiento global."""
import sqlite3

from fastapi import APIRouter, Depends

from app.api.deps import get_db, require_auth
from app.database import crud

router = APIRouter(tags=["seguimiento"], dependencies=[Depends(require_auth)])


@router.get("/dashboard/{id_prestador}")
def dashboard(id_prestador: int, db: sqlite3.Connection = Depends(get_db)):
    datos = crud.obtener_resumen_prestador(db, id_prestador)
    if datos and datos["total_hecho"] is not None:
        progreso = (datos["total_hecho"] / datos["horas_obligatorias"]) * 100
        return {
            "id": id_prestador,
            "horas_acumuladas": round(datos["total_hecho"], 2),
            "progreso": round(progreso, 2),
        }
    return {"id": id_prestador, "horas_acumuladas": 0, "progreso": 0}


@router.get("/seguimiento-datos")
def seguimiento_datos(db: sqlite3.Connection = Depends(get_db)):
    return crud.obtener_datos_seguimiento(db)
