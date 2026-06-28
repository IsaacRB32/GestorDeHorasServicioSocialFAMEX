# main.py
"""Entrypoint FastAPI: bootstrap de BD, montaje de routers y estáticos."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.core import config
from app.database.db_config import bootstrap
from app.api.routers import analitica, auth, prestadores, registros, seguimiento


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicializa la BD (tablas, semilla, normalización) una sola vez al arrancar."""
    bootstrap()
    yield


app = FastAPI(title="Sistema de Asistencias FAMEX", lifespan=lifespan)

# --- API REST (prefijo /api) ---
app.include_router(auth.router, prefix="/api")
app.include_router(prestadores.router, prefix="/api")
app.include_router(registros.router, prefix="/api")
app.include_router(seguimiento.router, prefix="/api")
app.include_router(analitica.router, prefix="/api")


@app.get("/")
async def redirigir_login():
    return RedirectResponse(url="/ui/login.html")


# --- Frontend estático (debe montarse al final) ---
app.mount("/ui", StaticFiles(directory=config.UI_DIR), name="ui")
