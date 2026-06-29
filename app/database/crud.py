# app/database/crud.py
"""Capa de acceso a datos. Toda función recibe la conexión por inyección.

Las funciones de escritura confirman (commit) su propia transacción salvo que
se indique; las de lectura no mutan estado. La conexión la posee el llamador
(normalmente la dependency get_db de FastAPI).
"""
import sqlite3


# ====================== ESCRITURA: PRESTADORES ======================
def registrar_prestador(conn, id_checador, nombre, departamento,
                        f_inicio, f_termino, horas_meta, sexo=None, alias=None) -> bool:
    """Alta de prestador. Retorna False si el id_checador ya existe."""
    try:
        conn.execute('''
            INSERT INTO prestadores
                (id_checador, nombre, departamento, fecha_inicio, fecha_termino, horas_obligatorias, sexo, alias)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (id_checador, nombre, departamento, f_inicio, f_termino, horas_meta, sexo, alias))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        conn.rollback()
        return False


def actualizar_prestador(conn, id_checador, nombre, departamento, sexo,
                         f_inicio, f_termino, horas_meta, alias=None) -> int:
    """Edita un prestador. Retorna nº de filas afectadas (0 = no encontrado)."""
    cur = conn.execute('''
        UPDATE prestadores
           SET nombre = ?, departamento = ?, sexo = ?, alias = ?,
               fecha_inicio = ?, fecha_termino = ?, horas_obligatorias = ?
         WHERE id_checador = ?
    ''', (nombre, departamento, sexo, alias, f_inicio, f_termino, horas_meta, id_checador))
    conn.commit()
    return cur.rowcount


def eliminar_prestador(conn, id_checador) -> bool:
    """Baja en cascada manual (registros → justificaciones → prestador)."""
    try:
        conn.execute("DELETE FROM registros WHERE id_checador = ?", (id_checador,))
        conn.execute("DELETE FROM justificaciones WHERE id_checador = ?", (id_checador,))
        cur = conn.execute("DELETE FROM prestadores WHERE id_checador = ?", (id_checador,))
        conn.commit()
        return cur.rowcount > 0
    except sqlite3.Error:
        conn.rollback()
        return False


# ====================== ESCRITURA: REGISTROS ======================
def guardar_registros_diarios(conn, lista_registros) -> int:
    """Ingesta del checador semanal. Usa executemany + INSERT OR REPLACE."""
    if not lista_registros:
        return 0
    datos = [
        (r['id_checador'], r['fecha'], r['entrada'], r['salida'], r['horas'],
         r.get('requiere_revision', 0))
        for r in lista_registros
    ]
    conn.executemany('''
        INSERT OR REPLACE INTO registros
            (id_checador, fecha, hora_entrada, hora_salida, horas_trabajadas, requiere_revision)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', datos)
    conn.commit()
    return len(datos)


def guardar_registros_historicos(conn, lista_registros) -> int:
    """Ingesta histórica con estatus explícito. Usa executemany."""
    if not lista_registros:
        return 0
    datos = [
        (r['id_checador'], r['fecha'], r.get('entrada'), r.get('salida'),
         r['horas'], r.get('estatus', 'Asistencia'))
        for r in lista_registros
    ]
    conn.executemany('''
        INSERT OR REPLACE INTO registros
            (id_checador, fecha, hora_entrada, hora_salida, horas_trabajadas, estatus)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', datos)
    conn.commit()
    return len(datos)


def actualizar_estatus_dia(conn, id_checador, fecha, nuevas_horas, nuevo_estatus) -> bool:
    """Edición de un día desde el calendario. INSERT OR REPLACE (crea o sobreescribe)."""
    # La corrección manual SIEMPRE limpia la bandera de revisión (requiere_revision = 0).
    conn.execute('''
        INSERT OR REPLACE INTO registros (id_checador, fecha, horas_trabajadas, estatus, requiere_revision)
        VALUES (?, ?, ?, ?, 0)
    ''', (id_checador, fecha, nuevas_horas, nuevo_estatus))
    conn.commit()
    return True


# ====================== LECTURA ======================
def obtener_resumen_prestador(conn, id_checador) -> dict | None:
    """Nombre, meta y total de horas de un prestador (para el dashboard)."""
    res = conn.execute('''
        SELECT p.nombre, p.horas_obligatorias, SUM(r.horas_trabajadas) AS total_hecho
          FROM prestadores p
          LEFT JOIN registros r ON p.id_checador = r.id_checador
         WHERE p.id_checador = ?
         GROUP BY p.id_checador
    ''', (id_checador,)).fetchone()
    return dict(res) if res else None


def listar_prestadores(conn) -> list[dict]:
    """Todos los prestadores con metadatos (para prestadores.html)."""
    rows = conn.execute('''
        SELECT id_checador, nombre, alias, departamento, sexo,
               fecha_inicio, fecha_termino, horas_obligatorias
          FROM prestadores
    ''').fetchall()
    return [
        {
            "id": r["id_checador"],
            "nombre": r["nombre"],
            "alias": r["alias"] or "",
            "departamento": r["departamento"],
            "sexo": r["sexo"] or "",
            "fecha_inicio": r["fecha_inicio"] or "2026-01-01",
            "fecha_termino": r["fecha_termino"] or "2026-07-01",
            "horas_obligatorias": r["horas_obligatorias"] or 480,
        }
        for r in rows
    ]


def listar_departamentos(conn) -> list[str]:
    """Departamentos distintos presentes, ordenados alfabéticamente."""
    rows = conn.execute(
        "SELECT DISTINCT departamento FROM prestadores ORDER BY departamento"
    ).fetchall()
    return [r["departamento"] for r in rows]


def obtener_datos_seguimiento(conn) -> list[dict]:
    """Todos los prestadores con su detalle de registros (single LEFT JOIN, sin N+1)."""
    filas = conn.execute('''
        SELECT p.id_checador, p.nombre, p.alias, p.departamento, p.horas_obligatorias,
               r.fecha, r.horas_trabajadas, r.estatus,
               r.requiere_revision, r.hora_entrada, r.hora_salida
          FROM prestadores p
          LEFT JOIN registros r ON p.id_checador = r.id_checador
         ORDER BY p.id_checador, r.fecha
    ''').fetchall()

    mapa: dict = {}
    for f in filas:
        pid = f["id_checador"]
        prestador = mapa.get(pid)
        if prestador is None:
            # Fallback de nombre: se prioriza el alias formal; si es NULL/vacío
            # se usa el nombre crudo del checador.
            display = (f["alias"] or "").strip() or f["nombre"]
            prestador = mapa[pid] = {
                "id": pid, "nombre": display, "nombre_checador": f["nombre"],
                "departamento": f["departamento"],
                "horas_obligatorias": f["horas_obligatorias"] or 480,
                "horas_totales": 0.0, "faltas": 0, "justificantes": 0,
                "revisiones": 0, "registros": [],
            }
        if f["fecha"] is not None:
            h = f["horas_trabajadas"] or 0.0
            est = f["estatus"] or "Asistencia"
            rev = 1 if (f["requiere_revision"] or 0) else 0
            prestador["horas_totales"] += h
            if est == "Falta":
                prestador["faltas"] += 1
            elif est == "Justificante":
                prestador["justificantes"] += 1
            if rev:
                prestador["revisiones"] += 1
            prestador["registros"].append({
                "fecha": f["fecha"], "horas": h, "estatus": est,
                "requiere_revision": rev,
                "entrada": f["hora_entrada"], "salida": f["hora_salida"],
            })

    resultado = list(mapa.values())
    for p in resultado:
        p["horas_totales"] = round(p["horas_totales"], 2)
    return resultado


def obtener_analitica(conn) -> dict:
    """Agregados globales para analitica.html (horas por depto + conteo por estatus)."""
    depto_rows = conn.execute('''
        SELECT p.departamento, SUM(r.horas_trabajadas) AS total
          FROM prestadores p
          JOIN registros r ON p.id_checador = r.id_checador
         GROUP BY p.departamento
    ''').fetchall()
    estatus_rows = conn.execute(
        "SELECT estatus, COUNT(*) AS count FROM registros GROUP BY estatus"
    ).fetchall()
    return {
        "departamentos": [{"depto": r["departamento"], "total": r["total"]} for r in depto_rows],
        "estatus": [{"estado": r["estatus"], "total": r["count"]} for r in estatus_rows],
    }
