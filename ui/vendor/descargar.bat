@echo off
REM ==========================================================
REM  FAMEX Control - Descarga de dependencias OFFLINE (Windows)
REM  Doble clic para poblar ui/vendor/ con las librerias.
REM ==========================================================
cd /d "%~dp0"
python "%~dp0descargar_dependencias.py"
if errorlevel 1 (
    echo.
    echo Hubo un problema. Revisa tu conexion a internet.
)
echo.
pause
