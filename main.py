from fastapi import FastAPI, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
import os
import shutil

from app.database.db_config import inicializar_bd
from app.database.crud import obtener_resumen_prestador, guardar_registros_diarios, registrar_prestador
from app.services.procesador_excel import procesar_reporte_asistencia
from app.database.db_config import inicializar_bd, obtener_conexion
from pydantic import BaseModel
from app.database.crud import actualizar_estatus_dia, guardar_registros_historicos, eliminar_prestador
from app.services.migrador_historico import procesar_seguimiento_historico

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

    # 3. Construir tabla_pdf agrupada por prestador para el cliente
    nombre_map = {p["id_checador"]: p["nombre"] for p in datos["prestadores"]}
    grupos: dict = {}
    for reg in datos["registros"]:
        pid = reg["id_checador"]
        if pid not in grupos:
            grupos[pid] = []
        grupos[pid].append({"fecha": reg["fecha"], "horas": reg["horas"]})

    tabla_pdf = [
        {"id": pid, "nombre": nombre_map.get(pid, f"ID {pid}"), "registros": regs}
        for pid, regs in grupos.items()
    ]

    return {"mensaje": "Éxito", "procesados": len(datos["registros"]), "tabla_pdf": tabla_pdf}

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

@app.get("/api/seguimiento-datos")
def obtener_datos_seguimiento():
    conn = obtener_conexion()
    cursor = conn.cursor()
    
    try:
        # 1. Traer a todos los prestadores
        cursor.execute("SELECT id_checador, nombre, departamento FROM prestadores")
        prestadores = cursor.fetchall()
        
        resultado = []
        
        for p in prestadores:
            p_id = p["id_checador"]
            
            # 2. Traer todos los registros de ese prestador ordenados por fecha
            cursor.execute("SELECT fecha, horas_trabajadas, estatus FROM registros WHERE id_checador = ? ORDER BY fecha ASC", (p_id,))
            registros_bd = cursor.fetchall()
            
            # 3. Calcular totales
            horas_totales = sum([r["horas_trabajadas"] for r in registros_bd])
            faltas = len([r for r in registros_bd if r["estatus"] == "Falta"])
            justificantes = len([r for r in registros_bd if r["estatus"] == "Justificante"])
            
            # 4. Dar formato a la lista de registros
            lista_registros = [{"fecha": r["fecha"], "horas": r["horas_trabajadas"], "estatus": r["estatus"]} for r in registros_bd]
            
            resultado.append({
                "id": p_id,
                "nombre": p["nombre"],
                "departamento": p["departamento"],
                "horas_totales": round(horas_totales, 2),
                "faltas": faltas,
                "justificantes": justificantes,
                "registros": lista_registros
            })
            
        return resultado
    finally:
        conn.close()

# 2. Define la estructura de datos que va a recibir
class EdicionDia(BaseModel):
    id_checador: int
    fecha: str
    horas: float
    estatus: str

# 3. Pega este endpoint en cualquier parte abajo de tus otras rutas
@app.post("/api/actualizar-dia")
async def actualizar_dia(datos: EdicionDia):
    # Llama a la función de SQLite que creamos en el paso anterior
    exito = actualizar_estatus_dia(datos.id_checador, datos.fecha, datos.horas, datos.estatus)
    return {"mensaje": "Día actualizado correctamente", "exito": exito}

@app.get("/api/analitica-general")
def obtener_analitica():
    conn = obtener_conexion()
    cursor = conn.cursor()
    # Consulta para obtener horas por departamento
    cursor.execute("""
        SELECT p.departamento, SUM(r.horas_trabajadas) as total
        FROM prestadores p
        JOIN registros r ON p.id_checador = r.id_checador
        GROUP BY p.departamento
    """)
    depto_data = cursor.fetchall()
    
    # Consulta para obtener estatus global
    cursor.execute("SELECT estatus, COUNT(*) as count FROM registros GROUP BY estatus")
    estatus_data = cursor.fetchall()
    
    conn.close()
    return {
        "departamentos": [{"depto": r["departamento"], "total": r["total"]} for r in depto_data],
        "estatus": [{"estado": r["estatus"], "total": r["count"]} for r in estatus_data]
    }

@app.post("/api/migrar-historico")
async def migrar_historico(file: UploadFile = File(...)):
    ruta = f"data/{file.filename}"
    with open(ruta, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    datos = procesar_seguimiento_historico(ruta)

    registrados = 0
    for p in datos["prestadores"]:
        ok = registrar_prestador(
            p["id_checador"], p["nombre"], p["departamento"],
            "2026-01-01", "2026-07-01", 480
        )
        if ok:
            registrados += 1

    guardar_registros_historicos(datos["registros"])

    return {
        "mensaje": "Migración completada",
        "prestadores_nuevos": registrados,
        "registros_insertados": len(datos["registros"])
    }


@app.delete("/api/prestadores/{id_checador}")
async def dar_de_baja(id_checador: int):
    exito = eliminar_prestador(id_checador)
    if not exito:
        raise HTTPException(status_code=404, detail="Prestador no encontrado o error al eliminar")
    return {"mensaje": f"Prestador {id_checador} dado de baja exitosamente"}