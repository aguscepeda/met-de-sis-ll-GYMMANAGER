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

docker exec -i $(docker compose ps -q db) psql -U gymmanager -d gymmanager < sql/init.sql


## Ejecución

npm run dev


Probar que funciona entrando a http://localhost:3000/health.

## Servicios necesarios
- PostgreSQL 16, se levanta con docker compose up -d (ver docker-compose.yml)