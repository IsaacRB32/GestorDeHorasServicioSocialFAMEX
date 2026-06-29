# app/api/routers/backup.py
"""Respaldo y recuperación de la base de datos SQLite.

- GET  /api/backup/exportar : descarga una copia consistente del .db usando el
  método nativo sqlite3 backup() (seguro con WAL).
- POST /api/backup/importar : valida y reemplaza la BD actual por la subida,
  re-aplicando las migraciones idempotentes.
Ambos endpoints exigen sesión (require_auth a nivel de router).
"""
import os
import shutil
import sqlite3
import tempfile
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.api.deps import require_auth
from app.core import config
from app.database import db_config

router = APIRouter(tags=["backup"], dependencies=[Depends(require_auth)])


def _checkpoint_wal() -> None:
    """Consolida el WAL dentro del archivo principal (evita perder escrituras)."""
    try:
        c = sqlite3.connect(config.DB_PATH)
        c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        c.close()
    except sqlite3.Error:
        pass


@router.get("/backup/exportar")
def exportar():
    """Genera y devuelve una copia íntegra de la BD (.db)."""
    if not os.path.exists(config.DB_PATH):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No existe base de datos para respaldar")
    _checkpoint_wal()

    # Temp en el MISMO directorio que la BD (mismo filesystem -> os.replace seguro).
    os.makedirs(config.DATA_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".db", dir=config.DATA_DIR)
    os.close(fd)

    # backup() nativo: snapshot consistente aunque haya escrituras concurrentes.
    src = sqlite3.connect(config.DB_PATH)
    dst = sqlite3.connect(tmp)
    try:
        with dst:
            src.backup(dst)
    finally:
        dst.close()
        src.close()

    nombre = f"famex_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    return FileResponse(
        tmp,
        media_type="application/octet-stream",
        filename=nombre,
        background=BackgroundTask(lambda: os.path.exists(tmp) and os.remove(tmp)),
    )


@router.post("/backup/importar")
async def importar(file: UploadFile = File(...)):
    """Reemplaza la BD actual por el archivo subido (con validación y respaldo previo)."""
    os.makedirs(config.DATA_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".db", dir=config.DATA_DIR)
    os.close(fd)
    with open(tmp, "wb") as buf:
        shutil.copyfileobj(file.file, buf)

    # 1) Validar: SQLite íntegro y con las tablas mínimas de FAMEX.
    try:
        chk = sqlite3.connect(tmp)
        ok = chk.execute("PRAGMA integrity_check").fetchone()
        tablas = {r[0] for r in chk.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        chk.close()
        if not ok or ok[0] != "ok":
            raise ValueError("integridad")
        if not {"prestadores", "registros"} <= tablas:
            raise ValueError("estructura")
    except (sqlite3.DatabaseError, ValueError):
        os.path.exists(tmp) and os.remove(tmp)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="El archivo no es un respaldo válido de FAMEX (.db)")

    # 2) Respaldo de seguridad del actual + limpieza de WAL/SHM.
    _checkpoint_wal()
    if os.path.exists(config.DB_PATH):
        shutil.copy2(config.DB_PATH, config.DB_PATH + ".pre_import.bak")
    for suf in ("-wal", "-shm"):
        aux = config.DB_PATH + suf
        if os.path.exists(aux):
            os.remove(aux)

    # 3) Reemplazo atómico (mismo filesystem) y reconexión de dependencias.
    os.replace(tmp, config.DB_PATH)
    db_config.bootstrap()  # re-aplica migraciones idempotentes sobre la BD importada

    return {"mensaje": "Respaldo restaurado correctamente. Recarga la página para ver los datos."}
