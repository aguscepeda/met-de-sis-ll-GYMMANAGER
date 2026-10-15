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