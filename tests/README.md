# Tests de integración

## Herramientas elegidas
- **Vitest**: soporta TypeScript de forma nativa sin configuración adicional de compiladores, tiene API compatible con Jest y permite correr la suite completa con `vitest run` desde `npm test`.
- **Supertest**: permite probar los endpoints HTTP importando directamente `src/app.ts` (separado de `src/index.ts`), sin abrir puertos reales en red.

## Estrategia de base de datos (PostgreSQL de Docker vs. mocks)
Los tests corren contra la base **PostgreSQL levantada con Docker** y no contra mocks porque:
1. Los servicios (`clases.service.ts` e `inscripciones.service.ts`) usan el `pool` de `pg` directamente con transacciones (`BEGIN`, `SELECT ... FOR UPDATE`, `COMMIT`, `ROLLBACK`).
2. Varias reglas críticas viven en la propia base de datos (`CHECK` constraints, `ON DELETE RESTRICT` y el índice único parcial `ux_inscripcion_activa_alumno_clase`).
3. Simular `pg` acoplaría los tests al orden interno de las consultas SQL sin verificar el comportamiento real.

Para mantener la base limpia y repetible, cada archivo de test crea sus propias clases con fechas futuras dinámicas y elimina únicamente los registros creados en `afterAll`, conservando intactas las semillas de `sql/init.sql`. Además, `vitest.config.ts` desactiva el paralelismo entre archivos (`fileParallelism: false`) para evitar colisiones.

## Requisitos y ejecución
1. Tener `.env` configurado (copiado de `.env.example`).
2. Tener PostgreSQL corriendo (`docker compose up -d`) y las semillas cargadas (`sql/init.sql`).
3. Ejecutar:

```bash
npm test
```