# Testing

## Herramientas y alcance

Se escribieron pruebas de integración para la API de clases e inscripciones
con Vitest y Supertest. Supertest envía pedidos HTTP directamente a
`src/app.ts`, sin abrir un puerto de red.

Los tests usan la base PostgreSQL de Docker y no mocks, porque varias reglas
viven en la propia base: transacciones, `SELECT ... FOR UPDATE` e índice
único parcial. La justificación completa está en `tests/README.md`.

Cada caso verifica una regla de `docs/decisiones-diseno.md`: se prueba el
camino normal de cada operación y después cada situación que la API debe
rechazar, con atención a los casos límite.

Cada test crea sus propias clases y, al terminar, elimina solo lo que creó.
Las semillas de `sql/init.sql` quedan intactas.

## Ejecución

Requisitos: `.env` copiado de `.env.example` y la base con las semillas.

```bash
docker compose up -d
docker compose cp sql/init.sql db:/tmp/init.sql
docker compose exec db psql -v ON_ERROR_STOP=1 -U gymmanager -d gymmanager -f /tmp/init.sql
```

Para correr los tests:

```bash
## Resultado

```text
 RUN  v4.1.12 C:/Users/Agustin/Desktop/PROG lll/PARCIAL1/met-de-sis-ll-GYMMANAGER

 ✓ tests/inscripciones-errores.test.ts (18 tests) 252ms
 ✓ tests/inscripciones.test.ts (3 tests) 90ms
 ✓ tests/clases.test.ts (4 tests) 83ms

 Test Files  3 passed (3)
      Tests  25 passed (25)
   Start at  23:43:47
   Duration  1.82s (transform 91ms, setup 0ms, import 851ms, tests 424ms, environment 0ms)
```
```

`npm run test:watch` vuelve a ejecutarlos cada vez que se guarda un archivo.

## Casos normales

Están en `tests/clases.test.ts` y `tests/inscripciones.test.ts`.

| Caso | Código | Qué comprueba |
|---|---|---|
| Crear una clase válida | 201 | Se crea con estado `programada`. |
| Listar clases | 200 | Aparece la clase creada con los datos del profesor. |
| Filtrar clases por profesor | 200 | Solo devuelve las clases de ese profesor. |
| Obtener una clase por ID | 200 | Devuelve la clase pedida. |
| Inscribir a un alumno | 201 | La inscripción queda `activa`. |
| Listar inscripciones | 200 | Incluye el nombre del alumno y de la clase. |
| Cancelar una inscripción | 200 | Baja lógica: la fila se conserva como `cancelada`. |

## Casos de error y límite

Están en `tests/inscripciones-errores.test.ts`.

| Caso | Código | Motivo |
|---|---|---|
| Alta con ID no numérico, negativo, cero, decimal o cuerpo vacío | 400 | Cada valor falla de forma distinta. Se rechaza antes de consultar la base. |
| Cancelar con ID inválido | 400 | La misma validación, ahora en el `DELETE`. |
| Listar con `alumno_id` no numérico | 400 | El listado valida sus propios filtros. |
| Inscribir en una clase inexistente | 404 | Distingue un recurso que no existe de un dato mal formado. |
| Inscribir a un alumno inexistente | 404 | Se prueba con una clase válida para validar el alumno por separado. |
| Cancelar una inscripción inexistente | 404 | El recurso de la ruta no existe. |
| Clase cancelada | 409 | Estado terminal. Se cancela por la API (`PATCH /cancelar`). |
| Clase finalizada | 409 | Estado terminal. Se finaliza por la API (`PATCH /finalizar`). |
| Clase que ya comenzó | 409 | Caso límite: empezó hace una hora y sigue `programada`. |
| Inscripción duplicada | 409 | Un alumno no puede tener dos inscripciones activas en una clase. |
| Cupo completo | 409 | Caso límite principal: con cupo 1, el primero entra y el segundo es rechazado. |
| Cancelar una inscripción ya cancelada | 409 | No se puede cancelar dos veces. |
| Volver a inscribirse después de cancelar | 201 | Comprueba que el índice único es parcial: solo cuenta las `activa`. |

## Resultado

```text
<pegar acá la salida de npm test>
```

Se esperan 3 archivos y 25 tests: 4 de clases, 3 de inscripciones normales
y 18 de error y límite.

Con todos los tests en verde, cada regla de la tabla de reglas de
`docs/decisiones-diseno.md` responde con el código HTTP documentado, contra
la base real.

Si un test falla, hay que decidir qué está desactualizado: el código o la
documentación. No se modifica el test solo para que pase.

## Limitaciones y pendientes

- Los tests son secuenciales, por lo que no detectan la condición de carrera
  por el último lugar. Esa garantía la da `SELECT ... FOR UPDATE` y hoy solo
  la cubre el script manual `npm run probar:inscripciones`
  (`scripts/probar-inscripciones.mjs`), que necesita el servidor en marcha.
- Dependen del entorno: necesitan