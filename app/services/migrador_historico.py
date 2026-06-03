import pandas as pd
import calendar

MES_MAP = {
    'Enero': 1, 'Febrero': 2, 'Marzo': 3, 'Abril': 4,
    'Mayo': 5, 'Junio': 6, 'Julio': 7, 'Agosto': 8,
    'Septiembre': 9, 'Octubre': 10, 'Noviembre': 11, 'Diciembre': 12
}

JUSTIFICANTES = {'J', 'J ', 'P'}
FALTAS = {'X', 'X ', 'N'}

# Mapa de normalización: cualquier variante → nombre canónico
_DEPTO_MAP = {
    'LOGISTICA': 'LOGISTICA', 'LOGÍSTICA': 'LOGISTICA',
    'OPERACIONES': 'OPERACIONES',
    'COMERCIAL': 'COMERCIAL',
    'PUBLICIDAD': 'PUBLICIDAD',
    'RELACIONES PUBLICAS': 'RELACIONES PUBLICAS',
    'RELACIONES PÚBLICAS': 'RELACIONES PUBLICAS',
    'ADQUISICIONES': 'ADQUISICIONES',
    'GENERAL': 'General',
}

def normalizar_departamento(raw):
    if not raw or str(raw).strip().lower() in ('', 'nan', 'none'):
        return 'General'
    limpio = str(raw).strip()
    clave = limpio.upper().replace('Á','A').replace('É','E').replace('Í','I').replace('Ó','O').replace('Ú','U')
    return _DEPTO_MAP.get(clave, limpio.upper())


def procesar_seguimiento_historico(ruta_excel):
    df = pd.read_excel(ruta_excel, sheet_name='SS 2026', header=None)
    df = df.iloc[1:].reset_index(drop=True)

    prestadores = {}
    registros = []

    for _, row in df.iterrows():
        id_raw = row.iloc[1]
        if pd.isna(id_raw) or str(id_raw).strip() in ('', 'nan'):
            continue
        try:
            id_checador = int(float(id_raw))
        except (ValueError, TypeError):
            continue

        mes_num_raw = row.iloc[4]
        if pd.isna(mes_num_raw):
            continue
        try:
            mes_num = int(float(mes_num_raw))
        except (ValueError, TypeError):
            continue

        # First occurrence per ID wins (legacy data has duplicate IDs)
        if mes_num == 1:
            nombre_raw = row.iloc[2]
            depto_raw = row.iloc[3]
            if pd.notna(nombre_raw) and str(nombre_raw).strip() not in ('', 'nan'):
                if id_checador not in prestadores:
                    prestadores[id_checador] = {
                        'id_checador': id_checador,
                        'nombre': str(nombre_raw).strip(),
                        'departamento': normalizar_departamento(depto_raw)
                    }

        mes_str = str(row.iloc[5]).strip() if pd.notna(row.iloc[5]) else None
        if not mes_str or mes_str not in MES_MAP:
            continue

        mes_real = MES_MAP[mes_str]
        anio = 2026
        dias_en_mes = calendar.monthrange(anio, mes_real)[1]

        for dia in range(1, 32):
            if dia > dias_en_mes:
                break
            col_idx = dia + 5  # col 6 = day 1
            if col_idx >= len(row.index):
                break

            val = row.iloc[col_idx]
            if pd.isna(val):
                continue
            val_str = str(val).strip().upper()
            if val_str in ('', '-', 'NAN'):
                continue

            fecha = f"{anio}-{mes_real:02d}-{dia:02d}"

            if val_str in JUSTIFICANTES:
                registros.append({
                    'id_checador': id_checador, 'fecha': fecha,
                    'entrada': None, 'salida': None,
                    'horas': 0.0, 'estatus': 'Justificante'
                })
            elif val_str in FALTAS:
                registros.append({
                    'id_checador': id_checador, 'fecha': fecha,
                    'entrada': None, 'salida': None,
                    'horas': 0.0, 'estatus': 'Falta'
                })
            else:
                try:
                    horas = float(val)
                    if horas > 24 and dia == 1 and mes_num == 1:
                        # Pre-period balance → stored as 2025-12-31 synthetic record
                        registros.append({
                            'id_checador': id_checador, 'fecha': '2025-12-31',
                            'entrada': None, 'salida': None,
                            'horas': horas, 'estatus': 'Saldo Inicial'
                        })
                    elif 0 < horas <= 24:
                        registros.append({
                            'id_checador': id_checador, 'fecha': fecha,
                            'entrada': None, 'salida': None,
                            'horas': horas, 'estatus': 'Asistencia'
                        })
                except (ValueError, TypeError):
                    pass

    return {
        'prestadores': list(prestadores.values()),
        'registros': registros
    }