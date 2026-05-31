import pandas as pd
from datetime import datetime

def procesar_reporte_asistencia(ruta_excel):
    df = pd.read_excel(ruta_excel, sheet_name='Registros de asistencia', header=None)
    registros_limpios = []
    prestadores_encontrados = {} # Para guardar a los prestadores sin duplicarlos
    
    for i in range(len(df)):
        fila = df.iloc[i]
        
        # Identificamos dónde empieza el bloque de cada alumno
        if pd.notna(fila.iloc[0]) and str(fila.iloc[0]).strip() == "ID.":
            
            # MAGIA AQUI: Extraemos todas las celdas con texto de esa fila
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
            
            # --- Lógica de tiempos (igual que antes) ---
            fila_fechas = df.iloc[i+1]
            fila_tiempos = df.iloc[i+3]
            
            for col in range(5):
                fecha_dia = fila_fechas.iloc[col]
                tiempo_str = str(fila_tiempos.iloc[col]).strip()
                
                if pd.notna(fecha_dia) and str(fecha_dia).strip() != 'nan' and tiempo_str != 'nan':
                    partes = tiempo_str.split('\n')
                    entrada, salida = None, None
                    horas = 0.0
                    
                    if len(partes) == 2:
                        entrada, salida = partes[0].strip(), partes[1].strip()
                        try:
                            t_ent = datetime.strptime(entrada, "%H:%M")
                            t_sal = datetime.strptime(salida, "%H:%M")
                            horas = round((t_sal - t_ent).total_seconds() / 3600.0, 2)
                        except ValueError:
                            pass
                    elif len(partes) == 1:
                        entrada = partes[0].strip()
                        
                    registros_limpios.append({
                        "id_checador": id_checador,
                        "fecha": f"2026-05-{int(float(fecha_dia)):02d}", 
                        "entrada": entrada,
                        "salida": salida,
                        "horas": horas
                    })
                    
    # Ahora devolvemos ambas cosas: los prestadores nuevos y sus registros
    return {
        "prestadores": list(prestadores_encontrados.values()), 
        "registros": registros_limpios
    }