# GymManager

API para la gestión de un gimnasio (alumnos, profesores, clases e inscripciones).

## Stack
- Node.js + TypeScript
- Express
- PostgreSQL (vía Docker)

## Requisitos previos
- Node.js 20 o superior (ver .nvmrc)
- Docker y Docker Compose

## Instalación

1. Clonar el repositorio

git clone https://github.com/usuario/gymmanager.git
cd gymmanager


2. Instalar dependencias

npm install


3. Copiar el archivo de configuración

cp .env.example .env


4. Levantar la base de datos

docker compose up -d


5. Crear las tablas
(mac,Linux)
docker exec -i $(docker compose ps -q db) psql -U gymmanager -d gymmanager < sql/init.sql

(Windows powershell)
Get-Content sql/init.sql | docker exec -i (docker compose ps -q db) psql -U gymmanager -d gymmanager


## Ejecución

npm run dev


Probar que funciona entrando a http://localhost:3000/health.

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

curl -X PATCH http://localhost:3000/api/clases/1/cancelar

Respuesta:

{ "id": 1, "estado": "cancelada", "inscripciones_canceladas": 2, ... }

Códigos de error: 400 (datos o ID inválidos), 404 (la clase no existe), 409 (la transición no está permitida), 500 (error interno).

El análisis de diseño está en [docs/decisiones-diseno.md](docs/decisiones-diseno.md).

## Servicios necesarios
- PostgreSQL 16, se levanta con docker compose up -d (ver docker-compose.yml)