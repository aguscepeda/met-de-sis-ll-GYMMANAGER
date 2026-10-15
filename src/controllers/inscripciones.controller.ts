import { Request, Response } from 'express';
import { ReglaNegocioError } from '../errors';
import { inscripcionesService } from '../services/inscripciones.service';

/**
 * Traduce errores de dominio a su código HTTP.
 * Cualquier otro error es inesperado: se registra y se responde 500
 * sin exponer detalles internos.
 */
function responderError(res: Response, error: unknown, mensajeGenerico: string): void {
    if (error instanceof ReglaNegocioError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
    }
    console.error(error);
    res.status(500).json({ error: mensajeGenerico });
}

export class InscripcionesController {
    async inscribir(req: Request, res: Response): Promise<void> {
        try {
            const inscripcion = await inscripcionesService.inscribir(req.body);
            res.status(201).json(inscripcion);
        } catch (error) {
            responderError(res, error, 'Error al crear la inscripción.');
        }
    }

    async cancelar(req: Request, res: Response): Promise<void> {
        try {
            const inscripcion = await inscripcionesService.cancelar(Number(req.params.id));
            res.status(200).json(inscripcion);
        } catch (error) {
            responderError(res, error, 'Error al cancelar la inscripción.');
        }
    }

    async listar(req: Request, res: Response): Promise<void> {
        try {
            const alumnoId = req.query.alumno_id ? Number(req.query.alumno_id) : undefined;
            const claseId = req.query.clase_id ? Number(req.query.clase_id) : undefined;
            const estado = typeof req.query.estado === 'string' ? req.query.estado : undefined;

            if ((alumnoId !== undefined && isNaN(alumnoId)) || (claseId !== undefined && isNaN(claseId))) {
                res.status(400).json({ error: 'alumno_id y clase_id deben ser números.' });
                return;
            }

            const inscripciones = await inscripcionesService.listar({ alumnoId, claseId, estado });
            res.status(200).json(inscripciones);
        } catch (error) {
            responderError(res, error, 'Error al listar las inscripciones.');
        }
    }
}

export const inscripcionesController = new InscripcionesController();