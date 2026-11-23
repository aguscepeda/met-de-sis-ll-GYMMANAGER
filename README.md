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

Ejemplo de creación:

```bash
curl -X POST http://localhost:3000/api/clases \
  -H "Content-Type: application/json" \
  -d '{ "nombre": "Spinning", "profesor_id": 2, "inicio": "2026-12-01T18:00", "fin": "2026-12-01T19:00", "cupo": 10 }'
```

Códigos de error: 400 (datos o ID inválidos; al crear, también si el profesor no existe), 404 (la clase no existe), 409 (la transición no está permitida), 500 (error interno).

## Endpoints de inscripciones

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/inscripciones` | Inscribe a un alumno en una clase. Devuelve 201 con la inscripción creada en estado `activa` |
| DELETE | `/api/inscripciones/:id` | Cancela una inscripción. Es una **baja lógica**: la fila pasa a `cancelada` y queda en el historial. Devuelve 200 |
| GET | `/api/inscripciones` | Lista las inscripciones, de la más reciente a la más vieja. Filtros opcionales: `?alumno_id=`, `?clase_id=` y `?estado=activa` o `?estado=cancelada` (se pueden combinar) |

Estados de una inscripción: `activa` → `cancelada`. Después de cancelar, el alumno puede volver a inscribirse en la misma clase.

### Inscribir

```bash
curl -X POST http://localhost:3000/api/inscripciones \
  -H "Content-Type: application/json" \
  -d '{ "alumno_id": 1, "clase_id": 1 }'
```

Respuesta (201):

```json
{ "id": 1, "alumno_id": 1, "clase_id": 1, "fecha": "...", "estado": "activa", "cancelada_en": null }
```

### Cancelar

```bash
curl -X DELETE http://localhost:3000/api/inscripciones/1
```

Respuesta (200): la misma inscripción con `"estado": "cancelada"` y `cancelada_en` con la fecha de la baja.

### Listar

```bash
curl "http://localhost:3000/api/inscripciones?clase_id=1&estado=activa"
```

Cada elemento incluye, además de los campos de la inscripción, `alumno_nombre`, `alumno_apellido`, `clase_nombre` y `clase_inicio`.

### Códigos de error

Todos los errores responden con un JSON `{ "error": "mensaje" }`.

| Situación | Endpoint | Código |
|-----------|----------|--------|
| `alumno_id` o `clase_id` no son enteros positivos | POST | 400 |
| El ID de la inscripción no es un entero positivo | DELETE | 400 |
| `alumno_id` o `clase_id` no son números | GET | 400 |
| La clase o el alumno no existen | POST | 404 |
| La inscripción no existe | DELETE | 404 |
| La clase está `cancelada` o `finalizada` | POST | 409 |
| La clase ya comenzó (`inicio <= ahora`) | POST | 409 |
| El alumno ya tiene una inscripción activa en esa clase | POST | 409 |
| La clase no tiene cupo disponible | POST | 409 |
| La inscripción ya estaba cancelada | DELETE | 409 |
| La clase de la inscripción ya comenzó | DELETE | 409 |
| Error inesperado (por ejemplo, la base no responde) | todos | 500 |

Dos solicitudes simultáneas por el último lugar no generan sobrecupo: la inscripción bloquea la fila de la clase (`SELECT ... FOR UPDATE`) antes de contar los lugares. El detalle de estas reglas y de la decisión está en [docs/decisiones-diseno.md](docs/decisiones-diseno.md).

Para probar estas reglas contra el servidor en marcha hay un script manual (necesita los datos de ejemplo de `sql/init.sql`):

```bash
npm run dev                   # en una terminal
npm run probar:inscripciones  # en otra
```

## Otros endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/alumnos` | Lista los alumnos, ordenados por apellido y nombre |
| GET | `/api/profesores` | Lista los profesores, ordenados por nombre |
| GET | `/health` | Verifica que el servidor y la base estén funcionando |

El análisis de diseño está en [docs/decisiones-diseno.md](docs/decisiones-diseno.md).

## Servicios necesarios
- PostgreSQL 16, se levanta con `docker compose up -d` (ver `docker-compose.yml`)
