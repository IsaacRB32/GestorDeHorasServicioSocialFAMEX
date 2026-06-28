# app/api/routers/prestadores.py
"""CRUD de prestadores y catálogo de departamentos."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_db, require_auth
from app.api.schemas import PrestadorInput
from app.database import crud

router = APIRouter(tags=["prestadores"], dependencies=[Depends(require_auth)])


@router.get("/prestadores-lista")
def listar(db: sqlite3.Connection = Depends(get_db)):
    return crud.listar_prestadores(db)


@router.get("/departamentos")
def departamentos(db: sqlite3.Connection = Depends(get_db)):
    return crud.listar_departamentos(db)


@router.post("/prestadores")
def crear(datos: PrestadorInput, db: sqlite3.Connection = Depends(get_db)):
    ok = crud.registrar_prestador(
        db, datos.id_checador, datos.nombre, datos.departamento,
        datos.fecha_inicio, datos.fecha_termino, datos.horas_obligatorias, datos.sexo,
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El ID Checador ya existe en el sistema",
        )
    return {"mensaje": "Prestador creado exitosamente"}


@router.put("/prestadores/{id_checador}")
def actualizar(id_checador: int, datos: PrestadorInput, db: sqlite3.Connection = Depends(get_db)):
    filas = crud.actualizar_prestador(
        db, id_checador, datos.nombre, datos.departamento, datos.sexo,
        datos.fecha_inicio, datos.fecha_termino, datos.horas_obligatorias,
    )
    if filas == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prestador no encontrado")
    return {"mensaje": "Prestador actualizado exitosamente"}


@router.delete("/prestadores/{id_checador}")
def eliminar(id_checador: int, db: sqlite3.Connection = Depends(get_db)):
    if not crud.eliminar_prestador(db, id_checador):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prestador no encontrado o error al eliminar",
        )
    return {"mensaje": f"Prestador {id_checador} dado de baja exitosamente"}
