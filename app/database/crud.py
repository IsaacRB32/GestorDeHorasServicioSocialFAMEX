import sqlite3
from app.database.db_config import obtener_conexion

# --- REQUERIMIENTO 1: Alta de Prestadores ---
def registrar_prestador(id_checador, nombre, departamento, f_inicio, f_termino, horas_meta, sexo=None):
    conn = obtener_conexion()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO prestadores (id_checador, nombre, departamento, fecha_inicio, fecha_termino, horas_obligatorias, sexo)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (id_checador, nombre, departamento, f_inicio, f_termino, horas_meta, sexo))
        conn.commit()
    except sqlite3.IntegrityError:
        return False # El ID ya existe
    finally:
        conn.close()
    return True

# --- REQUERIMIENTO 2 Y 3: Ingesta de Registros ---
def guardar_registros_diarios(lista_registros):
    """
    Recibe la lista procesada por el servicio de Excel y los guarda en la BD.
    Usa 'INSERT OR REPLACE' para manejar las actualizaciones si el registro ya existe.
    """
    conn = obtener_conexion()
    cursor = conn.cursor()
    
    for reg in lista_registros:
        cursor.execute('''
            INSERT OR REPLACE INTO registros (id_checador, fecha, hora_entrada, hora_salida, horas_trabajadas)
            VALUES (?, ?, ?, ?, ?)
        ''', (reg['id_checador'], reg['fecha'], reg['entrada'], reg['salida'], reg['horas']))
        
    conn.commit()
    conn.close()

# --- REQUERIMIENTO 4: Consulta para el Dashboard ---
def obtener_resumen_prestador(id_checador):
    conn = obtener_conexion()
    # Usamos Row para acceder a datos como diccionario: row['nombre']
    cursor = conn.cursor()
    
    # Consulta combinada: Prestador + Suma de horas
    cursor.execute('''
        SELECT p.nombre, p.horas_obligatorias, SUM(r.horas_trabajadas) as total_hecho
        FROM prestadores p
        LEFT JOIN registros r ON p.id_checador = r.id_checador
        WHERE p.id_checador = ?
        GROUP BY p.id_checador
    ''', (id_checador,))
    
    res = cursor.fetchone()
    conn.close()
    return dict(res) if res else None

# --- MIGRACIÓN HISTÓRICA: inserción con estatus explícito ---
def guardar_registros_historicos(lista_registros):
    conn = obtener_conexion()
    cursor = conn.cursor()
    for reg in lista_registros:
        cursor.execute('''
            INSERT OR REPLACE INTO registros
                (id_checador, fecha, hora_entrada, hora_salida, horas_trabajadas, estatus)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (reg['id_checador'], reg['fecha'], reg.get('entrada'), reg.get('salida'),
              reg['horas'], reg.get('estatus', 'Asistencia')))
    conn.commit()
    conn.close()

# --- TAREA 2: Eliminación por Cumplimiento ---
def eliminar_prestador(id_checador):
    conn = obtener_conexion()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM registros WHERE id_checador = ?", (id_checador,))
        cursor.execute("DELETE FROM justificaciones WHERE id_checador = ?", (id_checador,))
        cursor.execute("DELETE FROM prestadores WHERE id_checador = ?", (id_checador,))
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()

# --- REQUERIMIENTO 5: Edición de Calendario Mensual ---
def actualizar_estatus_dia(id_checador, fecha, nuevas_horas, nuevo_estatus):
    """Permite editar un día específico desde el calendario interactivo"""
    conn = obtener_conexion()
    cursor = conn.cursor()
    
    # Usamos INSERT OR REPLACE por si el día estaba en blanco (no existía en la BD)
    cursor.execute('''
        INSERT OR REPLACE INTO registros (id_checador, fecha, horas_trabajadas, estatus)
        VALUES (
            ?, ?, ?, ?
        )
    ''', (id_checador, fecha, nuevas_horas, nuevo_estatus))
    
    conn.commit()
    conn.close()
    return True