import { pool } from '../db';
import { Clase, ClaseConProfesor, CrearClaseDTO } from '../types/clase';

export class ClasesService {
  /**
   * Crea una nueva clase validando reglas de negocio e integridad.
   */
  async crear(datos: CrearClaseDTO): Promise<Clase> {
    const { nombre, profesor_id, inicio, fin, cupo } = datos;

    // 1. Validación de nombre
    if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
      throw new Error('El nombre de la clase es obligatorio.');
    }

    // 2. Validación de cupo
    const cupoNumerico = Number(cupo);
    if (!Number.isInteger(cupoNumerico) || cupoNumerico <= 0) {
      throw new Error('El cupo debe ser un número entero mayor a 0.');
    }

    // 3. Validación de fechas y horarios
    const fechaInicio = new Date(inicio);
    const fechaFin = new Date(fin);

    if (isNaN(fechaInicio.getTime()) || isNaN(fechaFin.getTime())) {
      throw new Error('Las fechas de inicio y fin deben ser fechas válidas.');
    }

    if (fechaInicio >= fechaFin) {
      throw new Error('El horario de inicio debe ser anterior al horario de fin.');
    }

    // 4. Verificación de existencia del profesor
    const profResult = await pool.query('SELECT id FROM profesor WHERE id = $1', [profesor_id]);
    if (profResult.rowCount === 0) {
      throw new Error(`No existe un profesor con el identificador ${profesor_id}.`);
    }

    // 5. Inserción con estado por defecto 'programada'
    const query = `
      INSERT INTO clase (nombre, profesor_id, inicio, fin, cupo, estado)
      VALUES ($1, $2, $3, $4, $5, 'programada')
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      nombre.trim(),
      profesor_id,
      fechaInicio,
      fechaFin,
      cupoNumerico,
    ]);

    return rows[0];
  }

  /**
   * Obtiene todas las clases registradas con el nombre de su profesor.
   * Admite filtro opcional por profesor_id.
   */
  async listar(profesorId?: number): Promise<ClaseConProfesor[]> {
    let query = `
      SELECT 
        c.id,
        c.nombre,
        c.profesor_id,
        p.nombre AS profesor_nombre,
        p.especialidad AS profesor_especialidad,
        c.inicio,
        c.fin,
        c.cupo,
        c.estado
      FROM clase c
      JOIN profesor p ON c.profesor_id = p.id
    `;

    const params: unknown[] = [];

    if (profesorId && !isNaN(profesorId)) {
      query += ` WHERE c.profesor_id = $1`;
      params.push(profesorId);
    }

    query += ` ORDER BY c.inicio ASC;`;

    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Busca una clase por su ID.
   */
  async obtenerPorId(id: number): Promise<ClaseConProfesor | null> {
    const query = `
      SELECT 
        c.id,
        c.nombre,
        c.profesor_id,
        p.nombre AS profesor_nombre,
        p.especialidad AS profesor_especialidad,
        c.inicio,
        c.fin,
        c.cupo,
        c.estado
      FROM clase c
      JOIN profesor p ON c.profesor_id = p.id
      WHERE c.id = $1;
    `;

    const { rows } = await pool.query(query, [id]);
    return rows.length > 0 ? rows[0] : null;
  }
}

export const clasesService = new ClasesService();