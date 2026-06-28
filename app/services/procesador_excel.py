# app/services/procesador_excel.py
"""Parser del reporte semanal del checador ('Registros de asistencia')."""
import re
import math
from datetime import datetime

import pandas as pd

# Encabezado del checador: "Fecha:  18/05/2026 ~ 22/05/2026"
_PATRON_FECHA = re.compile(r'(\d{1,2})/(\d{1,2})/(\d{4})')


def redondear_horas(horas):
    """Redondeo reglamentario FAMEX. Réplica exacta del cliente (famex-ui.js).

    decimal ≤ 0.15      → piso
    0.15 < decimal ≤ 0.65 → media hora
    decimal > 0.65      → techo
    """
    entero = math.floor(horas)
    decimal = round(horas - entero, 2)
    if decimal <= 0.15:
        return float(entero)
    if decimal <= 0.65:
        return entero + 0.5
    return float(entero + 1)


def _detectar_periodo(df):
    """Detecta el inicio del periodo a partir del encabezado 'Fecha: DD/MM/YYYY ~ ...'.

    Retorna (dia_inicio, mes_inicio, anio_inicio). Si no se encuentra una fecha
    en la hoja, cae a la fecha actual del sistema (degradación segura).
    """
    for fila in df.itertuples(index=False):
        for celda in fila:
            if isinstance(celda, str):
                m = _PATRON_FECHA.search(celda)
                if m:
                    return int(m.group(1)), int(m.group(2)), int(m.group(3))
    hoy = datetime.now()
    return hoy.day, hoy.month, hoy.year


def _construir_fecha(dia, dia_inicio, mes_inicio, anio_inicio):
    """Arma 'YYYY-MM-DD' para un día del reporte.

    Maneja semanas que cruzan de mes (p.ej. 30/06 ~ 04/07): si el número de día
    es menor al día de inicio, significa que ya rebobinó al mes siguiente.
    """
    mes, anio = mes_inicio, anio_inicio
    if dia < dia_inicio:
        mes += 1
        if mes > 12:
            mes = 1
            anio += 1
    return f"{anio}-{mes:02d}-{dia:02d}"


def procesar_reporte_asistencia(ruta_excel):
    df = pd.read_excel(ruta_excel, sheet_name='Registros de asistencia', header=None)

    # Periodo real del reporte (dinámico, ya no hard-coded a mayo 2026).
    dia_inicio, mes_inicio, anio_inicio = _detectar_periodo(df)

    registros_limpios = []
    prestadores_encontrados = {}  # Para guardar a los prestadores sin duplicarlos

    for i in range(len(df)):
        fila = df.iloc[i]

        # Identificamos dónde empieza el bloque de cada alumno
        if pd.notna(fila.iloc[0]) and str(fila.iloc[0]).strip() == "ID.":

            # Extraemos todas las celdas con texto de esa fila
            valores = [str(x).strip() for x in fila.values if pd.notna(x) and str(x).strip() != '']

            # Buscamos la información dinámicamente
            id_checador = int(float(valores[1])) if len(valores) > 1 else 0

            nombre = "Desconocido"
            if "Nombre" in valores:
                nombre = valores[valores.index("Nombre") + 1]

            departamento = "General"
            if "Depart." in valores:
                departamento = valores[valores.index("Depart.") + 1]

            # Guardamos al prestador
            prestadores_encontrados[id_checador] = {
                "id_checador": id_checador,
                "nombre": nombre,
                "departamento": departamento
            }

            # --- Lógica de tiempos ---
            fila_fechas = df.iloc[i + 1]
            fila_tiempos = df.iloc[i + 3]

            for col in range(5):
                fecha_dia = fila_fechas.iloc[col]
                tiempo_str = str(fila_tiempos.iloc[col]).strip()

                if pd.notna(fecha_dia) and str(fecha_dia).strip() != 'nan' and tiempo_str != 'nan':
                    partes = tiempo_str.split('\n')
                    entrada, salida = None, None
                    horas = 0.0
                    horas_exactas = 0.0

                    if len(partes) == 2:
                        entrada, salida = partes[0].strip(), partes[1].strip()
                        try:
                            t_ent = datetime.strptime(entrada, "%H:%M")
                            t_sal = datetime.strptime(salida, "%H:%M")
                            horas_exactas = (t_sal - t_ent).total_seconds() / 3600.0
                            horas = redondear_horas(horas_exactas)
                        except ValueError:
                            pass
                    elif len(partes) == 1:
                        entrada = partes[0].strip()

                    registros_limpios.append({
                        "id_checador": id_checador,
                        "fecha": _construir_fecha(int(float(fecha_dia)), dia_inicio, mes_inicio, anio_inicio),
                        "entrada": entrada,
                        "salida": salida,
                        "horas": horas,
                        "horas_exactas": horas_exactas
                    })

    return {
        "prestadores": list(prestadores_encontrados.values()),
        "registros": registros_limpios
    }
