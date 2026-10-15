# Decisiones de Diseño y Arquitectura - Taller II

## Módulo de Clases y Arquitectura del Backend

### 1. Código analizado
- **Punto de partida:** `src/index.ts` inicial.
- **Estructura refactorizada:** 
  - `src/app.ts` (configuración del servidor y middlewares).
  - `src/index.ts` (arranque y escucha en puerto).
  - `src/routes/clases.routes.ts` (enrutamiento semántico).
  - `src/controllers/clases.controller.ts` (traducción HTTP y manejo de códigos de estado).
  - `src/services/clases.service.ts` (validaciones de dominio y persistencia SQL).
  - `src/types/clase.ts` (contratos de datos e interfaces).

### 2. Diagnóstico
Al revisar el archivo `src/index.ts` inicial del repositorio, se detectaron las siguientes señales de diseño y *code smells*:
- **Violación de SRP (Single Responsibility Principle):** El archivo `src/index.ts` acumulaba la instanciación de Express, la configuración de middlewares, la definición de rutas HTTP (`/health`) y la escucha del socket en el puerto mediante `listen`.
- **Riesgo de *Long Method* y Acoplamiento Fuerte:** De mantener la lógica de clases en el mismo archivo o en callbacks anónimos, se acoplarían el protocolo HTTP, las reglas de validación de negocio y el dialecto SQL en un solo bloque difícil de mantener y extender.
- **Dificultad de Testeo:** Al tener `app.listen()` atado a la definición del servidor, no era posible importar la aplicación en suites de pruebas de integración sin abrir puertos de red reales.

### 3. Alternativas consideradas
1. **Mantener todo en `src/index.ts`:**
   - *Pros:* Simplicidad inicial de un único archivo.
   - *Contras:* Deuda técnica acumulativa inmediata, mezcla de responsabilidades y falta de modularidad a medida que se integren los módulos de inscripciones y estados.
2. **Separación de responsabilidades en 3 capas livianas (Rutas -> Controlador -> Servicio) + Separación del ciclo de vida del servidor (`app.ts` / `index.ts`):**
   - *Pros:* Alta cohesión, código limpio, responsabilidades claras y explícitas, fácil de testear sin capas de abstracción artificiales.

### 4. Decisión
Se decidió adoptar la **Alternativa 2**:
1. **Refactoring del servidor:** Se extrajo la configuración de Express a `src/app.ts` y se dejó en `src/index.ts` únicamente la invocación a `app.listen()`, separando el armado de la aplicación de su arranque en red.
2. **Diseño en capas livianas:**
   - **Rutas (`clases.routes.ts`):** Mapeo declarativo de endpoints (`GET /`, `POST /`, `GET /:id`).
   - **Controlador (`clases.controller.ts`):** Captura peticiones, orquesta llamadas y responde con los códigos semánticos correspondientes (`200 OK`, `201 Created`, `400 Bad Request`, `404 Not Found`, `500 Internal Server Error`).
   - **Servicio (`clases.service.ts`):** Centraliza la lógica de negocio (validar nombre no vacío, cupo entero positivo, consistencia temporal `inicio < fin` y existencia de profesor) y la ejecución de consultas parametrizadas a la base de datos.

### 5. Evidencia y trade-offs
- **Beneficios obtenidos:**
  - **Alta Cohesión y Bajo Acoplamiento:** Las validaciones de negocio en `clasesService.crear()` y las consultas de `clasesService.listar()` están aisladas. Cambiar una regla de horario o cupo no impacta en los controladores ni en las rutas.
  - **Testabilidad:** `src/app.ts` puede importarse directamente en pruebas automatizadas sin generar efectos secundarios en el entorno de red.
- **Costos / Trade-offs asumidos:**
  - Incremento en la cantidad de archivos y necesidad de mantener sincronizados los contratos e interfaces de TypeScript en src/types/clase.ts (evitando el code smell de listas largas de parámetros sueltos)

## Módulo de Inscripciones y Reglas (feat/inscripciones)

### 1. Modelo de datos
Tabla `inscripcion (id, alumno_id, clase_id, fecha, estado, cancelada_en)` con `estado IN ('activa','cancelada')`.
- **Cancelación lógica:** no se borran filas; se conserva el historial (útil para cuotas, asistencia y reportes).
- **Anti-duplicados en la base:** índice único *parcial* sobre `(alumno_id, clase_id) WHERE estado = 'activa'`. Impide dos inscripciones activas del mismo alumno a la misma clase, pero permite volver a anotarse tras cancelar.

### 2. Reglas de negocio (en `inscripciones.service.ts`)
| Situación | Respuesta |
|---|---|
| `alumno_id` / `clase_id` inválidos | 400 |
| Clase o alumno inexistente | 404 |
| Clase `cancelada` o `finalizada` | 409 |
| Clase que ya comenzó (`inicio <= ahora`) | 409 |
| Alumno ya inscripto (activa) | 409 |
| Cupo completo | 409 |
| Cancelar una clase ya iniciada / inscripción ya cancelada | 409 |

### 3. Problema: dos solicitudes por el último lugar
Con una lógica ingenua ("contar inscriptos; si hay lugar, insertar") hay una condición de carrera: dos solicitudes simultáneas cuentan *antes* de que la otra inserte, ambas ven "queda 1 lugar" y ambas insertan → **sobrecupo**. Ocurre porque *verificar* e *insertar* no son una operación atómica.

**Alternativas consideradas**
1. **Bloqueo pesimista con `SELECT ... FOR UPDATE` sobre la fila de la clase (elegida).**
   - Pros: simple, correcta bajo el nivel de aislamiento por defecto (READ COMMITTED), no necesita reintentos, funciona con varias instancias del servidor, y solo serializa solicitudes de la *misma* clase.
   - Contras: las inscripciones a una misma clase se procesan en fila (irrelevante a la escala de un gimnasio); la transacción debe ser corta.
2. **Nivel `SERIALIZABLE` con reintentos.**
   - Pros: no requiere lock explícito.
   - Contras: la base aborta una de las transacciones (error 40001) y la aplicación debe reintentar; más complejidad.
3. **Contador denormalizado en `clase` con `UPDATE ... SET inscriptos = inscriptos + 1 WHERE id = $1 AND inscriptos < cupo`.**
   - Pros: atómico y muy rápido.
   - Contras: dato duplicado que hay que mantener sincronizado en altas y cancelaciones.
4. **Mutex en memoria del servidor (descartada).** No funciona si hay más de una instancia ni si el proceso se reinicia.

### 4. Decisión
Se implementó la alternativa 1: toda la inscripción corre en una transacción cuyo primer paso es bloquear la clase con `FOR UPDATE`. La segunda solicitud espera el `COMMIT` de la primera y recién entonces cuenta, viendo el lugar ocupado y recibiendo 409. El índice único parcial queda como red de seguridad ante duplicados (error `23505` → 409).

### 5. Evidencia
Con una clase de cupo 1 y dos solicitudes simultáneas (forzando el solapamiento con `pg_sleep`):
- **Sin** `FOR UPDATE`: ambas se inscriben (2 inscriptos en cupo 1).
- **Con** `FOR UPDATE`: una se inscribe y la otra recibe "sin cupo" (1 inscripto).

Reproducible a nivel HTTP con `npm run probar:inscripciones` (lanza solicitudes paralelas y verifica que haya exactamente un 201).

### 6. Trade-offs asumidos
- El cupo se calcula con `COUNT` en cada inscripción (sin contador denormalizado): más simple y siempre consistente, a costa de una consulta extra por alta.
- Se puede cancelar solo antes del inicio de la clase (decisión de negocio, fácil de cambiar en `cancelar()`).

---

## Estados de clase: finalizar y cancelar

### 1. Código analizado
- [`src/services/clases.service.ts`](../src/services/clases.service.ts): `crear()` (línea 13), `finalizar()` (línea 130), `cancelar()` (línea 167) y `bloquearClaseProgramada()` (línea 211).
- [`src/controllers/clases.controller.ts`](../src/controllers/clases.controller.ts): `responderError()` (línea 10) y los handlers `finalizar` y `cancelar`.
- [`src/routes/clases.routes.ts`](../src/routes/clases.routes.ts): rutas `PATCH /:id/finalizar` y `PATCH /:id/cancelar` (líneas 9 y 10).
- [`src/types/clase.ts`](../src/types/clase.ts): tipo `EstadoClase` e interfaz `ClaseCancelada`.
- Punto de contacto con inscripciones: [`src/services/inscripciones.service.ts`](../src/services/inscripciones.service.ts), línea 28, donde `inscribir()` bloquea la fila de la clase.

### 2. Diagnóstico
- **Estado sin comportamiento.** La tabla `clase` ya tenía la columna `estado` con el `CHECK` `programada | finalizada | cancelada`, pero ningún código la cambiaba. Toda clase quedaba `programada` para siempre.
- **Máquina de estados implícita.** Definimos las transiciones permitidas: `programada → finalizada` y `programada → cancelada`. `finalizada` y `cancelada` son terminales. Cualquier otra transición es un conflicto con el estado actual del recurso (HTTP 409).
- **Consistencia entre agregados.** Si cancelamos una clase y dejamos sus inscripciones `activa`, el alumno figura anotado a una clase que no se dicta. El cambio de estado de la clase y la baja de sus inscripciones tienen que ser una sola operación atómica.
- **Condición de carrera.** Sin coordinación, una inscripción puede leer la clase como `programada`, la cancelación termina, y la inscripción se confirma después sobre una clase ya cancelada.
- **Manejo de errores del módulo de clases.** `ClasesController.crear()` respondía 400 ante cualquier excepción, incluso errores de la base. Con `profesor_id: "abc"`, el cliente recibía el mensaje interno de PostgreSQL (`invalid input syntax for type integer`). Además, `GET /api/clases/1.5` llegaba a la consulta SQL y devolvía 500.

### 3. Alternativas consideradas
**Forma de la API**
1. `PATCH /api/clases/:id` con `{ "estado": "cancelada" }`. Es genérico, pero obliga a validar en un solo método qué transición pidió el cliente, y cada transición tiene reglas distintas.
2. `PATCH /api/clases/:id/finalizar` y `PATCH /api/clases/:id/cancelar`. Cada acción tiene su endpoint, su método de servicio y sus reglas.

**Estado guardado o calculado**
1. Calcular el estado a partir de la hora (`fin < NOW()` implica finalizada). No necesita una acción manual, pero no permite expresar "cancelada", que depende de una decisión del gimnasio y no del reloj.
2. Guardar el estado en la columna y cambiarlo con acciones explícitas.

**Qué pasa con las inscripciones al cancelar**
1. Dejarlas `activa` y que el resto del sistema filtre por estado de la clase. Cada consulta futura tendría que recordar ese filtro.
2. Borrarlas. Se pierde el historial.
3. Pasarlas a `cancelada` con `cancelada_en = NOW()` en la misma transacción. Reutiliza la baja lógica que ya usa el módulo de inscripciones.

**Concurrencia con inscripciones**
1. No coordinar y aceptar la carrera.
2. Nivel de aislamiento `SERIALIZABLE` y reintentos ante fallos de serialización.
3. `SELECT ... FOR UPDATE` sobre la fila de la clase, el mismo lock que ya toma `inscribir()`.

### 4. Decisión
- **API:** endpoints por acción (`/finalizar`, `/cancelar`).
- **Estado:** guardado en la columna, sin cálculo automático.
- **Reglas de transición:**
  - Finalizar solo si la clase está `programada` y ya pasó su `fin`. Las inscripciones activas se mantienen como registro de asistencia.
  - Cancelar solo si la clase está `programada` y todavía no empezó. En la misma transacción pasamos sus inscripciones activas a `cancelada`, y la respuesta informa cuántas (`inscripciones_canceladas`).
  - Las dos acciones comparten `bloquearClaseProgramada()`, que toma el lock y rechaza estados terminales.
- **Concurrencia:** `FOR UPDATE` sobre la clase. Coordinamos con el integrante 2 para usar el mismo lock que `inscribir()`. Así, la operación que llega segunda espera, y al continuar ve el estado nuevo.
- **Errores:** el servicio de clases lanza `ReglaNegocioError` (de `src/errors.ts`, compartido con inscripciones) con su código HTTP. `responderError()` traduce esos errores y responde 500 genérico ante cualquier otro, registrándolo con `console.error`. También validamos `profesor_id` y los IDs de ruta como enteros positivos antes de consultar la base.

### 5. Evidencia y trade-offs
- **Commit:** `fe3b755` en la rama `feat/estados-clases`.
- **Prueba del flujo completo** contra la API y PostgreSQL 16 (36 chequeos, todos OK):

| Caso | Resultado |
|------|-----------|
| Alta con `profesor_id: "abc"` | 400 con mensaje propio (antes devolvía el error de PostgreSQL) |
| `GET /api/clases/1.5` | 400 (antes 500) |
| Cancelar o finalizar una clase inexistente | 404 |
| Cancelar una clase futura con 2 inscriptos | 200, `estado: cancelada`, `inscripciones_canceladas: 2` |
| Inscribir en una clase cancelada | 409 |
| Finalizar una clase que todavía no terminó | 409 |
| Cancelar una clase en curso | 409 |
| Finalizar una clase terminada | 200; después, cancelar o finalizar de nuevo da 409 |
| 20 rondas de cancelación en paralelo con 4 inscripciones | 0 inscripciones activas en clases canceladas |

- **Beneficios:**
  - Las reglas de cada transición quedan en un método con nombre propio, y el lock y el chequeo de estado terminal en un solo lugar.
  - Una clase cancelada nunca queda con alumnos activos, ni siquiera ante pedidos simultáneos.
  - El cliente recibe 400, 404 o 409 según el caso, y nunca un mensaje interno de la base.
- **Costos:**
  - Alguien tiene que finalizar cada clase a mano. Si nadie lo hace, la clase sigue `programada` después de terminar. El módulo de inscripciones lo compensa comparando `inicio` con la hora actual.
  - Mientras dura la cancelación, el lock frena las inscripciones a esa clase. El impacto es bajo porque la transacción hace dos `UPDATE`.
  - La función `esIdValido` está duplicada en los servicios de clases e inscripciones.
  - La prueba de concurrencia muestra que la carrera no apareció en 20 rondas. No demuestra que sea imposible; esa garantía la da el lock.
- **Pendientes detectados, sin cambiar:**
  - `crear()` acepta clases con fecha pasada.
  - Un profesor inexistente responde 400, mientras que inscripciones responde 404 ante un alumno o una clase inexistente.
