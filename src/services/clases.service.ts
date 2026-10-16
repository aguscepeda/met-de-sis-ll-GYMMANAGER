import { PoolClient } from 'pg';
import { pool } from '../db';
import { ReglaNegocioError } from '../errors';
import { Clase, ClaseCancelada, ClaseConProfesor, CrearClaseDTO } from '../types/clase';

const esIdValido = (valor: unknown): valor is number =>
  Number.isInteger(valor) && (valor as number) > 0;

export class ClasesService {
  /**
   * Crea una nueva clase validando reglas de negocio e integridad.
   */
  async crear(datos: CrearClaseDTO): Promise<Clase> {
    const { nombre, inicio, fin, cupo } = datos ?? ({} as Partial<CrearClaseDTO>);
    const profesor_id = Number(datos?.profesor_id);

    // 1. Validación de nombre
    if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
      throw new ReglaNegocioError('El nombre de la clase es obligatorio.', 400);
    }

    // 2. Validación de cupo
    const cupoNumerico = Number(cupo);
    if (!Number.isInteger(cupoNumerico) || cupoNumerico <= 0) {
      throw new ReglaNegocioError('El cupo debe ser un número entero mayor a 0.', 400);
    }

    // 3. Validación de fechas y horarios
    const fechaInicio = new Date(inicio);
    const fechaFin = new Date(fin);

    if (isNaN(fechaInicio.getTime()) || isNaN(fechaFin.getTime())) {
      throw new ReglaNegocioError('Las fechas de inicio y fin deben ser fechas válidas.', 400);
    }

    if (fechaInicio >= fechaFin) {
      throw new ReglaNegocioError('El horario de inicio debe ser anterior al horario de fin.', 400);
    }

    // 4. Verificación de existencia del profesor
    if (!esIdValido(profesor_id)) {
      throw new ReglaNegocioError('profesor_id debe ser un número entero positivo.', 400);
    }

    const profResult = await pool.query('SELECT id FROM profesor WHERE id = $1', [profesor_id]);
    if (profResult.rowCount === 0) {
      throw new ReglaNegocioError(`No existe un profesor con el identificador ${profesor_id}.`, 400);
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

  /**
   * Pasa una clase de 'programada' a 'finalizada'.
   * Solo se permite cuando ya pasó su horario de fin.
   * Las inscripciones activas quedan como registro de quiénes asistieron.
   */
  async finalizar(id: number): Promise<Clase> {
    if (!esIdValido(id)) {
      throw new ReglaNegocioError('El ID de la clase debe ser un número válido.', 400);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const clase = await this.bloquearClaseProgramada(client, id, 'finalizar');

      if (new Date(clase.fin) > new Date()) {
        throw new ReglaNegocioError('La clase todavía no terminó: no se puede finalizar.', 409);
      }

      const { rows } = await client.query(
        `UPDATE clase SET estado = 'finalizada' WHERE id = $1 RETURNING *`,
        [id],
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Pasa una clase de 'programada' a 'cancelada'.
   * Solo se permite antes de que empiece. En la misma transacción se cancelan
   * las inscripciones activas, para que no queden alumnos anotados a una clase
   * que no se va a dictar.
   */
  async cancelar(id: number): Promise<ClaseCancelada> {
    if (!esIdValido(id)) {
      throw new ReglaNegocioError('El ID de la clase debe ser un número válido.', 400);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // El lock sobre la clase es el mismo que toma inscripcionesService.inscribir():
      // una inscripción concurrente espera y, al continuar, ve la clase cancelada.
      const clase = await this.bloquearClaseProgramada(client, id, 'cancelar');

      if (new Date(clase.inicio) <= new Date()) {
        throw new ReglaNegocioError('La clase ya comenzó: no se puede cancelar.', 409);
      }

      const inscripciones = await client.query(
        `UPDATE inscripcion
         SET estado = 'cancelada', cancelada_en = NOW()
         WHERE clase_id = $1 AND estado = 'activa'`,
        [id],
      );

      const { rows } = await client.query(
        `UPDATE clase SET estado = 'cancelada' WHERE id = $1 RETURNING *`,
        [id],
      );

      await client.query('COMMIT');
      return { ...rows[0], inscripciones_canceladas: inscripciones.rowCount ?? 0 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Bloquea la fila de la clase hasta el fin de la transacción y verifica que
   * siga 'programada'. Finalizada y cancelada son estados terminales.
   */
  private async bloquearClaseProgramada(
    client: PoolClient,
    id: number,
    accion: string,
  ): Promise<Clase> {
    const { rows } = await client.query('SELECT * FROM clase WHERE id = $1 FOR UPDATE', [id]);

    if (rows.length === 0) {
      throw new ReglaNegocioError(`No existe la clase ${id}.`, 404);
    }

    const clase: Clase = rows[0];

    if (clase.estado !== 'programada') {
      throw new ReglaNegocioError(
        `La clase ya está ${clase.estado}: no se puede ${accion}.`,
        409,
      );
    }

    return clase;
  }
}

export const clasesService = new ClasesService();