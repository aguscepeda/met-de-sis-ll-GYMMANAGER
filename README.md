# GymManager

API para la gestión de un gimnasio (alumnos, profesores, clases e inscripciones), con una interfaz web de demostración.

## Stack
- Node.js + TypeScript
- Express
- PostgreSQL 16 (vía Docker)

## Requisitos previos
- Node.js 20.19 o superior (ver `.nvmrc`). ESLint 10 no funciona con versiones anteriores de Node 20
- Docker y Docker Compose. En Windows y macOS, **Docker Desktop tiene que estar abierto** (abajo a la izquierda dice *Engine running*) antes de correr cualquier comando `docker`. Si se trabaja desde WSL, además hay que activar la distribución en *Settings → Resources → WSL Integration*
- Git

Servicio necesario: PostgreSQL 16, que se levanta con Docker (ver paso 4 de [Instalación](#instalación)). No hace falta instalar PostgreSQL en la máquina.

## Instalación

1. Clonar el repositorio

   ```bash
   git clone https://github.com/aguscepeda/met-de-sis-ll-GYMMANAGER.git
   cd met-de-sis-ll-GYMMANAGER
   ```

2. Instalar dependencias

   ```bash
   npm ci
   ```

   `npm ci` instala exactamente las versiones de `package-lock.json`, así todo el equipo trabaja con las mismas. Hay que volver a correrlo **después de cada `git pull`** que cambie `package.json` o `package-lock.json` (por ejemplo, cuando se agregaron Vitest y ESLint).

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

   **Este paso no es automático.** `docker compose up -d` crea una base vacía; sin este paso no existen las tablas y la aplicación y los tests fallan (ver [Problemas comunes](#problemas-comunes)). Si se recrea la base con `docker compose down -v`, hay que repetirlo.

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

## Uso del frontend

El servidor también sirve una interfaz web desde la carpeta `public/` (no hay que levantar nada aparte). Con `npm run dev` corriendo y la base cargada:

1. Entrar a <http://localhost:3000/> (`public/index.html`). Es la pantalla de acceso: elegir un perfil (**Recepcionista**, **Profesor** o **Alumno**).
2. Se abre el panel (`public/panel.html?rol=<perfil>`). Arriba se ve el **Estado del sistema**, que consulta `/health`; con el botón *Verificar conexión* se vuelve a probar.
3. En el menú lateral están las secciones del perfil. Cada listado se puede recargar con *Actualizar listado*.

| Perfil | Secciones | Qué se puede hacer |
|--------|-----------|--------------------|
| Recepcionista | Alumnos, Profesores, Clases, Inscripciones | Ver alumnos y profesores. En **Clases**: crear clases (*+ Crear clase*), finalizarlas (cuando ya terminaron) y cancelarlas (antes de que empiecen). En **Inscripciones**: inscribir a cualquier alumno y cancelar inscripciones activas |
| Profesor | Mis clases, Mis alumnos | Elegir el *Profesor de demostración*. Ver sus clases y crear clases a su nombre. Ver los alumnos con inscripción activa en sus clases |
| Alumno | Clases disponibles, Mis inscripciones | Elegir el *Alumno de demostración*. Inscribirse en una clase programada que no haya empezado y cancelar sus inscripciones |

Para **crear una clase**: completar nombre, profesor, inicio, fin y cupo; *Validar formulario* revisa los datos en el navegador y *Guardar clase* la envía a la API. Los horarios se cargan en la hora local del gimnasio.

Las acciones que cambian datos (finalizar, cancelar) piden confirmación, y los errores de la API (por ejemplo, "La clase no tiene cupo disponible") se muestran en pantalla.

Limitaciones: los perfiles son **de demostración**. No hay login ni permisos reales; cualquiera puede entrar con cualquier perfil. La validación del navegador no reemplaza a la del backend, que es la que manda.

El código está en `public/js/app.js` (lógica y llamadas a la API) y `public/css/styles.css` (estilos).

## Endpoints de clases

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/clases` | Lista las clases. Filtro opcional `?profesor_id=` |
| GET | `/api/clases/:id` | Devuelve una clase |
| POST | `/api/clases` | Crea una clase en estado `programada` |
| PATCH | `/api/clases/:id/finalizar` | Pasa la clase a `finalizada`. Solo si ya pasó su horario de fin |
| PATCH | `/api/clases/:id/cancelar` | Pasa la clase a `cancelada` y cancela sus inscripciones activas. Solo antes del inicio |

Estados de una clase: `programada` → `finalizada` o `cancelada`. Los dos últimos son definitivos: intentar cambiarlos devuelve 409.

Los datos de ejemplo de `sql/init.sql` traen alumnos y profesores, pero **no traen clases**. Para probar los ejemplos que siguen, primero hay que crear una. En una base recién cargada, esa primera clase recibe el ID 1, que es el que usan los demás ejemplos.

Los ejemplos usan la sintaxis de `curl` en bash (Git Bash, macOS o Linux). En Windows PowerShell, `curl` es otro comando: hay que escribir `curl.exe`, poner todo en una sola línea y escapar las comillas del JSON. Es más simple correrlos desde Git Bash o probar desde el frontend.

Ejemplo de creación (devuelve 201):

```bash
curl -X POST http://localhost:3000/api/clases \
  -H "Content-Type: application/json" \
  -d '{ "nombre": "Spinning", "profesor_id": 2, "inicio": "2026-12-01T18:00", "fin": "2026-12-01T19:00", "cupo": 10 }'
```

Ejemplo de cancelación:

```bash
curl -X PATCH http://localhost:3000/api/clases/1/cancelar
```

Respuesta (`inscripciones_canceladas` dice cuántas inscripciones activas se dieron de baja):

```json
{ "id": 1, "estado": "cancelada", "inscripciones_canceladas": 2, ... }
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

La clase tiene que estar `programada` y no haber empezado. Si cancelaste la clase 1 con el ejemplo anterior, creá otra y usá su ID en `clase_id`.

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

## Estructura del proyecto

```text
met-de-sis-ll-GYMMANAGER/
├── src/
│   ├── index.ts            # Arranque: lee PORT y llama a app.listen()
│   ├── app.ts              # Arma la app Express: middlewares, rutas y archivos estáticos
│   ├── db.ts               # Pool de conexiones a PostgreSQL (usa DATABASE_URL)
│   ├── errors.ts           # ReglaNegocioError: error de negocio con su código HTTP
│   ├── routes/             # Qué URL y método va a qué controlador
│   │   ├── clases.routes.ts
│   │   └── inscripciones.routes.ts
│   ├── controllers/        # Leen la petición, llaman al servicio y arman la respuesta HTTP
│   │   ├── clases.controller.ts
│   │   └── inscripciones.controller.ts
│   ├── services/           # Reglas de negocio, transacciones y consultas SQL
│   │   ├── clases.service.ts
│   │   └── inscripciones.service.ts
│   └── types/              # Interfaces y tipos de TypeScript (entidades y DTOs)
│       ├── clase.ts
│       └── inscripcion.ts
├── public/                 # Frontend estático que sirve Express
│   ├── index.html          # Selección de perfil
│   ├── panel.html          # Panel de gestión
│   ├── js/app.js
│   └── css/styles.css
├── tests/                  # Tests de integración (Vitest + Supertest)
│   ├── clases.test.ts      # Casos normales de clases
│   ├── inscripciones.test.ts           # Casos normales de inscripciones
│   ├── inscripciones-errores.test.ts   # Casos de error y límite (400, 404, 409)
│   ├── helpers.ts          # Fechas relativas, datos semilla y limpieza de la base
│   └── README.md           # Elección de herramientas y estrategia de base
├── docs/
│   ├── decisiones-diseno.md  # Decisiones de diseño y sus alternativas
│   ├── testing.md            # Justificación de los casos de prueba y resultados
│   └── calidad.md            # Revisión con ESLint: hallazgos y correcciones
├── sql/init.sql            # Tablas, índices y datos de ejemplo
├── scripts/probar-inscripciones.mjs  # Prueba manual de reglas y concurrencia
├── docker-compose.yml      # PostgreSQL 16 para desarrollo
├── .env.example            # Variables de entorno de ejemplo
├── .nvmrc                  # Versión de Node recomendada
├── tsconfig.json           # Configuración del compilador de TypeScript
├── vitest.config.ts        # Configuración de los tests
├── eslint.config.mjs       # Reglas de ESLint
└── package.json            # Dependencias y scripts de npm
```

### Cómo viaja una petición

Cada módulo (clases e inscripciones) sigue las mismas capas:

```text
HTTP → routes → controllers → services → PostgreSQL (db.ts)
```

- **Routes** solo declaran los endpoints. Por ejemplo, `DELETE /api/inscripciones/:id` llama a `inscripcionesController.cancelar`.
- **Controllers** convierten la petición en datos para el servicio y la respuesta en un código HTTP. Si el servicio lanza un `ReglaNegocioError`, responden con su código (400, 404 o 409); cualquier otro error es un 500 genérico, sin exponer detalles de la base.
- **Services** tienen las reglas de negocio (cupo, estados, horarios, duplicados) y las consultas SQL parametrizadas. Las operaciones que leen y después escriben corren en una transacción con `SELECT ... FOR UPDATE`.
- **Types** definen la forma de los datos que se intercambian entre capas (`Clase`, `Inscripcion`, `CrearClaseDTO`, etc.).

`app.ts` está separado de `index.ts` para poder importar la aplicación sin abrir un puerto, por ejemplo desde los tests. Los endpoints de solo lectura `/api/alumnos`, `/api/profesores` y `/health` están definidos directamente en `app.ts`.

El análisis de diseño está en [docs/decisiones-diseno.md](docs/decisiones-diseno.md).

## Tests

Los tests son de integración y usan **Vitest** con **Supertest**. Supertest manda pedidos HTTP directamente a `src/app.ts`, sin abrir un puerto, así que **no hace falta tener `npm run dev` corriendo**. Lo que sí hace falta es la base: los tests corren contra el PostgreSQL de Docker, no contra una base simulada, porque varias reglas viven en la base (transacciones, `SELECT ... FOR UPDATE` y el índice único parcial).

Antes de correrlos, hay que completar los pasos 1 a 5 de [Instalación](#instalación): `.env` copiado, base levantada y `sql/init.sql` cargado. Después:

```bash
npm test
```

Para que se vuelvan a ejecutar cada vez que se guarda un archivo:

```bash
npm run test:watch
```

Resultado esperado: **3 archivos y 25 tests en verde**. Al final de la salida tiene que aparecer:

```text
 Test Files  3 passed (3)
      Tests  25 passed (25)
```

Antes de los resultados puede aparecer un aviso de Vite que empieza con `(!) Your Vite config uses features that are unsupported by configLoader: 'native'`. Es solo una advertencia sobre una versión futura de Vite: no hace fallar los tests.

| Archivo | Qué prueba | Tests |
|---------|------------|-------|
| `tests/clases.test.ts` | Casos normales de clases: crear (201), listar, filtrar por profesor y obtener por ID | 4 |
| `tests/inscripciones.test.ts` | Casos normales de inscripciones: inscribir (201), listar y cancelar (200) | 3 |
| `tests/inscripciones-errores.test.ts` | Errores y límites: IDs inválidos (400), clase, alumno o inscripción inexistente (404), clase cancelada, finalizada o ya iniciada, duplicado, **cupo completo** y doble cancelación (409), y volver a inscribirse después de cancelar (201) | 18 |

Cada test crea sus propias clases y al terminar borra solo lo que creó, así que las semillas de `sql/init.sql` quedan intactas y se pueden correr las veces que se quiera. Los archivos se ejecutan uno por vez (`fileParallelism: false` en `vitest.config.ts`) para que no se pisen sobre la misma base.

Si los tests no pasan, ver [Problemas comunes](#problemas-comunes).

Cómo leer el resultado: un test **failed** corrió y su aserción no se cumplió (posible defecto en el código). Si en cambio aparecen archivos fallidos con todos sus tests **skipped**, el problema está en la preparación (por ejemplo, la base no tiene tablas) y no se llegó a verificar nada.

Limitación: los tests corren en secuencia y no prueban la concurrencia por el último lugar. Eso lo cubre el script manual `npm run probar:inscripciones` (ver [Endpoints de inscripciones](#endpoints-de-inscripciones)).

Por qué se eligió cada caso, los resultados y las limitaciones están en [docs/testing.md](docs/testing.md). La elección de las herramientas y de la base está en [tests/README.md](tests/README.md).

## Calidad

Para revisar el código se usa **ESLint** con **typescript-eslint**, con las reglas recomendadas, sobre los archivos de `src/`. La configuración está en `eslint.config.mjs`. Este análisis no necesita la base ni el servidor.

```bash
npm run lint
```

Resultado esperado: sin errores ni advertencias. Solo se ve el comando que se ejecutó (`> eslint src`), sin ninguna línea más. Si hubiera problemas, ESLint listaría cada uno con su archivo, línea y regla.

Para comprobar que TypeScript compila sin errores:

```bash
npm run build
```

ESLint 10 necesita Node 20.19 o superior (o 22.13 o superior). Si `npm run lint` falla al arrancar, revisar la versión con `node --version`.

Antes de abrir un Pull Request conviene correr los tres comandos:

```bash
npm run lint
npm run build
npm test
```

Qué encontró el análisis, qué se corrigió y qué quedó pendiente está en [docs/calidad.md](docs/calidad.md). La configuración y las correcciones están en commits separados, así que el historial de Git muestra el antes y el después.

## Problemas comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `npm ERR! Missing script: "test"` (o `"lint"`) | La copia local es anterior a la configuración de tests y calidad | `git checkout main` y `git pull origin main` |
| `sh: vitest: not found` o `eslint: not found` | Faltan dependencias nuevas en `node_modules` | `npm ci` |
| `failed to connect to the docker API` / `Cannot connect to the Docker daemon` | Docker Desktop no está abierto | Abrir Docker Desktop, esperar *Engine running* y repetir el comando |
| `ECONNREFUSED` al correr la app o los tests | La base no está levantada o `DATABASE_URL` no coincide | `docker compose up -d`, revisar con `docker compose ps` y comparar `.env` con [Configuración](#configuración) |
| `relation "alumno" does not exist` (o `profesor`), con los tests en *skipped* | La base existe pero está vacía: falta cargar `sql/init.sql` | Repetir el paso 5 de [Instalación](#instalación) y volver a correr `npm test` |
| `npm run lint` falla al arrancar | Versión de Node anterior a 20.19 | Revisar con `node --version` y actualizar (ver `.nvmrc`) |
