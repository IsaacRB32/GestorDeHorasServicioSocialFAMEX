from fastapi import FastAPI, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
import os
import shutil

from app.database.db_config import inicializar_bd
from app.database.crud import obtener_resumen_prestador, guardar_registros_diarios, registrar_prestador
from app.services.procesador_excel import procesar_reporte_asistencia
from app.database.db_config import inicializar_bd, obtener_conexion

# Aseguramos que la BD exista y tenga a nuestro sujeto de prueba
inicializar_bd()
registrar_prestador(1, "ALEXIA BERNAL", "LOGISTICA", "2026-01-01", "2026-07-01", 480)

app = FastAPI(title="Sistema de Asistencias")

# Endpoint para subir el Excel
@app.post("/api/upload-reporte")
async def upload_reporte(file: UploadFile = File(...)):
    ruta_destino = f"data/{file.filename}"
    with open(ruta_destino, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    datos = procesar_reporte_asistencia(ruta_destino)
    
    # 1. Registramos a todos los prestadores que venían en el Excel automáticamente
    for p in datos["prestadores"]:
        registrar_prestador(p["id_checador"], p["nombre"], p["departamento"], "2026-01-01", "2026-07-01", 480)
        
    # 2. Guardamos sus horas
    guardar_registros_diarios(datos["registros"])
    
    return {"mensaje": "Éxito", "procesados": len(datos["registros"])}

# Endpoint del Dashboard
@app.get("/api/dashboard/{id_prestador}")
async def dashboard_api(id_prestador: int):
    datos = obtener_resumen_prestador(id_prestador)
    if datos and datos["total_hecho"] is not None:
        progreso = (datos["total_hecho"] / datos["horas_obligatorias"]) * 100
        return {"id": id_prestador, "horas_acumuladas": round(datos["total_hecho"], 2), "progreso": round(progreso, 2)}
    return {"id": id_prestador, "horas_acumuladas": 0, "progreso": 0}

app.mount("/ui", StaticFiles(directory="ui"), name="ui")

@app.get("/api/prestadores-lista")
def obtener_prestadores():
    conn = obtener_conexion()
    cursor = conn.cursor()
    try:
        # Añadimos 'departamento' a la consulta SQL
        cursor.execute("SELECT id_checador, nombre, departamento FROM prestadores")
        rows = cursor.fetchall()
        
        # Mapeamos los 3 datos
        lista_prestadores = [
            {"id": row["id_checador"], "nombre": row["nombre"], "departamento": row["departamento"]} 
            for row in rows
        ]
        return lista_prestadores
    finally:
        conn.close()