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