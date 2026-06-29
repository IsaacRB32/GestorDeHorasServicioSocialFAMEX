# app/database/db_config.py
"""Bootstrap y gestión de conexiones de la base de datos SQLite."""
import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator

from app.core import config

DB_PATH = config.DB_PATH
DATA_DIR = config.DATA_DIR


def obtener_conexion() -> sqlite3.Connection:
    """Crea una conexión SQLite con FKs activas, WAL y acceso por nombre."""
    os.makedirs(DATA_DIR, exist_ok=True)
    # check_same_thread=False: el threadpool de FastAPI/Starlette atiende cada
    # request en un hilo distinto; sin esto SQLite lanza ProgrammingError. Es seguro
    # porque cada request usa su propia conexión efímera (get_db) y no se comparten
    # objetos sqlite entre hilos simultáneamente.
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Integridad referencial real (cascadas, FK enforcement).
    conn.execute("PRAGMA foreign_keys = ON")
    # WAL: mejores lecturas concurrentes y menos bloqueos en escritura.
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def get_db() -> Iterator[sqlite3.Connection]:
    """Dependency de FastAPI: una conexión por request, cierre garantizado.

    Uso en un endpoint:  def handler(db: sqlite3.Connection = Depends(get_db)): ...
    """
    conn = obtener_conexion()
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def transaccion() -> Iterator[sqlite3.Connection]:
    """Context manager transaccional: commit al salir, rollback ante excepción.

    Pensado para operaciones de escritura múltiple que deben ser atómicas.
    """
    conn = obtener_conexion()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def inicializar_bd() -> None:
    """Crea tablas, aplica migraciones idempotentes e índices. Idempotente."""
    with transaccion() as conn:
        cursor = conn.cursor()

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

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS registros (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_checador INTEGER,
                fecha DATE NOT NULL,
                hora_entrada TEXT,
                hora_salida TEXT,
                horas_trabajadas REAL DEFAULT 0.0,
                requiere_revision BOOLEAN DEFAULT 0,
                estatus TEXT DEFAULT 'Asistencia',
                FOREIGN KEY(id_checador) REFERENCES prestadores(id_checador),
                UNIQUE(id_checador, fecha)
            )
        ''')

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

        # Migración segura: columna 'sexo' en BDs preexistentes.
        try:
            cursor.execute("ALTER TABLE prestadores ADD COLUMN sexo TEXT")
        except sqlite3.OperationalError:
            pass  # Ya existe

        # Migración segura: columna 'alias' (nombre formal limpio; ver BUSINESS_LOGIC).
        try:
            cursor.execute("ALTER TABLE prestadores ADD COLUMN alias TEXT")
        except sqlite3.OperationalError:
            pass  # Ya existe

        # Índices de rendimiento.
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_registros_checador_fecha ON registros(id_checador, fecha)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_registros_estatus ON registros(estatus)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_prestadores_depto ON prestadores(departamento)')


def normalizar_departamentos_existentes() -> None:
    """Unifica variantes legacy de departamento a su forma canónica."""
    with transaccion() as conn:
        cursor = conn.cursor()
        for variante, canonico in config.DEPTO_NORMALIZACION.items():
            cursor.execute(
                "UPDATE prestadores SET departamento = ? WHERE departamento = ?",
                (canonico, variante),
            )


def asegurar_datos_semilla() -> None:
    """Garantiza el prestador semilla. Idempotente (ignora si ya existe)."""
    semilla = config.PRESTADOR_SEMILLA
    with transaccion() as conn:
        conn.execute(
            '''INSERT OR IGNORE INTO prestadores
               (id_checador, nombre, departamento, fecha_inicio, fecha_termino, horas_obligatorias)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (semilla["id_checador"], semilla["nombre"], semilla["departamento"],
             config.PERIODO_INICIO, config.PERIODO_TERMINO, config.HORAS_OBLIGATORIAS_DEFAULT),
        )


def bootstrap() -> None:
    """Pipeline de arranque completo (lo invocará el lifespan de main.py)."""
    inicializar_bd()
    asegurar_datos_semilla()
    normalizar_departamentos_existentes()


if __name__ == "__main__":
    bootstrap()
    print(f"Base de datos SQLite lista en: {DB_PATH}")
