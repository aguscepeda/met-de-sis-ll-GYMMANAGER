# GymManager

API para la gestión de un gimnasio (alumnos, profesores, clases e inscripciones), con una interfaz web de demostración.

## Stack
- Node.js + TypeScript
- Express
- PostgreSQL 16 (vía Docker)

## Requisitos previos
- Node.js 20 o superior (ver `.nvmrc`)
- Docker y Docker Compose
- Git

## Instalación

1. Clonar el repositorio

   ```bash
   git clone https://github.com/aguscepeda/met-de-sis-ll-GYMMANAGER.git
   cd met-de-sis-ll-GYMMANAGER
   ```

2. Instalar dependencias

   ```bash
   npm install
   ```

3. Copiar el archivo de configuración (ver [Configuración](#configuración))

   ```bash
   cp .env.example .env
   ```

   En PowerShell `cp` también funciona. En `cmd` usar `copy .env.example .env`.

4. Levantar la base de datos

   ```bash
   docker compose up -d
   ```

5. Crear las tablas y cargar los datos de ejemplo (Windows, macOS y Linux)

   ```bash
   docker compose cp sql/init.sql db:/tmp/init.sql
   docker compose exec db psql -v ON_ERROR_STOP=1 -U gymmanager -d gymmanager -f /tmp/init.sql
   ```

   El script es idempotente: se puede volver a correr sin duplicar datos.

## Configuración

La aplicación lee su configuración de variables de entorno. En desarrollo se cargan desde el archivo `.env` (con `dotenv`), que se crea copiando `.env.example`. El archivo `.env` no se sube al repositorio (está en `.gitignore`).

| Variable | Valor de ejemplo | Para qué se usa |
|----------|------------------|-----------------|
| `PORT` | `3000` | Puerto donde escucha el servidor (`src/index.ts`). Si no está definida, usa `3000`. |
| `DATABASE_URL` | `postgresql://gymmanager:gymmanager@localhost:5432/gymmanager` | Cadena de conexión a PostgreSQL que usa el pool de `src/db.ts`. |

El formato de `DATABASE_URL` es `postgresql://<usuario>:<contraseña>@<host>:<puerto>/<base>`. Los valores de `.env.example` coinciden con los de `docker-compose.yml` (usuario, contraseña y base `gymmanager`, puerto `5432`), así que con la base de Docker no hace falta cambiar nada. Si se usa otro PostgreSQL, o el puerto `5432` ya está ocupado en la máquina, hay que ajustar esta variable.

## Ejecución

Modo desarrollo (se reinicia solo al guardar cambios):

```bash
npm run dev
```

Compilado (genera `dist/` y lo ejecuta):

```bash
npm run build
npm start
```

Para comprobar que funciona, entrar a <http://localhost:3000/health>. Si la base responde, devuelve:

```json
{ "status": "ok", "db_time": "..." }
```

## Endpoints de clases

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/clases` | Lista las clases. Filtro opcional `?profesor_id=` |
| GET | `/api/clases/:id` | Devuelve una clase |
| POST | `/api/clases` | Crea una clase en estado `programada` |
| PATCH | `/api/clases/:id/finalizar` | Pasa la clase a `finalizada`. Solo si ya pasó su horario de fin |
| PATCH | `/api/clases/:id/cancelar` | Pasa la clase a `cancelada` y cancela sus inscripciones activas. Solo antes del inicio |

Estados de una clase: `programada` → `finalizada` o `cancelada`. Los dos últimos son definitivos: intentar cambiarlos devuelve 409.

Ejemplo:

```bash
curl -X PATCH http://localhost:3000/api/clases/1/cancelar
```

Respuesta:

```json
{ "id": 1, "estado": "cancelada", "inscripciones_canceladas": 2, ... }
```

Códigos de error: 400 (datos o ID inválidos), 404 (la clase no existe), 409 (la transición no está permitida), 500 (error interno).

El análisis de diseño está en [docs/decisiones-diseno.md](docs/decisiones-diseno.md).

## Servicios necesarios
- PostgreSQL 16, se levanta con `docker compose up -d` (ver `docker-compose.yml`)
