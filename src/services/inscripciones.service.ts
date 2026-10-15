import { pool } from '../db';
import { ReglaNegocioError } from '../errors';
import { CrearInscripcionDTO, Inscripcion } from '../types/inscripcion';

const esIdValido = (valor: unknown): valor is number =>
    Number.isInteger(valor) && (valor as number) > 0;

export class InscripcionesService {
    
    async inscribir(datos: CrearInscripcionDTO): Promise<Inscripcion> {
        const alumnoId = Number(datos?.alumno_id);
        const claseId = Number(datos?.clase_id);

        if (!esIdValido(alumnoId) || !esIdValido(claseId)) {
            throw new ReglaNegocioError(
                'alumno_id y clase_id deben ser números enteros positivos.',
                400,
            );
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // 1. Bloqueo de la clase: serializa las inscripciones concurrentes.
            const claseRes = await client.query(
                'SELECT id, estado, inicio, cupo FROM clase WHERE id = $1 FOR UPDATE',
                [claseId],
            );
            if (claseRes.rowCount === 0) {
                throw new ReglaNegocioError(`No existe la clase ${claseId}.`, 404);
            }
            const clase = claseRes.rows[0];

            // 2. El alumno debe existir.
            const alumnoRes = await client.query('SELECT id FROM alumno WHERE id = $1', [alumnoId]);
            if (alumnoRes.rowCount === 0) {
                throw new ReglaNegocioError(`No existe el alumno ${alumnoId}.`, 404);
            }

            // 3. Estado de la clase: solo se puede anotar a clases programadas.
            if (clase.estado === 'cancelada') {
                throw new ReglaNegocioError('La clase fue cancelada: no admite inscripciones.', 409);
            }
            if (clase.estado === 'finalizada') {
                throw new ReglaNegocioError('La clase ya finalizó: no admite inscripciones.', 409);
            }

            // 4. Clase ya iniciada (aunque su estado todavía figure como 'programada').
            if (new Date(clase.inicio) <= new Date()) {
                throw new ReglaNegocioError('La clase ya comenzó: no admite inscripciones.', 409);
            }

            // 5. Duplicado: el alumno ya tiene una inscripción activa en esta clase.
            const dupRes = await client.query(
                `SELECT 1 FROM inscripcion
            WHERE alumno_id = $1 AND clase_id = $2 AND estado = 'activa'`,
                [alumnoId, claseId],
            );
            if (dupRes.rowCount && dupRes.rowCount > 0) {
                throw new ReglaNegocioError('El alumno ya está inscripto en esta clase.', 409);
            }

            // 6. Cupo: se cuenta DESPUÉS de tomar el lock, por eso el número es confiable.
            const cupoRes = await client.query(
                `SELECT COUNT(*)::int AS ocupados FROM inscripcion
            WHERE clase_id = $1 AND estado = 'activa'`,
                [claseId],
            );
            if (cupoRes.rows[0].ocupados >= clase.cupo) {
                throw new ReglaNegocioError('La clase no tiene cupo disponible.', 409);
            }

            // 7. Alta.
            const insertRes = await client.query(
                `INSERT INTO inscripcion (alumno_id, clase_id, estado)
            VALUES ($1, $2, 'activa')
         RETURNING *`,
                [alumnoId, claseId],
            );

            await client.query('COMMIT');
            return insertRes.rows[0];
        } catch (error: any) {
            await client.query('ROLLBACK');

            // Red de seguridad: si algo esquivó el chequeo 5, el índice único parcial
            // de la base lo frena (23505 = unique_violation).
            if (error?.code === '23505') {
                throw new ReglaNegocioError('El alumno ya está inscripto en esta clase.', 409);
            }
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Cancela una inscripción (baja lógica: queda en el historial).
     * Solo se puede cancelar mientras la clase no haya comenzado.
     */
    async cancelar(id: number): Promise<Inscripcion> {
        if (!esIdValido(id)) {
            throw new ReglaNegocioError('El ID de la inscripción debe ser un número válido.', 400);
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Se bloquea la inscripción para que dos cancelaciones simultáneas
            // no pasen ambas el chequeo de estado.
            const res = await client.query(
                `SELECT i.estado, c.inicio
            FROM inscripcion i
            JOIN clase c ON c.id = i.clase_id
            WHERE i.id = $1
            FOR UPDATE OF i`,
                [id],
            );
            if (res.rowCount === 0) {
                throw new ReglaNegocioError(`No existe la inscripción ${id}.`, 404);
            }
            const { estado, inicio } = res.rows[0];

            if (estado === 'cancelada') {
                throw new ReglaNegocioError('La inscripción ya estaba cancelada.', 409);
            }
            if (new Date(inicio) <= new Date()) {
                throw new ReglaNegocioError('La clase ya comenzó: no se puede cancelar la inscripción.', 409);
            }

            const upd = await client.query(
                `UPDATE inscripcion
            SET estado = 'cancelada', cancelada_en = NOW()
            WHERE id = $1
            RETURNING *`,
                [id],
            );

            await client.query('COMMIT');
            return upd.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Lista inscripciones con filtros opcionales (alumno, clase, estado).
     */
    async listar(filtros: { alumnoId?: number; claseId?: number; estado?: string }) {
        const condiciones: string[] = [];
        const params: unknown[] = [];

        if (filtros.alumnoId) {
            params.push(filtros.alumnoId);
            condiciones.push(`i.alumno_id = $${params.length}`);
        }
        if (filtros.claseId) {
            params.push(filtros.claseId);
            condiciones.push(`i.clase_id = $${params.length}`);
        }
        if (filtros.estado === 'activa' || filtros.estado === 'cancelada') {
            params.push(filtros.estado);
            condiciones.push(`i.estado = $${params.length}`);
        }

        const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

        const { rows } = await pool.query(
            `SELECT
            i.id, i.alumno_id, a.nombre AS alumno_nombre, a.apellido AS alumno_apellido,
            i.clase_id, c.nombre AS clase_nombre, c.inicio AS clase_inicio,
            i.fecha, i.estado, i.cancelada_en
        FROM inscripcion i
        JOIN alumno a ON a.id = i.alumno_id
        JOIN clase c ON c.id = i.clase_id
        ${where}
        ORDER BY i.fecha DESC`,
            params,
        );
        return rows;
    }
}

export const inscripcionesService = new InscripcionesService();