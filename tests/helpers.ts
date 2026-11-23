import { pool } from '../src/db';

/**
 * Devuelve una fecha ISO desplazada en horas desde el momento actual.
 * Evita fechas hardcodeadas que dejen de ser futuras con el paso del tiempo.
 */
export function fechaEnHoras(horas: number): string {
  return new Date(Date.now() + horas * 3600 * 1000).toISOString();
}

/**
 * Obtiene un profesor y un alumno existentes de las semillas de sql/init.sql.
 */
export async function obtenerDatosSemilla(): Promise<{
  profesorId: number;
  alumnoId: number;
}> {
  const [profRes, alumRes] = await Promise.all([
    pool.query('SELECT id FROM profesor ORDER BY id ASC LIMIT 1'),
    pool.query('SELECT id FROM alumno ORDER BY id ASC LIMIT 1'),
  ]);

  if (profRes.rowCount === 0 || alumRes.rowCount === 0) {
    throw new Error(
      'Faltan datos semilla en PostgreSQL. Ejecutá sql/init.sql antes de correr npm test.',
    );
  }

  return {
    profesorId: profRes.rows[0].id,
    alumnoId: alumRes.rows[0].id,
  };
}

/**
 * Elimina únicamente las clases creadas durante los tests y sus inscripciones,
 * respetando ON DELETE RESTRICT y sin tocar las semillas ni otros registros.
 */
export async function limpiarClasesDePrueba(claseIds: number[]): Promise<void> {
  if (claseIds.length === 0) return;

  await pool.query('DELETE FROM inscripcion WHERE clase_id = ANY($1::int[])', [claseIds]);
  await pool.query('DELETE FROM clase WHERE id = ANY($1::int[])', [claseIds]);
}