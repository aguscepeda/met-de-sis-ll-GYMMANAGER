# Calidad de código

## Herramienta y alcance

Se configuró ESLint con typescript-eslint para analizar los archivos
TypeScript de `src/`, usando las reglas recomendadas.

Se eligió por su integración con TypeScript y porque permite ejecutar
la misma revisión en las computadoras de todos los integrantes.

La configuración está en `eslint.config.mjs`. Se permiten parámetros
sin usar que comienzan con `_` para conservar argumentos necesarios
por su posición, como `_req` en una ruta de Express. El prefijo indica
que no utilizarlos es intencional.

## Ejecución

```bash
npm ci
npm run lint
npm run build
```

`lint` analiza el código según las reglas configuradas.
`build` comprueba la compilación de TypeScript.

## Diagnóstico inicial

El primer análisis detectó 2 errores y 0 advertencias:

| Archivo | Hallazgo | Corrección |
|---|---|---|
| `src/app.ts` | Variable `error` sin utilizar en un `catch`. | Se eliminó la variable del `catch`. |
| `src/services/inscripciones.service.ts` | Uso explícito de `any` al capturar un error. | Se reemplazó por `unknown` y se verificó que fuera un objeto con la propiedad `code` antes de acceder a ella. |

Se mantuvo la respuesta HTTP 409 ante una inscripción duplicada
detectada por la restricción única de PostgreSQL.

## Evidencia

La configuración inicial quedó registrada en el commit `943b9d7`.
Las correcciones se registraron en un commit separado para permitir
comparar el código antes y después.

## Resultado final

Se actualizó ESLint de la versión 9 a la 10 para resolver el aviso
de fin de soporte.

Verificación realizada con Node 24.14.1:

- `npm run lint`: sin errores ni advertencias.
- `npm run build`: compilación correcta.

ESLint 10 admite Node 20 desde 20.19, Node 22 desde 22.13,
y Node 24 o superior.

## Limitaciones y pendientes

- El análisis está limitado a `src/`; no incluye el frontend de `public/`.
- Se utilizan reglas recomendadas sin análisis basado en información de tipos.
- Que ESLint no encuentre errores no garantiza que las reglas de negocio,
  las consultas SQL o la concurrencia funcionen correctamente.
- Las pruebas automatizadas y la comprobación manual complementan el análisis.

- La auditoría inicial reportó 4 vulnerabilidades. Se ejecutó
  `npm audit fix` sin `--force`, que actualizó 4 paquetes.
  La auditoría posterior reportó 0 vulnerabilidades.
  Después de la actualización, lint y compilación pasaron correctamente.
  Este resultado no garantiza la ausencia de vulnerabilidades desconocidas.