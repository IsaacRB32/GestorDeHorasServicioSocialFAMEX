# app/api/routers/analitica.py
"""Agregados globales para la vista de analítica."""
import sqlite3

from fastapi import APIRouter, Depends

from app.api.deps import get_db, require_auth
from app.database import crud

router = APIRouter(tags=["analitica"], dependencies=[Depends(require_auth)])


@router.get("/analitica-general")
def analitica(db: sqlite3.Connection = Depends(get_db)):
    return crud.obtener_analitica(db)
