# app/api/routers/registros.py
"""Ingesta de reportes (checador + histórico) y edición de días."""
import os
import shutil
import sqlite3

from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import get_db
from app.api.schemas import EdicionDia
from app.core import config
from app.database import crud
from app.services.procesador_excel import procesar_reporte_asistencia
from app.services.migrador_historico import procesar_seguimiento_historico

router = APIRouter(tags=["registros"])


def _guardar_subida(file: UploadFile) -> str:
    """Persiste el archivo subido en data/, sanitizando el nombre (anti path-traversal)."""
    os.makedirs(config.DATA_DIR, exist_ok=True)
    nombre_seguro = os.path.basename(file.filename or "upload.xlsx")
    ruta = os.path.join(config.DATA_DIR, nombre_seguro)
    with open(ruta, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return ruta


@router.post("/upload-reporte")
async def upload_reporte(file: UploadFile = File(...), db: sqlite3.Connection = Depends(get_db)):
    ruta = _guardar_subida(file)
    datos = procesar_reporte_asistencia(ruta)

    # 1. Alta automática de prestadores nuevos del Excel.
    for p in datos["prestadores"]:
        crud.registrar_prestador(
            db, p["id_checador"], p["nombre"], p["departamento"],
            config.PERIODO_INICIO, config.PERIODO_TERMINO, config.HORAS_OBLIGATORIAS_DEFAULT,
        )

    # 2. Persistencia de registros (executemany).
    procesados = crud.guardar_registros_diarios(db, datos["registros"])

    # 3. Tabla agrupada por prestador para el PDF client-side.
    nombre_map = {p["id_checador"]: p["nombre"] for p in datos["prestadores"]}
    grupos: dict = {}
    for reg in datos["registros"]:
        grupos.setdefault(reg["id_checador"], []).append({
            "fecha": reg["fecha"],
            "horas": reg["horas"],
            "horas_exactas": reg.get("horas_exactas", reg["horas"]),
        })
    tabla_pdf = [
        {"id": pid, "nombre": nombre_map.get(pid, f"ID {pid}"), "registros": regs}
        for pid, regs in grupos.items()
    ]

    return {"mensaje": "Éxito", "procesados": procesados, "tabla_pdf": tabla_pdf}


@router.post("/migrar-historico")
async def migrar_historico(file: UploadFile = File(...), db: sqlite3.Connection = Depends(get_db)):
    ruta = _guardar_subida(file)
    datos = procesar_seguimiento_historico(ruta)

    registrados = 0
    for p in datos["prestadores"]:
        if crud.registrar_prestador(
            db, p["id_checador"], p["nombre"], p["departamento"],
            config.PERIODO_INICIO, config.PERIODO_TERMINO, config.HORAS_OBLIGATORIAS_DEFAULT,
        ):
            registrados += 1

    insertados = crud.guardar_registros_historicos(db, datos["registros"])

    return {
        "mensaje": "Migración completada",
        "prestadores_nuevos": registrados,
        "registros_insertados": insertados,
    }


@router.post("/actualizar-dia")
async def actualizar_dia(datos: EdicionDia, db: sqlite3.Connection = Depends(get_db)):
    exito = crud.actualizar_estatus_dia(db, datos.id_checador, datos.fecha, datos.horas, datos.estatus)
    return {"mensaje": "Día actualizado correctamente", "exito": exito}
