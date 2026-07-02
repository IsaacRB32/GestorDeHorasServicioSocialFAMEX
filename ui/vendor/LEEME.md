# ui/vendor/ — Dependencias locales (Offline-First)

El sistema FAMEX Control se distribuye como ejecutable de escritorio y **debe
funcionar sin conexión a internet**. Por eso todas las librerías estáticas
viven aquí, servidas localmente por la app.

## Contenido esperado

| Archivo | Librería | Versión |
|---|---|---|
| `tailwindcss.js` | Tailwind CSS (Play CDN) | 3.x |
| `jspdf.umd.min.js` | jsPDF | 2.5.1 |
| `jspdf.plugin.autotable.min.js` | jsPDF-AutoTable | 3.8.2 |

## Cómo poblar esta carpeta

En una máquina **con internet**, ejecuta una sola vez:

```
python descargar_dependencias.py
```

En Windows puedes hacer **doble clic** en `descargar.bat`.

Tras la descarga, el frontend no realiza **ninguna** petición a servidores
externos: Tailwind, jsPDF y AutoTable se cargan desde `ui/vendor/`, y la
tipografía usa la pila del sistema operativo (`system-ui`), sin Google Fonts.
