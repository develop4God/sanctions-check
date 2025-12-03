# Localhost Development Setup Guide

Este documento proporciona instrucciones detalladas para configurar y ejecutar Sanctions Check en tu máquina local para desarrollo y pruebas.

## Requisitos Previos

### Software Requerido

- **Python 3.11+** - [Descargar](https://www.python.org/downloads/)
- **Node.js 16+** - [Descargar](https://nodejs.org/)
- **npm** (incluido con Node.js)

### Software Opcional (Recomendado)

- **Docker y Docker Compose** - Para ejecución con contenedores
- **Git** - Para clonar el repositorio

## Verificación Rápida del Entorno

Antes de comenzar, ejecuta el script de validación:

```bash
./test_localhost_setup.sh
```

Este script verificará que todas las dependencias estén instaladas y los puertos disponibles.

## Opción 1: Desarrollo Sin Docker (Recomendado para Desarrollo Activo)

### Paso 1: Instalar Dependencias del Backend

```bash
# Navegar al directorio del backend
cd python

# Instalar dependencias de Python
pip install -r requirements.txt

# Verificar instalación
python3 -c "import fastapi; import jinja2; print('✓ Dependencias instaladas correctamente')"
```

### Paso 2: Configurar Variables de Entorno del Backend

Crea un archivo `.env` en el directorio `python/`:

```bash
# python/.env
API_HOST=127.0.0.1
API_PORT=8000
DATA_DIR=sanctions_data
CONFIG_PATH=config.yaml
```

### Paso 3: Iniciar el Backend

```bash
# Desde el directorio python/
uvicorn api.server:app --reload --port 8000
```

El backend estará disponible en:
- **API**: http://localhost:8000
- **Documentación Interactiva**: http://localhost:8000/api/docs
- **ReDoc**: http://localhost:8000/api/redoc

### Paso 4: Instalar Dependencias del Frontend

En una **nueva terminal**:

```bash
# Navegar al directorio del frontend
cd frontend

# Instalar dependencias de Node.js
npm install
```

### Paso 5: Configurar Variables de Entorno del Frontend

Crea un archivo `.env.local` en el directorio `frontend/`:

```bash
# frontend/.env.local
REACT_APP_API_URL=http://localhost:8000
```

### Paso 6: Iniciar el Frontend

```bash
# Desde el directorio frontend/
npm start
```

El frontend se abrirá automáticamente en:
- **Aplicación Web**: http://localhost:3000

## Opción 2: Desarrollo Con Docker Compose (Más Fácil)

### Paso 1: Iniciar Todos los Servicios

```bash
# Desde el directorio raíz del proyecto
docker-compose up --build
```

Esto iniciará:
- **Backend** en http://localhost:8000
- **Frontend** en http://localhost:3000
- **PostgreSQL** en localhost:5432 (interno)

### Paso 2: Detener los Servicios

```bash
# Detener sin eliminar volúmenes
docker-compose down

# Detener y eliminar volúmenes (base de datos)
docker-compose down -v
```

## Probar la Integración Backend-Frontend

### Prueba 1: Verificar Conectividad

1. Abre el frontend en http://localhost:3000
2. Espera a que el indicador de estado muestre "Servicio Disponible"
3. Si ves "Conectando..." permanentemente, verifica:
   - Backend está corriendo en puerto 8000
   - REACT_APP_API_URL está correctamente configurado
   - CORS está habilitado en el backend

### Prueba 2: Screening Individual

1. Ve a la pestaña "Individual"
2. Ingresa:
   - **Nombre**: `Vladimir Putin`
   - **País**: `RU`
3. Haz clic en "Verificar"
4. Deberías ver coincidencias en las listas de sanciones

### Prueba 3: Generación de Reportes

1. Después de realizar un screening, haz clic en "Ver Reporte"
2. Se abrirá una nueva pestaña con el reporte HTML
3. Verifica que:
   - Los porcentajes estén en rango 0-100% (NO 825%)
   - El reporte incluya metadatos (ID screening, fecha, listas consultadas)
   - El botón de imprimir funcione

### Prueba 4: Screening Masivo

1. Ve a la pestaña "Masivo"
2. Descarga la plantilla CSV
3. Haz clic en "Procesar Archivo"
4. Verifica que los reportes se generen correctamente

## Ejecutar Tests

### Tests del Backend

```bash
cd python

# Ejecutar todos los tests
pytest -v

# Ejecutar solo tests de reportes
pytest tests/test_report_generation.py -v

# Ejecutar con coverage
pytest --cov=. --cov-report=html
```

### Tests del Frontend

```bash
cd frontend

# Ejecutar tests
npm test

# Ejecutar tests con coverage
npm test -- --coverage
```

## Desarrollo de la Aplicación Electron

### Modo de Desarrollo

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar en modo desarrollo (React + Electron)
npm run electron:dev
```

Esto:
1. Inicia el servidor de desarrollo de React en puerto 3000
2. Lanza la aplicación Electron apuntando al servidor de desarrollo
3. Habilita hot-reload para desarrollo rápido

### Build de la Aplicación Electron

```bash
cd frontend

# Build para tu plataforma actual
npm run electron:build

# Build específico para Windows
npm run electron:build:win

# Build específico para macOS
npm run electron:build:mac

# Build específico para Linux
npm run electron:build:linux
```

Los instaladores se generarán en `frontend/dist/`.

## Desarrollo PWA (Progressive Web App)

La aplicación ya está configurada como PWA. Para probar:

1. Hacer build de producción:
```bash
cd frontend
npm run build
```

2. Servir el build con un servidor HTTP:
```bash
npx serve -s build -l 3000
```

3. Abrir en navegador: http://localhost:3000

4. Instalar como PWA:
   - Chrome: Botón "Instalar" en la barra de direcciones
   - Edge: Menú → "Aplicaciones" → "Instalar esta aplicación"
   - Safari (iOS): "Compartir" → "Añadir a pantalla de inicio"

## Troubleshooting

### Error: "Port 8000 already in use"

```bash
# Encontrar el proceso usando el puerto
lsof -i :8000

# Terminar el proceso (reemplaza PID con el número del proceso)
kill -9 PID
```

### Error: "Module not found: Can't resolve 'X'"

```bash
# Limpiar caché de npm y reinstalar
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### Error: "No module named 'fastapi'"

```bash
cd python
pip install -r requirements.txt
```

### Backend no carga datos de sanciones

```bash
# Verificar que existan los archivos XML
ls python/sanctions_data/

# Si faltan, el backend los descargará automáticamente en el primer inicio
# O descargar manualmente:
cd python
python3 downloader.py
```

### Percentajes Incorrectos (825%, etc.)

Esto está corregido en la versión actual. Si aún ves este problema:

1. Verifica que estés usando la última versión del código
2. Limpia caché del navegador (Ctrl+Shift+Delete)
3. Reinicia el frontend: `npm start`

## Estructura del Proyecto

```
sanctions-check/
├── python/                 # Backend Python
│   ├── api/               # FastAPI endpoints
│   │   ├── server.py     # Main server
│   │   └── models.py     # Pydantic models
│   ├── report_generator.py  # ← Fuente única de generación de reportes
│   ├── screener.py       # Screening logic
│   ├── tests/            # Backend tests
│   └── requirements.txt  # Python dependencies
├── frontend/             # Frontend React
│   ├── src/
│   │   ├── App.js       # Main app component
│   │   ├── components/  # React components
│   │   │   ├── BulkScreening.js      # Usa API del backend para reportes
│   │   │   └── ResultsDisplay.js     # Muestra % correctamente
│   ├── electron/        # Electron config
│   └── package.json     # Node.js dependencies
├── docker-compose.yml   # Docker orchestration
└── test_localhost_setup.sh  # Environment validation script
```

## Endpoints de la API

### Screening

- `POST /api/v1/screen` - Screening individual
- `POST /api/v1/screen/bulk` - Screening masivo (CSV)

### Generación de Reportes (NUEVO)

- `POST /api/v1/reports/generate` - Generar reporte individual
  - Usa `report_generator.py` del backend
  - Garantiza consistencia entre web, PWA y Electron
  
- `POST /api/v1/reports/generate-bulk` - Generar reporte masivo
  - Usa `report_generator.py` del backend
  - Reportes homogéneos independientemente del canal

### Health & Debug

- `GET /api/v1/health` - Estado del servicio
- `GET /api/v1/debug/connection-logs` - Logs de conexión
- `GET /api/v1/debug/data-mode` - Modo de datos (XML/Database)

## Variables de Entorno

### Backend (`python/.env`)

```bash
API_HOST=127.0.0.1
API_PORT=8000
DATA_DIR=sanctions_data
CONFIG_PATH=config.yaml
USE_DATABASE=false          # true para modo PostgreSQL
DATABASE_URL=               # URL de PostgreSQL (opcional)
API_KEY=                    # API key (opcional, para producción)
```

### Frontend (`frontend/.env.local`)

```bash
REACT_APP_API_URL=http://localhost:8000
```

### Electron (`frontend/.env.electron`)

```bash
REACT_APP_API_URL=http://localhost:8000
```

## Mejores Prácticas de Desarrollo

1. **Siempre ejecuta tests antes de commit**:
   ```bash
   cd python && pytest -v
   cd ../frontend && npm test
   ```

2. **Usa el script de validación periódicamente**:
   ```bash
   ./test_localhost_setup.sh
   ```

3. **Limpia logs y temporales regularmente**:
   ```bash
   rm -rf python/reports/audit_log/*.log
   rm -rf frontend/node_modules/.cache
   ```

4. **Actualiza dependencias con cuidado**:
   ```bash
   # Backend
   pip list --outdated
   
   # Frontend
   npm outdated
   ```

## Contribuir

Al hacer cambios que afecten la generación de reportes:

1. **SIEMPRE** usa `report_generator.py` del backend
2. **NO** dupliques lógica de HTML en el frontend
3. Añade tests en `python/tests/test_report_generation.py`
4. Valida que los porcentajes estén en rango 0-100%

## Soporte

Para problemas o preguntas:
- Revisa la documentación en `/docs`
- Ejecuta `./test_localhost_setup.sh` para diagnóstico
- Revisa logs en `python/reports/audit_log/`
