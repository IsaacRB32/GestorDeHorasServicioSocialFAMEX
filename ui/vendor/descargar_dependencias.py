#!/usr/bin/env python3
"""
FAMEX Control - Descarga de dependencias para modo OFFLINE-FIRST.

Ejecuta este script UNA sola vez en una maquina CON internet. Descarga las
librerias estaticas (Tailwind, jsPDF, jsPDF-AutoTable) y las guarda en esta
misma carpeta (ui/vendor/). A partir de entonces el sistema funciona 100%
sin conexion (empaquetado .exe / air-gapped).

    Uso:   python descargar_dependencias.py
    (o doble clic a  descargar.bat  en Windows)
"""
import os, sys, urllib.request, ssl

AQUI = os.path.dirname(os.path.abspath(__file__))

# Cada libreria: destino -> lista de URLs espejo (se prueban en orden).
LIBRERIAS = {
    "tailwindcss.js": [
        "https://cdn.tailwindcss.com",
        "https://unpkg.com/@tailwindcss/browser@3",
    ],
    "jspdf.umd.min.js": [
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
        "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
        "https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js",
    ],
    "jspdf.plugin.autotable.min.js": [
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
        "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js",
        "https://unpkg.com/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js",
    ],
}

CTX = ssl.create_default_context()
UA  = {"User-Agent": "Mozilla/5.0 (FAMEX-Control offline vendor fetch)"}

def descargar(destino, urls):
    ruta = os.path.join(AQUI, destino)
    for url in urls:
        try:
            print(f"  -> {destino:<32} desde {url}")
            req = urllib.request.Request(url, headers=UA)
            data = urllib.request.urlopen(req, timeout=60, context=CTX).read()
            if len(data) < 1024:
                raise ValueError(f"respuesta demasiado pequena ({len(data)} bytes)")
            with open(ruta, "wb") as f:
                f.write(data)
            print(f"     OK  {len(data):,} bytes guardados en {ruta}\n")
            return True
        except Exception as e:
            print(f"     fallo ({str(e)[:70]}), probando siguiente espejo...")
    print(f"  !! NO se pudo descargar {destino} de ningun espejo.\n")
    return False

def main():
    print("=" * 64)
    print("  FAMEX Control  -  Descarga de dependencias OFFLINE")
    print("=" * 64)
    ok = 0
    for destino, urls in LIBRERIAS.items():
        if descargar(destino, urls):
            ok += 1
    print("=" * 64)
    print(f"  Completado: {ok}/{len(LIBRERIAS)} librerias descargadas.")
    if ok == len(LIBRERIAS):
        print("  El sistema ya puede ejecutarse 100% sin internet.")
    else:
        print("  Revisa tu conexion y vuelve a ejecutar el script.")
    print("=" * 64)
    return 0 if ok == len(LIBRERIAS) else 1

if __name__ == "__main__":
    sys.exit(main())
