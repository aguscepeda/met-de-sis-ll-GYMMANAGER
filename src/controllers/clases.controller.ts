import { Request, Response } from 'express';
import { ReglaNegocioError } from '../errors';
import { clasesService } from '../services/clases.service';

/**
 * Las reglas de negocio responden con su propio código y mensaje.
 * Cualquier otro error (base caída, SQL inválido) es un 500 genérico:
 * su mensaje interno no se expone al cliente.
 */
function responderError(res: Response, error: unknown, mensajeGenerico: string): void {
  if (error instanceof ReglaNegocioError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ error: mensajeGenerico });
}

export class ClasesController {
  async crear(req: Request, res: Response): Promise<void> {
    try {
      const nuevaClase = await clasesService.crear(req.body);
      res.status(201).json(nuevaClase);
    } catch (error) {
      responderError(res, error, 'Error al crear la clase.');
    }
  }

  async listar(req: Request, res: Response): Promise<void> {
    try {
      const profesorId = req.query.profesor_id ? Number(req.query.profesor_id) : undefined;
      const clases = await clasesService.listar(profesorId);
      res.status(200).json(clases);
    } catch (error) {
      responderError(res, error, 'Error al listar las clases.');
    }
  }

  async obtenerPorId(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'El ID de la clase debe ser un número válido.' });
        return;
      }

      const clase = await clasesService.obtenerPorId(id);
      if (!clase) {
        res.status(404).json({ error: 'Clase no encontrada.' });
        return;
      }

      res.status(200).json(clase);
    } catch (error) {
      responderError(res, error, 'Error al obtener la clase.');
    }
  }

  async finalizar(req: Request, res: Response): Promise<void> {
    try {
      const clase = await clasesService.finalizar(Number(req.params.id));
      res.status(200).json(clase);
    } catch (error) {
      responderError(res, error, 'Error al finalizar la clase.');
    }
  }

  async cancelar(req: Request, res: Response): Promise<void> {
    try {
      const clase = await clasesService.cancelar(Number(req.params.id));
      res.status(200).json(clase);
    } catch (error) {
      responderError(res, error, 'Error al cancelar la clase.');
    }
  }
}

export const clasesController = new ClasesController();
