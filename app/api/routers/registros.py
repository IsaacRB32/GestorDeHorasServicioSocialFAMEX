# app/api/routers/registros.py
"""Ingesta de reportes (checador + histórico) y edición de días.

CARGA EFÍMERA — el servidor NO archiva los .xlsx subidos:
Estrategia A (En Memoria). El archivo se lee COMPLETO en RAM con `io.BytesIO`
y se pasa así a pandas (`read_excel` acepta un buffer file-like), por lo que
NUNCA se escribe un .xlsx en el disco del servidor. La única fuente de verdad a
largo plazo es SQLite. Así el almacenamiento físico no se satura con el tiempo.
Ver `docs/BUSINESS_LOGIC.md` (§ Carga efímera).
"""
import io
import sqlite3

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.api.deps import get_db, require_auth
from app.api.schemas import EdicionDia
from app.core import config
from app.database import crud
from app.services.procesador_excel import procesar_reporte_asistencia
from app.services.migrador_historico import procesar_seguimiento_historico

router = APIRouter(tags=["registros"], dependencies=[Depends(require_auth)])


async def _leer_excel_en_memoria(file: UploadFile) -> io.BytesIO:
    """Lee el .xlsx subido COMPLETO en memoria y lo devuelve como buffer.

    No se persiste nada en disco; pandas.read_excel consume este buffer directo.
    """
    contenido = await file.read()
    if not contenido:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo está vacío o no se pudo leer.",
        )
    return io.BytesIO(contenido)


@router.post("/upload-reporte")
async def upload_reporte(file: UploadFile = File(...), db: sqlite3.Connection = Depends(get_db)):
    buffer = await _leer_excel_en_memoria(file)
    try:
        datos = procesar_reporte_asistencia(buffer)  # buffer en memoria, sin tocar disco
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se pudo procesar el Excel del checador: {e}",
        )
    finally:
        buffer.close()  # libera la memoria del buffer inmediatamente

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
    buffer = await _leer_excel_en_memoria(file)
    try:
        datos = procesar_seguimiento_historico(buffer)  # buffer en memoria, sin tocar disco
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se pudo procesar el archivo histórico: {e}",
        )
    finally:
        buffer.close()

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
