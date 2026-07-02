#!/usr/bin/env python3
"""
lanzador.py — Entrypoint de escritorio de FAMEX Control.

Es el "corazon" del ejecutable (.exe). Automatiza la experiencia del usuario
final de bajos recursos:

  1. Siembra la BD inicial (si se empaqueto una semilla) en una ubicacion
     ESCRIBIBLE junto al .exe.
  2. Arranca el servidor FastAPI (uvicorn) de forma programatica.
  3. Espera a que el puerto responda y abre el navegador predeterminado en
     http://127.0.0.1:8000 automaticamente (webbrowser + hilo temporizado).
  4. Maneja el cierre limpio (cerrar la ventana o Ctrl+C detiene el servidor).

Uso en desarrollo:   python lanzador.py
Empaquetado:         ver docs/EMPAQUETADO.md
"""
import os
import sys
import time
import shutil
import socket
import threading
import webbrowser

# --- Configuracion de red (override por variables de entorno) ---
HOST = os.getenv("FAMEX_HOST", "127.0.0.1")
PORT = int(os.getenv("FAMEX_PORT", "8000"))
URL = f"http://{HOST}:{PORT}"


def _sembrar_bd_inicial() -> None:
    """Copia la BD semilla empaquetada al directorio escribible en el 1er arranque.

    Si no hay semilla, no pasa nada: bootstrap() creara una BD nueva con las
    tablas y el prestador semilla al iniciar el servidor.
    """
    try:
        from app.core import config
        os.makedirs(config.DATA_DIR, exist_ok=True)
        destino = config.DB_PATH
        origen = os.path.join(
            getattr(config, "BUNDLED_DATA_DIR", config.DATA_DIR), "asistencias.db"
        )
        if (
            not os.path.exists(destino)
            and os.path.exists(origen)
            and os.path.abspath(origen) != os.path.abspath(destino)
        ):
            shutil.copy2(origen, destino)
            print(f"[lanzador] BD inicial sembrada en: {destino}")
    except Exception as e:  # nunca abortar el arranque por la siembra
        print(f"[lanzador] Aviso: no se pudo sembrar la BD inicial ({e}). "
              f"Se creara una nueva automaticamente.")


def _esperar_y_abrir_navegador() -> None:
    """Espera (hasta ~30 s) a que el servidor acepte conexiones y abre el navegador."""
    for _ in range(60):
        try:
            with socket.create_connection((HOST, PORT), timeout=0.5):
                break
        except OSError:
            time.sleep(0.5)
    try:
        webbrowser.open(URL)
        print(f"[lanzador] Navegador abierto en {URL}")
    except Exception as e:
        print(f"[lanzador] Abre manualmente {URL} "
              f"(no se pudo abrir automaticamente: {e})")


def main() -> int:
    _sembrar_bd_inicial()

    # Import diferido: uvicorn y la app solo se cargan cuando se va a arrancar.
    import uvicorn
    from main import app

    print("=" * 60)
    print("  FAMEX Control  -  Servidor local")
    print(f"  Aplicacion disponible en: {URL}")
    print("  Para CERRAR el sistema: cierra esta ventana o pulsa Ctrl+C.")
    print("=" * 60)

    # Temporizador en hilo daemon: abre el navegador cuando el server responde.
    threading.Thread(target=_esperar_y_abrir_navegador, daemon=True).start()

    try:
        uvicorn.run(app, host=HOST, port=PORT, log_level="info")
    except KeyboardInterrupt:
        pass
    finally:
        print("\n[lanzador] Servidor detenido. Hasta pronto.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
