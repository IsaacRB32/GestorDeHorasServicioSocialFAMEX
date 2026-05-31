import sqlite3
import os

# Rutas dinámicas para que funcione en cualquier PC
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "asistencias.db")

def obtener_conexion():
    """Crea y retorna la conexión a SQLite de forma segura."""
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    
    conn = sqlite3.connect(DB_PATH)
    # Permite acceder a las columnas por nombre como si fueran diccionarios
    conn.row_factory = sqlite3.Row 
    return conn

def inicializar_bd():
    """Crea las tablas estrictamente alineadas a los requerimientos."""
    conn = obtener_conexion()
    cursor = conn.cursor()

    # REQUERIMIENTO 1: Módulo de Administración de Prestadores
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS prestadores (
            id_checador INTEGER PRIMARY KEY,
            nombre TEXT NOT NULL,
            departamento TEXT NOT NULL,
            fecha_inicio DATE,
            fecha_termino DATE,
            horas_obligatorias INTEGER DEFAULT 480,
            estatus TEXT DEFAULT 'Activo'
        )
    ''')

    # REQUERIMIENTO 2 y 3: Motor de Ingesta y Persistencia de Registros
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS registros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_checador INTEGER,
            fecha DATE NOT NULL,
            hora_entrada TEXT,
            hora_salida TEXT,
            horas_trabajadas REAL DEFAULT 0.0,
            requiere_revision BOOLEAN DEFAULT 0,
            estatus TEXT DEFAULT 'Asistencia', -- NUEVA COLUMNA
            FOREIGN KEY(id_checador) REFERENCES prestadores(id_checador),
            UNIQUE(id_checador, fecha) 
        )
    ''')

    # REQUERIMIENTO 4: Gestión de Justificaciones y Excepciones
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS justificaciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_checador INTEGER,
            fecha DATE NOT NULL,
            motivo TEXT,
            FOREIGN KEY(id_checador) REFERENCES prestadores(id_checador),
            UNIQUE(id_checador, fecha)
        )
    ''')

    conn.commit()
    conn.close()

# Script de autoejecución para crear la base de datos la primera vez
if __name__ == "__main__":
    inicializar_bd()
    print(f"Base de datos SQLite creada exitosamente en: {DB_PATH}")