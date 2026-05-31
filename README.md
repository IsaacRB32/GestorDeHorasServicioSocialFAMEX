# GestorDeHorasServicioSocialFAMEX

/sistema_servicio_social
│
├── /app
│   ├── /api            # Endpoints (FastAPI)
│   ├── /database       # SQLite (Persistencia)
│   └── /services       # Procesamiento de Excel (Pandas)
│
├── /ui                 # La cara "bonita" del sistema
│   ├── index.html      # El Dashboard
│   ├── /css
│   │   └── style.css   # Archivo generado por Tailwind (Offline)
│   ├── /js
│   │   ├── main.js     # Lógica de comunicación con el backend
│   │   └── chart.min.js # Librería descargada (Offline)
│   └── /assets         # Logos e imágenes locales
│
├── main.py             # Punto de arranque (Lanza el servidor)
└── requirements.txt